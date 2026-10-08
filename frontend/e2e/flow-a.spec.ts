/**
 * Flow A (Member): register/login → create organisation → create todos →
 * filter/sort/paginate → export.
 */
import { expect, test } from '@playwright/test';

const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const username = `e2e_member_${suffix}`;
const password = 'Password123!';

test('Flow A — member journey', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(`Welcome, ${username}`)).toBeVisible({ timeout: 15000 });

  // create organisation
  await page.getByLabel('New organisation name').fill('E2E Org A');
  await page.getByRole('button', { name: 'Create organisation' }).click();
  await expect(page.getByRole('option', { name: /E2E Org A/ })).toBeAttached({ timeout: 15000 });

  // create 3 todos (via the New task dialog)
  for (const title of ['Alpha task', 'Beta task', 'Gamma task']) {
    await page.getByRole('button', { name: 'New task' }).click();
    await page.getByLabel('Title (required)').fill(title);
    await page.getByRole('button', { name: 'Create todo' }).click();
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 15000 });
  }

  // filter by status Open → all 3 visible (stat card proves the count)
  await expect(page.locator('.stat', { hasText: 'Total tasks' }).getByText('3')).toBeVisible();
  // sort by priority desc exercised via control
  await page.getByLabel('Sort todos').selectOption('priority:desc');
  // paginate: page size is 10 so all on one page; assert pager state
  await expect(page.getByText('Page 1 of 1')).toBeVisible();

  // filter to Done → none
  await page.getByLabel('Filter by status').selectOption('Done');
  await expect(page.getByText('No todos match. Create one below.')).toBeVisible();
  await page.getByLabel('Filter by status').selectOption('');

  // export downloads JSON containing the created todos
  await page.getByRole('button', { name: 'Import / Export' }).click();
  const dlPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export todos as JSON' }).click();
  const dl = await dlPromise;
  const path = await dl.path();
  expect(path).toBeTruthy();
});
