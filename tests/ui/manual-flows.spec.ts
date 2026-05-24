import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

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
  try {
    const accountCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: /add manual account/i }) });
    await accountCard.getByRole('textbox', { name: 'Account name', exact: true }).fill(accountName);
    await accountCard.getByLabel('Provider').selectOption('manual-provider');
    await accountCard.getByLabel('Account type').fill('cash');
    await accountCard.getByLabel('Base currency').fill('EUR');
    await accountCard.getByRole('button', { name: /add manual account/i }).click();
    await expect(page.getByText(new RegExp(accountName)).first()).toBeVisible();
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
