'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { persistSnapshot } from '@/lib/portfolio/db-aggregation';

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
