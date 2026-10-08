import { test, expect, signInCustomer, getJson } from './customer-case-support.js';
import { saveCase, noHorizontalOverflow, screenshot, watchBrowser } from './support.js';

// Real compiled UI + the existing isolated synthetic HTTP/SQLite fixture.
// No route interception, source-site navigation, provider call or seeded answer.
test('official references across chat/materials/documents: bilingual keyboard disclosure, responsive layout and unchanged case evidence', async ({ page, customerApp: app }, testInfo) => {
  test.setTimeout(120000);
  const assertBrowserClean = await watchBrowser(page);
  await signInCustomer(page, app);
  const record = await saveCase(page, 'Synthetic official-reference case', { review: true });
  const original = (await getJson(page, app, `/api/cases/${record.id}`)).case;
  const readinessPath = `/api/cases/${record.id}/readiness?kind=followup&locale=en`;
  const readiness = await getJson(page, app, readinessPath);
  expect(original.fields.find(field => field.key === 'pha')).toMatchObject({ value: 'Synthetic Housing Office', confirmed: true });
  expect(readiness.ready).toBe(false);

  const mutations = [], externalRequests = [];
  page.on('request', request => {
    const { origin, pathname } = new URL(request.url());
    if (origin !== app.origin) externalRequests.push(request.url());
    // Navigation telemetry is allowed; references must never write business data.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && /^\/api\/(?:cases|clients|artifacts|assets|conversations)(?:\/|$)/u.test(pathname)) {
      mutations.push(`${request.method()} ${pathname}`);
    }
  });

  const panel = page.getByTestId('agency-guidance');
  const summary = panel.locator(':scope > summary');
  const select = panel.getByRole('combobox');
  const conditions = panel.locator('details');
  const conditionSummary = conditions.locator(':scope > summary');

  for (const language of ['zh', 'en']) {
    const zh = language === 'zh';
    await page.getByRole('button', { name: zh ? '切换界面为中文' : 'Switch interface to English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', zh ? 'zh-CN' : 'en');
    const views = [
      ['chat', zh ? '对话' : 'Conversation'],
      ['materials', zh ? "材料" : 'Materials & facts'],
      ['documents', zh ? '文档' : 'Documents']
    ];

    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
      for (const [view, label] of views) {
        await test.step(`${language} / ${width}px / ${view}: open, select, inspect, close`, async () => {
          const navigation = page.getByRole('navigation', { name: zh ? "页面导航" : 'Workspace navigation' });
          const tab = navigation.getByRole('button', { name: label, exact: true });
          await tab.focus();
          await page.keyboard.press('Enter');
          await expect(tab).toHaveAttribute('aria-current', 'page');
          await expect(tab).toBeFocused();
          if (view === 'chat') await expect(page.locator('[data-feature="chat"]')).toHaveAttribute('data-case-id',record.id);
          if (view === 'materials') await expect(page.getByLabel(zh ? "事项名称" : 'Case name', { exact: true })).toHaveValue(record.title);
          if (view === 'documents') await expect(page.getByLabel(zh ? "文档类型" : 'Document type', { exact: true })).toBeEnabled();

          if (width < 960) await page.getByRole('button', { name: zh ? "打开详情" : 'Open case context', exact: true }).click();
          await expect(panel).toBeVisible();
          await expect(panel).toHaveJSProperty('open', false);
          await expect(summary).toContainText(zh ? "官方参考" : 'Official source references');
          await expect(summary).toContainText(zh ? "是否适用待确认" : 'Applicability unconfirmed');
          await expect(select).toBeHidden();
          await noHorizontalOverflow(page);

          await summary.focus();
          await page.keyboard.press('Enter');
          await expect(panel).toHaveJSProperty('open', true);
          await expect(summary).toBeFocused();
          await expect(select).toHaveAccessibleName(zh ? "参考机构" : 'Reference agency (not confirmed for this case)');
          await page.keyboard.press('Tab');
          await expect(select).toBeFocused();
          await expect(select).toHaveValue('sfha');

          // Native keyboard selection changes the reference, never the confirmed PHA.
          await page.keyboard.press('ArrowDown');
          await expect(select).toHaveValue('unknown');
          await page.keyboard.press('ArrowDown');
          await expect(select).toHaveValue('oha');
          await expect(panel.getByRole('link').first()).toHaveAttribute('href', 'https://www.oakha.org/propertyowners/section8ownerforms/');
          await expect(panel.locator('a[href*="sfha.org"]')).toHaveCount(0);
          expect((await getJson(page, app, `/api/cases/${record.id}`)).case).toEqual(original);
          expect(await getJson(page, app, readinessPath)).toEqual(readiness);
          if (view === 'documents') await expect(page.getByTestId('documents-page').getByRole('button', { name: zh ? "生成文档" : 'Generate final document', exact: true })).toHaveCount(0);
          await noHorizontalOverflow(page);
          await page.keyboard.press('Home');
          await expect(select).toHaveValue('sfha');
          await expect(panel.getByRole('link')).toHaveCount(4);
          const firstSource = panel.getByRole('link').first();
          await page.keyboard.press('Tab');
          await expect(firstSource).toBeFocused();
          await expect(firstSource).toHaveAttribute('href', 'https://sfha.org/housing-programs/housing-choice-voucher-participants');
          await expect(firstSource).toHaveAttribute('target', '_blank');
          await expect(firstSource).toHaveAttribute('rel', /noreferrer/u);
          await expect(panel.locator('a[href="https://sfha.org/files/documents/52517ENG.pdf"]')).toBeVisible();
          await expect(panel).toContainText(zh ? "受理版本及本事项是否适用，尚未确认。" : 'Accepted edition and case applicability unconfirmed');
          await expect(panel).toContainText(zh ? '不得修改表格上的日期。' : 'do not change the printed date');
          await expect(panel).toContainText('2026-10-07');

          // Four source links lead to the nested conditions using the real Tab order.
          for (let index = 0; index < 4; index++) await page.keyboard.press('Tab');
          await expect(conditionSummary).toBeFocused();
          await expect(conditions).toHaveJSProperty('open', false);
          await page.keyboard.press('Space');
          await expect(conditions).toHaveJSProperty('open', true);
          await expect(conditionSummary).toBeFocused();
          await expect(conditions.getByRole('listitem').last()).toBeVisible();
          await expect(conditions).toContainText(zh ? '不能视为每宗新租约必填' : 'do not treat it as universal for a new lease');
          await noHorizontalOverflow(page);
          await screenshot(page, testInfo, `official-reference-${width}-${language}-${view}-expanded`);

          await page.keyboard.press('Enter');
          await expect(conditions).toHaveJSProperty('open', false);
          await summary.focus();
          await page.keyboard.press('Space');
          await expect(panel).toHaveJSProperty('open', false);
          await expect(summary).toBeFocused();
          await expect(select).toBeHidden();
          await page.keyboard.press('Tab');
          await expect(panel.locator(':focus')).toHaveCount(0);
          await noHorizontalOverflow(page);
          expect((await getJson(page, app, `/api/cases/${record.id}`)).case).toEqual(original);
          expect(await getJson(page, app, readinessPath)).toEqual(readiness);
          if (width < 960) await page.keyboard.press('Escape');
          expect(mutations, 'Reference-only interactions must not write case/customer/document/material/conversation data').toEqual([]);
        });
      }
    }
  }
  expect((await getJson(page, app, `/api/cases/${record.id}/artifacts`)).artifacts).toEqual([]);
  expect((await getJson(page, app, `/api/cases/${record.id}/conversations`)).conversations).toEqual([]);
  expect(externalRequests, 'Opening references must not automatically fetch or navigate to official sites').toEqual([]);
  await assertBrowserClean();
});
