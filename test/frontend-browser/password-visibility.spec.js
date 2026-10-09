import { test, expect, registerForm } from './email-support.js';
import { noHorizontalOverflow, watchBrowser } from './support.js';

// Only disposable fixture passwords; never records a real enrollment or inbox.
test.use({ trace: 'off' });
for (const lang of ['en', 'zh']) test(`registration eye controls: touch target, keyboard, independent values and no submit (${lang})`, async ({ page, emailApp }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const clean = await watchBrowser(page), posts = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  await registerForm(page, emailApp, 'visibility@example.invalid');
  if (lang === 'zh') await page.getByRole('button', { name: '切换界面为中文', exact: true }).click();
  const password = page.locator('input[name=password]'), confirmation = page.locator('input[name=passwordConfirmation]');
  for (const [field, other, show, hide] of [
    [password, confirmation, lang === 'en' ? 'Show password' : '显示密码', lang === 'en' ? 'Hide password' : '隐藏密码'],
    [confirmation, password, lang === 'en' ? 'Show confirmation password' : "显示确认密码", lang === 'en' ? 'Hide confirmation password' : "隐藏确认密码"]
  ]) {
    const toggle = page.getByRole('button', { name: show, exact: true });
    const value = await field.inputValue(), box = await toggle.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(toggle.locator('svg.lucide-eye')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-controls', await field.getAttribute('id'));
    await toggle.click();
    const revealed = page.getByRole('button', { name: hide, exact: true });
    await expect(field).toHaveAttribute('type', 'text'); await expect(other).toHaveAttribute('type', 'password');
    await expect(field).toHaveValue(value); await expect(revealed).toHaveAttribute('aria-pressed', 'true');
    await expect(revealed.locator('svg.lucide-eye-off')).toBeVisible();
    await expect(revealed).toBeFocused();
    await revealed.press('Space'); await expect(field).toHaveAttribute('type', 'password');
    await toggle.press('Enter'); await expect(field).toHaveAttribute('type', 'text');
    await revealed.press('Enter'); await expect(field).toHaveAttribute('type', 'password');
    await expect(field).toHaveValue(value);
  }
  expect(posts).toEqual([]);
  await noHorizontalOverflow(page); await clean();
});
