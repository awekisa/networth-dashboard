import { expect, test } from '@playwright/test';

test('dashboard exposes account onboarding and safe integration choices', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /local net worth dashboard/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /connect accounts/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /add manual account/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /add ethereum public address/i })).toBeVisible();
  await expect(page.getByText(/public addresses only/i).first()).toBeVisible();
  const ibkrCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: /interactive brokers/i }) });
  await expect(ibkrCard).toContainText(/read-only Flex Web Service sync/i);
  await expect(ibkrCard).toContainText(/No trading, no order placement/i);
  await expect(ibkrCard.getByRole('button', { name: /sync ibkr flex now/i })).toBeVisible();
  const fidelityCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: /fidelity/i }) });
  await expect(fidelityCard).toContainText(/CSV export or manual entry/i);
  await expect(fidelityCard).toContainText(/No credential scraping/i);
});

test('can create a manual account and then use it for a cash balance', async ({ page }) => {
  await page.goto('/');
  const accountName = `Playwright Cash ${Date.now()}`;
  const accountCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: /add manual account/i }) });
  await accountCard.getByRole('textbox', { name: 'Account name', exact: true }).fill(accountName);
  await accountCard.getByLabel('Provider').selectOption('manual-provider');
  await accountCard.getByLabel('Account type').fill('cash');
  await accountCard.getByLabel('Base currency').fill('EUR');
  await accountCard.getByRole('button', { name: /add manual account/i }).click();
  await expect(page.getByText(new RegExp(accountName)).first()).toBeVisible();
  await expect(page.getByLabel('Cash account')).toContainText(accountName);
});
