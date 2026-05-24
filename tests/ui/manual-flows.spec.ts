import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('dashboard applies the Modern Fintech visual design tokens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto('/');

  const tokens = await page.evaluate(() => {
    const styles = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const computed = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        background: computed.backgroundColor,
        borderColor: computed.borderColor,
        borderRadius: computed.borderRadius,
        boxShadow: computed.boxShadow,
        display: computed.display,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        gridTemplateColumns: computed.gridTemplateColumns,
        height: rect.height,
      };
    };

    return {
      body: getComputedStyle(document.body).backgroundColor,
      topbar: styles('.topbar'),
      heroGrid: styles('.hero-grid'),
      heroMetric: styles('.hero-metric'),
      panel: styles('.panel'),
      holdingsCard: styles('.holdings-card'),
      modalBackdrop: styles('.modal-backdrop'),
    };
  });

  expect(tokens.body).toBe('rgb(255, 255, 255)');
  expect(tokens.topbar.background).toBe('rgba(0, 0, 0, 0)');
  expect(tokens.topbar.boxShadow).toBe('none');
  expect(tokens.heroGrid.gridTemplateColumns.split(' ').length).toBe(3);
  expect(parseFloat(tokens.heroMetric.fontSize)).toBeGreaterThanOrEqual(40);
  expect(parseFloat(tokens.heroMetric.fontSize)).toBeLessThanOrEqual(52);
  expect(tokens.panel.background).toBe('rgba(0, 0, 0, 0)');
  expect(tokens.panel.boxShadow).toBe('none');
  expect(tokens.holdingsCard.background).toBe('rgb(255, 255, 255)');
  expect(parseFloat(tokens.holdingsCard.borderRadius)).toBeGreaterThanOrEqual(24);
  expect(tokens.modalBackdrop.display).toBe('none');
});

test('dashboard uses only the Modern Fintech shell and safe integration entry points', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Nworth')).toBeVisible();
  await expect(page.getByRole('navigation')).toContainText('Portfolio');
  await expect(page.getByRole('navigation')).toContainText('Holdings');
  await expect(page.getByRole('navigation')).toContainText('Integrations');
  await expect(page.getByRole('navigation')).not.toContainText('Manual entry');
  await expect(page.getByRole('navigation')).not.toContainText('Audit');
  await expect(page.getByRole('heading', { name: /net worth/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /30-day trend/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /allocation/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Holdings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /top holdings/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /currency exposure/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /account breakdown/i })).toHaveCount(0);
  await expect(page.locator('.filters-panel')).toHaveCount(0);
  await expect(page.getByText(/local-first, public addresses only/i)).toHaveCount(0);
  await expect(page.getByLabel('Filter by account')).toHaveCount(0);
  await expect(page.getByLabel('Filter by asset class')).toHaveCount(0);
  await expect(page.getByLabel('Filter by currency')).toHaveCount(0);
  await expect(page.getByLabel('Filter by provider')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /add manual account/i })).toBeHidden();
  await expect(page.getByRole('heading', { name: /add manual asset/i })).toBeHidden();
  await expect(page.getByRole('heading', { name: /recent audit log/i })).toBeHidden();
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
  await expect(modal.getByRole('heading', { name: /add manual account/i })).toBeVisible();
  await expect(modal.getByRole('heading', { name: /add manual asset/i })).toBeVisible();
  await expect(modal.getByRole('heading', { name: /recent audit log/i })).toBeVisible();
  await expect(modal.getByRole('button', { name: /sync ibkr flex now/i })).toBeVisible();
  await modal.getByRole('link', { name: /close integrations/i }).click();
  await expect(page).not.toHaveURL(/#integrations$/);
});

test('crypto address setup exposes supported networks and env configuration guidance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /connect integration/i }).click();
  const modal = page.locator('#integrations');

  await expect(modal.getByText('Bitcoin address')).toBeVisible();
  await expect(modal.getByText('Ethereum address')).toBeVisible();
  await expect(modal.getByText('Solana address')).toBeVisible();
  await expect(modal.getByText('Sui address')).toBeVisible();
  await expect(modal.getByText(/CRYPTO_PUBLIC_ADDRESSES/).first()).toBeVisible();
  await expect(modal.getByText(/Configured crypto addresses/)).toBeVisible();
});

