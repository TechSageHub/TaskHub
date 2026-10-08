/**
 * Flow B (OrgAdmin): add member → change role → view audit log →
 * soft delete + restore → import with rejection report.
 */
import { expect, test } from '@playwright/test';

const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const admin = `e2e_admin_${suffix}`;
const member = `e2e_memberb_${suffix}`;
const password = 'Password123!';

async function register(page: import('@playwright/test').Page, username: string) {
  await page.goto('/');
  // if already signed in from a previous run in this context, log out first
  if (await page.getByRole('button', { name: 'Log out' }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Log out' }).click();
  }
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible({ timeout: 15000 });
}

test('Flow B — org admin journey', async ({ page, context }) => {
  test.setTimeout(120_000);
  await register(page, admin);
  await page.getByLabel('New organisation name').fill('E2E Org B');
  await page.getByRole('button', { name: 'Create organisation' }).click();
  await expect(page.getByRole('option', { name: /E2E Org B/ })).toBeAttached({ timeout: 15000 });

  // register the future member in a second context (separate session)
  const ctx2 = await context.browser()!.newContext();
  const page2 = await ctx2.newPage();
  await register(page2, member);
  await page2.close();
  await ctx2.close();

  // add member
  await page.getByRole('button', { name: 'Members' }).click();
  await page.getByLabel('Username to add').fill(member);
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByText(new RegExp(`${member} — Member`))).toBeVisible({ timeout: 15000 });

  // change role to OrgAdmin and back to Member
  await page.getByRole('button', { name: `Make ${member} OrgAdmin` }).click();
  await expect(page.getByText(new RegExp(`${member} — OrgAdmin`))).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: `Make ${member} Member` }).click();
  await expect(page.getByText(new RegExp(`${member} — Member`))).toBeVisible({ timeout: 15000 });

  // audit log visible to admin
  await page.getByRole('button', { name: 'Audit log' }).click();
  await expect(page.getByText('org.member_added')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('org.role_changed').first()).toBeVisible();
  await expect(page.getByText('org.role_changed')).toHaveCount(2); // promote + demote

  // create a todo, soft delete, restore
  await page.getByRole('button', { name: 'Todos' }).click();
  await page.getByLabel('Title (required)').fill('Restore me');
  await page.getByRole('button', { name: 'Create todo' }).click();
  await expect(page.getByText('Restore me').first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Delete Restore me', exact: true }).click();
  await expect(page.getByText('No todos match. Create one below.')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Show deleted').check();
  await expect(page.getByRole('button', { name: 'Restore Restore me' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Restore Restore me' }).click();
  await page.getByLabel('Show deleted').uncheck();
  await expect(page.getByText('Restore me').first()).toBeVisible({ timeout: 15000 });

  // import with one good row and one bad row → rejection report
  await page.getByRole('button', { name: 'Import / Export' }).click();
  const payload = JSON.stringify({
    items: [
      { clientProvidedId: `e2e-good-${suffix}`, title: 'Imported ok', status: 'Open', priority: 'Low', tags: ['e2e'] },
      { clientProvidedId: `e2e-bad-${suffix}`, title: '', status: 'Bogus', tags: ['bad tag!'] },
    ],
  });
  await page.getByLabel('Paste export JSON to import').fill(payload);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/Accepted: 1.*Rejected: 1/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Row 1:/)).toBeVisible();
});
