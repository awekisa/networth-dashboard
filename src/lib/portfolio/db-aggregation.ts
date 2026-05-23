import { prisma } from '@/lib/db';
import { aggregatePortfolio, createPortfolioSnapshot } from './aggregation';
import type { AssetClass, ManualAssetInput, ManualLiabilityInput, NormalizedHolding } from './types';

const n = (value: unknown) => Number(value ?? 0);

export async function loadPortfolioAggregation() {
  const [manualAssetsRaw, manualLiabilitiesRaw, holdingsRaw] = await Promise.all([
    prisma.manualAsset.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.manualLiability.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.holding.findMany({ include: { asset: true, account: { include: { provider: true } } }, orderBy: { updatedAt: 'desc' } })
  ]);
  const manualAssets: ManualAssetInput[] = manualAssetsRaw.map(a => ({ name: a.name, assetClass: a.assetClass as AssetClass, currency: a.currency, quantity: n(a.quantity), unitPrice: n(a.unitPrice), provider: a.provider, accountName: a.accountName ?? undefined, costBasis: a.costBasis === null ? undefined : n(a.costBasis) }));
  const manualLiabilities: ManualLiabilityInput[] = manualLiabilitiesRaw.map(l => ({ name: l.name, currency: l.currency, amount: n(l.amount), provider: l.provider, accountName: l.accountName ?? undefined }));
  const holdings: NormalizedHolding[] = holdingsRaw.map(h => ({ name: h.asset.name, symbol: h.asset.symbol ?? undefined, provider: h.account.provider.name, account: h.account.name, assetClass: h.asset.assetClass as AssetClass, currency: h.asset.currency, quantity: n(h.quantity), unitPrice: h.unitPrice === null ? undefined : n(h.unitPrice), marketValue: h.marketValue === null ? undefined : n(h.marketValue), costBasis: h.costBasis === null ? undefined : n(h.costBasis), unrealizedPnl: h.unrealizedPnl === null ? undefined : n(h.unrealizedPnl), lastUpdatedAt: h.lastUpdatedAt?.toISOString() }));
  return aggregatePortfolio({ baseCurrency: 'EUR', fxRates: { EUR: 1, USD: 0.92, BGN: 0.51129, GBP: 1.17 }, holdings, manualAssets, manualLiabilities });
}

export async function persistSnapshot() {
  const aggregation = await loadPortfolioAggregation();
  const snapshot = createPortfolioSnapshot(aggregation);
  return prisma.portfolioSnapshot.create({ data: { totalNetWorth: snapshot.totalNetWorth, currency: snapshot.currency, allocationJson: snapshot.allocationJson, currencyExposureJson: snapshot.currencyExposureJson } });
}
