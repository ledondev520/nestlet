import { test, expect } from '@playwright/test';
import { ENTRY_PATH, register, navigate, saveCase, openSavedCase, watchBrowser, noHorizontalOverflow, screenshot } from './support.js';

for (const language of ['zh', 'en']) {
  test(`real account pages at 320 and 390 px in ${language}: layout, keyboard focus, navigation, strict CSP`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    const assertBrowserClean = await watchBrowser(page);
    const title = `Synthetic-long-${'case-reference-'.repeat(6)}`;
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(ENTRY_PATH);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await noHorizontalOverflow(page);
    await register(page, `synthetic-mobile-${language}`);
    await saveCase(page, title, { review: true });
    await navigate(page, 'Customers');
    await expect(page.getByRole('button', { name: `Open saved case: ${title}`, exact: true })).toBeVisible();

    // Core customer form focus/return is checked in the real product, not only #components.
    const addCustomer = page.getByRole('button', { name: 'New customer', exact: true });
    await addCustomer.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Customer label', { exact: true })).toBeFocused();
    await page.getByLabel('Customer label', { exact: true }).fill('Synthetic unsaved customer');
    const form = page.getByRole('form', { name: 'New customer', exact: true });
    await form.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
    await expect(addCustomer).toBeFocused();
    expect((await (await page.request.get('/api/clients')).json()).clients).toEqual([]);
    await openSavedCase(page, title);

    const zh = language === 'zh';
    if (zh) await page.getByRole('button', { name: '切换界面为中文', exact: true }).click();
    const navName = zh ? '工作区导航' : 'Workspace navigation';
    const labels = zh ? ['对话', '材料与事实', '客户库', '文档'] : ['Conversation', 'Materials & facts', 'Customers', 'Documents'];
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const label of labels) {
        const button = page.getByRole('navigation', { name: navName }).getByRole('button', { name: label, exact: true });
        await button.focus();
        await page.keyboard.press('Enter');
        await expect(button).toHaveAttribute('aria-current', 'page');
        const activeSection = page.locator('main > section:not([hidden])');
        await expect(activeSection).toBeVisible();
        // Wait for the real per-page API reads, then assess the rendered content.
        if (label === (zh ? '材料与事实' : 'Materials & facts')) await expect(page.getByLabel(zh ? '案例名称' : 'Case name', { exact: true })).toHaveValue(title);
        if (label === (zh ? '客户库' : 'Customers')) await expect(page.getByRole('button', { name: `${zh ? '打开已保存事项' : 'Open saved case'}: ${title}`, exact: true })).toBeVisible();
        if (label === (zh ? '文档' : 'Documents')) await expect(page.getByLabel(zh ? '文书类型' : 'Document type', { exact: true })).toBeEnabled();
        await noHorizontalOverflow(page);
        await screenshot(page, testInfo, `mobile-${width}-${language}-${['chat', 'materials', 'archive', 'documents'][labels.indexOf(label)]}`);
      }
    }

    // Browser history must restore the selected tab without resetting saved material.
    await page.goBack();
    await expect(page.getByRole('navigation', { name: navName }).getByRole('button', { name: zh ? '客户库' : 'Customers', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.goForward();
    await expect(page.getByRole('navigation', { name: navName }).getByRole('button', { name: zh ? '文档' : 'Documents', exact: true })).toHaveAttribute('aria-current', 'page');
    await assertBrowserClean();
  });
}
