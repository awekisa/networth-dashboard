export type AssetClass = 'CASH' | 'CRYPTO' | 'EQUITY' | 'FUND' | 'BOND' | 'REAL_ESTATE' | 'COMMODITY' | 'OTHER' | 'LIABILITY';

export type NormalizedHolding = {
  name: string;
  symbol?: string;
  provider: string;
  account: string;
  assetClass: AssetClass;
  currency: string;
  quantity: number;
  unitPrice?: number;
  marketValue?: number;
  costBasis?: number;
  unrealizedPnl?: number;
  lastUpdatedAt?: string;
  assetId?: string;
};

export type ManualAssetInput = {
  name: string;
  symbol?: string;
  provider?: string;
  accountName?: string;
  assetClass: AssetClass;
  currency: string;
  quantity: number;
  unitPrice: number;
  costBasis?: number;
};

export type ManualLiabilityInput = { name: string; provider?: string; accountName?: string; currency: string; amount: number };
export type FxRates = Record<string, number>;

export type AggregationInput = {
  baseCurrency: string;
  fxRates: FxRates;
  holdings: NormalizedHolding[];
  manualAssets: ManualAssetInput[];
  manualLiabilities: ManualLiabilityInput[];
};

export type PortfolioAggregation = {
  baseCurrency: string;
  totalAssetsValue: number;
  liabilitiesValue: number;
  totalNetWorth: number;
  allocationByAssetClass: Record<string, number>;
  allocationByCurrency: Record<string, number>;
  topHoldings: NormalizedHolding[];
  holdings: NormalizedHolding[];
  updatedAt: string;
};

export type PortfolioSnapshotRecord = {
  totalNetWorth: number;
  currency: string;
  allocationJson: string;
  currencyExposureJson: string;
  capturedAt: string;
};
