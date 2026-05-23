import { describe, expect, it } from 'vitest';
import { aggregatePortfolio, createPortfolioSnapshot } from '@/lib/portfolio/aggregation';

describe('portfolio aggregation', () => {
  it('subtracts manual liabilities and groups allocation by asset class and currency', () => {
    const result = aggregatePortfolio({
      baseCurrency: 'EUR',
      fxRates: { USD: 0.9, EUR: 1 },
      holdings: [{ name: 'Bitcoin', symbol: 'BTC', provider: 'manual', account: 'Cold', assetClass: 'CRYPTO', currency: 'USD', quantity: 1, unitPrice: 100000, marketValue: 100000, lastUpdatedAt: '2026-01-01T00:00:00Z' }],
      manualAssets: [{ name: 'Cash', assetClass: 'CASH', currency: 'EUR', quantity: 1, unitPrice: 5000 }],
      manualLiabilities: [{ name: 'Mortgage', currency: 'EUR', amount: 20000 }]
    });
    expect(result.totalNetWorth).toBe(75000);
    expect(result.allocationByAssetClass.CRYPTO).toBe(90000);
    expect(result.allocationByCurrency.USD).toBe(90000);
    expect(result.liabilitiesValue).toBe(20000);
  });

  it('creates immutable historical snapshots from aggregation output', () => {
    const agg = aggregatePortfolio({ baseCurrency: 'EUR', fxRates: { EUR: 1 }, holdings: [], manualAssets: [{ name: 'Cash', assetClass: 'CASH', currency: 'EUR', quantity: 1, unitPrice: 10 }], manualLiabilities: [] });
    const snapshot = createPortfolioSnapshot(agg, '2026-01-01T00:00:00Z');
    expect(snapshot.totalNetWorth).toBe(10);
    expect(snapshot.capturedAt).toBe('2026-01-01T00:00:00Z');
  });
});
