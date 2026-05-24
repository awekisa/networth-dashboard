'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { persistSnapshot } from '@/lib/portfolio/db-aggregation';
import { fetchIbkrFlexStatement, parseIbkrFlexStatement, redactIbkrSecrets } from '@/lib/providers/ibkr/flex';

function s(form: FormData, key: string) { return String(form.get(key) ?? '').trim(); }
function num(form: FormData, key: string) { return Number(s(form, key) || '0'); }

export async function ensureDefaultProviders() {
  await Promise.all([
    prisma.provider.upsert({ where: { id: 'manual-provider' }, create: { id: 'manual-provider', name: 'Manual', type: 'manual' }, update: {} }),
    prisma.provider.upsert({ where: { id: 'crypto-provider' }, create: { id: 'crypto-provider', name: 'Ethereum public address', type: 'crypto' }, update: {} }),
    prisma.provider.upsert({ where: { id: 'ibkr-provider' }, create: { id: 'ibkr-provider', name: 'Interactive Brokers', type: 'broker-placeholder' }, update: {} }),
    prisma.provider.upsert({ where: { id: 'fidelity-provider' }, create: { id: 'fidelity-provider', name: 'Fidelity', type: 'csv-manual-placeholder' }, update: {} }),
    prisma.provider.upsert({ where: { id: 'bank-provider' }, create: { id: 'bank-provider', name: 'Bank / cash', type: 'bank-placeholder' }, update: {} })
  ]);
}

async function accountNameFromForm(form: FormData): Promise<string | null> {
  const accountId = s(form, 'accountId');
  if (!accountId) return s(form, 'accountName') || null;
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  return account?.name ?? (s(form, 'accountName') || null);
}

export async function addManualAccount(form: FormData) {
  await ensureDefaultProviders();
  const providerId = s(form, 'providerId') || 'manual-provider';
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider) throw new Error('Unknown provider');
  const record = await prisma.account.create({ data: { providerId, name: s(form, 'name'), type: s(form, 'type') || 'manual', currency: s(form, 'currency').toUpperCase() || 'EUR' } });
  await audit('MANUAL_CREATE', { kind: 'account', provider: provider.name, accountType: record.type, currency: record.currency }, 'Account', record.id);
  revalidatePath('/'); redirect('/');
}

export async function addManualAsset(form: FormData) {
  const accountName = await accountNameFromForm(form);
  const record = await prisma.manualAsset.create({ data: { name: s(form,'name'), assetClass: s(form,'assetClass') as any, currency: s(form,'currency').toUpperCase(), quantity: num(form,'quantity'), unitPrice: num(form,'unitPrice'), provider: 'manual', accountName } });
  await audit('MANUAL_CREATE', { kind: 'asset', name: record.name, currency: record.currency, accountName }, 'ManualAsset', record.id);
  await persistSnapshot();
  revalidatePath('/'); redirect('/');
}
export async function addManualLiability(form: FormData) {
  const accountName = await accountNameFromForm(form);
  const record = await prisma.manualLiability.create({ data: { name: s(form,'name'), currency: s(form,'currency').toUpperCase(), amount: num(form,'amount'), provider: 'manual', accountName } });
  await audit('MANUAL_CREATE', { kind: 'liability', name: record.name, currency: record.currency, accountName }, 'ManualLiability', record.id);
  await persistSnapshot();
  revalidatePath('/'); redirect('/');
}
export async function addManualCash(form: FormData) {
  form.set('assetClass', 'CASH');
  form.set('quantity', '1');
  return addManualAsset(form);
}
export async function createSnapshotAction() { await persistSnapshot(); revalidatePath('/'); redirect('/'); }

export async function syncIbkrFlex() {
  await ensureDefaultProviders();
  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) throw new Error('Set IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID in .env, then restart the dev server.');
  await audit('SYNC_ATTEMPT', redactIbkrSecrets({ provider: 'Interactive Brokers', token, queryId }), 'Provider', 'ibkr-provider');
  try {
    const xml = await fetchIbkrFlexStatement({ token, queryId });
    const parsed = parseIbkrFlexStatement(xml);
    const provider = await prisma.provider.upsert({ where: { id: 'ibkr-provider' }, create: { id: 'ibkr-provider', name: 'Interactive Brokers', type: 'broker-readonly-flex' }, update: { type: 'broker-readonly-flex' } });
    const account = await prisma.account.upsert({ where: { id: `ibkr-${parsed.accountId}` }, create: { id: `ibkr-${parsed.accountId}`, providerId: provider.id, name: `IBKR ${parsed.accountId}`, type: 'broker', currency: parsed.cashBalances[0]?.currency ?? 'EUR' }, update: { providerId: provider.id } });
    for (const cash of parsed.cashBalances) {
      const asset = await prisma.asset.upsert({ where: { id: `cash-${cash.currency}` }, create: { id: `cash-${cash.currency}`, name: `${cash.currency} Cash`, symbol: cash.currency, assetClass: 'CASH', currency: cash.currency }, update: {} });
      await prisma.holding.upsert({ where: { accountId_assetId: { accountId: account.id, assetId: asset.id } }, create: { accountId: account.id, assetId: asset.id, quantity: cash.balance, unitPrice: 1, marketValue: cash.balance, lastUpdatedAt: new Date() }, update: { quantity: cash.balance, unitPrice: 1, marketValue: cash.balance, lastUpdatedAt: new Date() } });
    }
    for (const holding of parsed.holdings) {
      const symbol = holding.symbol ?? holding.name;
      const assetId = `ibkr-${symbol}-${holding.currency}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const asset = await prisma.asset.upsert({ where: { id: assetId }, create: { id: assetId, name: holding.name, symbol: holding.symbol ?? null, assetClass: holding.assetClass, currency: holding.currency }, update: { name: holding.name, symbol: holding.symbol ?? null, assetClass: holding.assetClass, currency: holding.currency } });
      await prisma.holding.upsert({ where: { accountId_assetId: { accountId: account.id, assetId: asset.id } }, create: { accountId: account.id, assetId: asset.id, quantity: holding.quantity, unitPrice: holding.unitPrice ?? null, marketValue: holding.marketValue ?? null, costBasis: holding.costBasis ?? null, unrealizedPnl: holding.unrealizedPnl ?? null, lastUpdatedAt: new Date() }, update: { quantity: holding.quantity, unitPrice: holding.unitPrice ?? null, marketValue: holding.marketValue ?? null, costBasis: holding.costBasis ?? null, unrealizedPnl: holding.unrealizedPnl ?? null, lastUpdatedAt: new Date() } });
    }
    await audit('SYNC_SUCCESS', { provider: 'Interactive Brokers', accountId: parsed.accountId, holdings: parsed.holdings.length, cashBalances: parsed.cashBalances.length }, 'Account', account.id);
    await persistSnapshot();
    revalidatePath('/'); redirect('/');
  } catch (error) {
    await audit('SYNC_FAILURE', { provider: 'Interactive Brokers', message: error instanceof Error ? error.message : 'unknown' }, 'Provider', 'ibkr-provider');
    throw error;
  }
}
