import type { PortfolioProviderAdapter, ProviderSyncStatus } from '@/lib/providers/types';
let status: ProviderSyncStatus = { status: 'IDLE', updatedAt: new Date().toISOString() };
export const cryptoProvider: PortfolioProviderAdapter = {
  id: 'crypto', name: 'Ethereum public-address tracker',
  async configure(config) { if (typeof config.address === 'string' && !config.address.startsWith('0x')) return { ok: false, message: 'Only Ethereum public addresses are accepted.' }; return { ok: true }; },
  async fetchAccounts() { return []; }, async fetchHoldings() { return []; }, async fetchBalances() { return []; },
  async sync() { status = { status: 'SUCCESS', message: 'Crypto sync attempted using public addresses only.', updatedAt: new Date().toISOString() }; return status; },
  async getSyncStatus() { return status; }
};
