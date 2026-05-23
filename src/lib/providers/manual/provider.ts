import type { PortfolioProviderAdapter, ProviderSyncStatus } from '@/lib/providers/types';
let status: ProviderSyncStatus = { status: 'IDLE', updatedAt: new Date().toISOString() };
export const manualProvider: PortfolioProviderAdapter = {
  id: 'manual',
  name: 'Manual entries',
  async configure() { return { ok: true }; },
  async connect() { return { ok: true }; },
  async fetchAccounts() { return []; },
  async fetchHoldings() { return []; },
  async fetchBalances() { return []; },
  async fetchTransactions() { return []; },
  async sync() { status = { status: 'SUCCESS', message: 'Manual entries do not require external sync.', updatedAt: new Date().toISOString() }; return status; },
  async getSyncStatus() { return status; }
};
