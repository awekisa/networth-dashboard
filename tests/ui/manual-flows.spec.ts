import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('dashboard uses the Modern Fintech shell with filters and safe integration entry points', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Nworth')).toBeVisible();
  await expect(page.getByRole('navigation')).toContainText('Portfolio');
  await expect(page.getByRole('navigation')).toContainText('Holdings');
  await expect(page.getByRole('navigation')).toContainText('Integrations');
  await expect(page.getByRole('heading', { name: /net worth/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /30-day trend/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /allocation/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Holdings', exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter by account')).toBeVisible();
  await expect(page.getByLabel('Filter by asset class')).toBeVisible();
  await expect(page.getByLabel('Filter by currency')).toBeVisible();
  await expect(page.getByLabel('Filter by provider')).toBeVisible();
  await expect(page.getByText(/public addresses only/i).first()).toBeVisible();
  await expect(page.getByText(/No trading, no order placement/i).first()).toBeVisible();
});

test('integrations modal follows the Modern Fintech popup design', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /connect integration/i }).click();
  const modal = page.locator('#integrations');
  await expect(modal.getByRole('heading', { name: /integrations/i })).toBeVisible();
  await expect(modal).toContainText('All sources');
  await expect(modal).toContainText('Brokerages');
  await expect(modal).toContainText('Crypto');
  await expect(modal).toContainText('Banks & cash');
  await expect(modal).toContainText('CONNECTED');
  await expect(modal).toContainText('ADD NEW');
  await expect(modal).toContainText('Interactive Brokers');
  await expect(modal).toContainText('Ethereum address');
  await expect(modal.getByRole('button', { name: /sync ibkr flex now/i })).toBeVisible();
  await modal.getByRole('link', { name: /close integrations/i }).click();
  await expect(page).not.toHaveURL(/#integrations$/);
});

test('can create a manual account and then use it for a cash balance', async ({ page }) => {
  await page.goto('/');
  const accountName = `Playwright Cash ${Date.now()}`;
  try {
    const accountCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: /add manual account/i }) });
    await accountCard.getByRole('textbox', { name: 'Account name', exact: true }).fill(accountName);
    await accountCard.getByLabel('Provider').selectOption('manual-provider');
    await accountCard.getByLabel('Account type').fill('cash');
    await accountCard.getByLabel('Base currency').fill('EUR');
    await accountCard.getByRole('button', { name: /add manual account/i }).click();
    await expect(page.locator('.account-line').filter({ hasText: accountName })).toBeVisible();
    await expect(page.getByLabel('Cash account')).toContainText(accountName);
  } finally {
    await prisma.account.deleteMany({ where: { name: accountName } });
  }
});

test('top holdings show IBKR position details beyond name and quantity', async ({ page }) => {
  const suffix = Date.now();
  const providerId = `playwright-ibkr-provider-${suffix}`;
  const accountId = `playwright-ibkr-account-${suffix}`;
  const assetId = `playwright-ibkr-asset-${suffix}`;

  await prisma.provider.create({ data: { id: providerId, name: 'Interactive Brokers', type: 'broker-readonly-flex' } });
  await prisma.account.create({ data: { id: accountId, providerId, name: `IBKR Test ${suffix}`, type: 'broker', currency: 'EUR' } });
  await prisma.asset.create({ data: { id: assetId, name: `Playwright Detailed Position ${suffix}`, symbol: 'PWT', assetClass: 'EQUITY', currency: 'EUR' } });
  await prisma.holding.create({ data: { accountId, assetId, quantity: 7, unitPrice: 123.45, marketValue: 864.15, costBasis: 700, unrealizedPnl: 164.15, lastUpdatedAt: new Date('2026-05-24T10:00:00.000Z') } });

  try {
    await page.goto('/');
    const topHoldingsCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: /top holdings/i }) });
    const position = topHoldingsCard.locator(`[data-testid="top-holding-${assetId}"]`);
    await expect(position).toContainText(`Playwright Detailed Position ${suffix}`);
    await expect(position).toContainText('Qty: 7 PWT');
    await expect(position).toContainText('Unit: €123.45');
    await expect(position).toContainText('Value: €864.15');
    await expect(position).toContainText('Cost: €700.00');
    await expect(position).toContainText('P&L: €164.15');
    await expect(position).toContainText(`IBKR Test ${suffix}`);
  } finally {
    await prisma.holding.deleteMany({ where: { accountId } });
    await prisma.asset.deleteMany({ where: { id: assetId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.provider.deleteMany({ where: { id: providerId } });
  }
});