test('desktop dashboard does not look browser-zoomed at 1024px wide', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');

  const layout = await page.evaluate(() => {
    const hero = document.querySelector('.hero-grid');
    const metric = document.querySelector('.hero-metric');
    const holdings = document.querySelector('#holdings');
    if (!hero || !metric || !holdings) throw new Error('Missing dashboard landmarks');
    return {
      heroColumns: getComputedStyle(hero).gridTemplateColumns.split(' ').length,
      metricFontSize: parseFloat(getComputedStyle(metric).fontSize),
      holdingsTop: holdings.getBoundingClientRect().top,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(layout.heroColumns).toBe(3);
  expect(layout.metricFontSize).toBeLessThanOrEqual(44);
  expect(layout.holdingsTop).toBeLessThan(410);
  expect(layout.overflow).toBeLessThanOrEqual(1);
});

test('dashboard and integrations modal fit within common screen sizes', async ({ page }) => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${viewport.width}px dashboard should not horizontally overflow`).toBeLessThanOrEqual(1);

    await page.getByRole('link', { name: /connect integration/i }).click();
    const modalBounds = await page.locator('.integrations-modal').boundingBox();
    expect(modalBounds, 'modal should be visible').not.toBeNull();
    expect(modalBounds!.x).toBeGreaterThanOrEqual(0);
    expect(modalBounds!.y).toBeGreaterThanOrEqual(0);
    expect(modalBounds!.x + modalBounds!.width, `${viewport.width}px modal should fit horizontally`).toBeLessThanOrEqual(viewport.width + 1);
    expect(modalBounds!.y + modalBounds!.height, `${viewport.width}px modal should fit vertically`).toBeLessThanOrEqual(viewport.height + 1);

    const modalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(modalOverflow, `${viewport.width}px modal should not horizontally overflow`).toBeLessThanOrEqual(1);
    await page.locator('#integrations').getByRole('link', { name: /close integrations/i }).click();
  }
});

test('can create a manual account and then use it for a cash balance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /connect integration/i }).click();
  const modal = page.locator('#integrations');
  const accountName = `Playwright Cash ${Date.now()}`;
  try {
    const accountCard = modal.locator('.card').filter({ has: page.getByRole('heading', { name: /add manual account/i }) });
    await accountCard.getByRole('textbox', { name: 'Account name', exact: true }).fill(accountName);
    await accountCard.getByLabel('Provider').selectOption('manual-provider');
    await accountCard.getByLabel('Account type').fill('cash');
    await accountCard.getByLabel('Base currency').fill('EUR');
    await accountCard.getByRole('button', { name: /add manual account/i }).click();
    await page.getByRole('link', { name: /connect integration/i }).click();
    const refreshedModal = page.locator('#integrations');
    await expect(refreshedModal.locator('.integration-row').filter({ hasText: accountName })).toBeVisible();
    await expect(refreshedModal.getByLabel('Cash account')).toContainText(accountName);
  } finally {
    await prisma.account.deleteMany({ where: { name: accountName } });
  }
});

test('holdings table shows IBKR position details without old summary widgets', async ({ page }) => {
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
    await expect(page.getByRole('heading', { name: /top holdings/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /currency exposure/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /account breakdown/i })).toHaveCount(0);

    const row = page.getByRole('row').filter({ hasText: `Playwright Detailed Position ${suffix}` });
    await expect(row).toBeVisible();
    await expect(row).toContainText('PWT');
    await expect(row).toContainText('7');
    await expect(row).toContainText('€123.45');
    await expect(row).toContainText('€864.15');
    await expect(row).toContainText('€164.15');
    await expect(row).toContainText(`IBKR Test ${suffix}`);
  } finally {
    await prisma.holding.deleteMany({ where: { accountId } });
    await prisma.asset.deleteMany({ where: { id: assetId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.provider.deleteMany({ where: { id: providerId } });
  }
});
