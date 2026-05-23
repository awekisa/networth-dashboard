import type { NormalizedHolding } from '@/lib/portfolio/types';
export type ProviderConfigResult = { ok: boolean; message?: string };
export type ProviderAccount = { id: string; name: string; type: string; currency: string; provider: string };
export type ProviderBalance = { accountId: string; currency: string; balance: number };
export type ProviderPrice = { symbol: string; currency: string; price: number; source: string };
export type ProviderTransaction = { id: string; accountId: string; occurredAt: string; safeDescription: string; amount: number; currency: string };
export type ProviderSyncStatus = { status: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED'; message?: string; updatedAt: string };
export interface PortfolioProviderAdapter {
  id: string;
  name: string;
  configure(config: Record<string, unknown>): Promise<ProviderConfigResult>;
  connect?(): Promise<ProviderConfigResult>;
  fetchAccounts(): Promise<ProviderAccount[]>;
  fetchHoldings(): Promise<NormalizedHolding[]>;
  fetchBalances(): Promise<ProviderBalance[]>;
  fetchPrices?(symbols: string[], currency: string): Promise<ProviderPrice[]>;
  fetchTransactions?(): Promise<ProviderTransaction[]>;
  sync(): Promise<ProviderSyncStatus>;
  getSyncStatus(): Promise<ProviderSyncStatus>;
}
