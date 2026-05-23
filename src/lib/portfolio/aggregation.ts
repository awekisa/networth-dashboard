import type { AggregationInput, ManualAssetInput, NormalizedHolding, PortfolioAggregation, PortfolioSnapshotRecord } from './types';

function roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function fx(currency: string, rates: Record<string, number>): number { return rates[currency] ?? 1; }
function marketValueOf(holding: Pick<NormalizedHolding, 'quantity' | 'unitPrice' | 'marketValue'>): number { return holding.marketValue ?? holding.quantity * (holding.unitPrice ?? 0); }
function manualAssetToHolding(asset: ManualAssetInput): NormalizedHolding {
  return { name: asset.name, symbol: asset.symbol, provider: asset.provider ?? 'manual', account: asset.accountName ?? 'Manual', assetClass: asset.assetClass, currency: asset.currency, quantity: asset.quantity, unitPrice: asset.unitPrice, marketValue: asset.quantity * asset.unitPrice, costBasis: asset.costBasis, unrealizedPnl: asset.costBasis === undefined ? undefined : asset.quantity * asset.unitPrice - asset.costBasis, lastUpdatedAt: new Date().toISOString() };
}

export function aggregatePortfolio(input: AggregationInput): PortfolioAggregation {
  const holdings = [...input.holdings, ...input.manualAssets.map(manualAssetToHolding)];
  const allocationByAssetClass: Record<string, number> = {};
  const allocationByCurrency: Record<string, number> = {};
  let totalAssetsValue = 0;
  for (const holding of holdings) {
    const valueInBase = marketValueOf(holding) * fx(holding.currency, input.fxRates);
    totalAssetsValue += valueInBase;
    allocationByAssetClass[holding.assetClass] = roundMoney((allocationByAssetClass[holding.assetClass] ?? 0) + valueInBase);
    allocationByCurrency[holding.currency] = roundMoney((allocationByCurrency[holding.currency] ?? 0) + valueInBase);
  }
  const liabilitiesValue = input.manualLiabilities.reduce((sum, liability) => sum + liability.amount * fx(liability.currency, input.fxRates), 0);
  const topHoldings = holdings.slice().sort((a, b) => marketValueOf(b) * fx(b.currency, input.fxRates) - marketValueOf(a) * fx(a.currency, input.fxRates)).slice(0, 10);
  return { baseCurrency: input.baseCurrency, totalAssetsValue: roundMoney(totalAssetsValue), liabilitiesValue: roundMoney(liabilitiesValue), totalNetWorth: roundMoney(totalAssetsValue - liabilitiesValue), allocationByAssetClass, allocationByCurrency, topHoldings, holdings, updatedAt: new Date().toISOString() };
}

export function createPortfolioSnapshot(aggregation: PortfolioAggregation, capturedAt = new Date().toISOString()): PortfolioSnapshotRecord {
  return { totalNetWorth: aggregation.totalNetWorth, currency: aggregation.baseCurrency, allocationJson: JSON.stringify(aggregation.allocationByAssetClass), currencyExposureJson: JSON.stringify(aggregation.allocationByCurrency), capturedAt };
}
