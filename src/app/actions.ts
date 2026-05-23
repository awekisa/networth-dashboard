'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { persistSnapshot } from '@/lib/portfolio/db-aggregation';

function s(form: FormData, key: string) { return String(form.get(key) ?? '').trim(); }
function num(form: FormData, key: string) { return Number(s(form, key) || '0'); }

export async function addManualAsset(form: FormData) {
  const record = await prisma.manualAsset.create({ data: { name: s(form,'name'), assetClass: s(form,'assetClass') as any, currency: s(form,'currency').toUpperCase(), quantity: num(form,'quantity'), unitPrice: num(form,'unitPrice'), provider: 'manual', accountName: s(form,'accountName') || null } });
  await audit('MANUAL_CREATE', { kind: 'asset', name: record.name, currency: record.currency }, 'ManualAsset', record.id);
  await persistSnapshot();
  revalidatePath('/'); redirect('/');
}
export async function addManualLiability(form: FormData) {
  const record = await prisma.manualLiability.create({ data: { name: s(form,'name'), currency: s(form,'currency').toUpperCase(), amount: num(form,'amount'), provider: 'manual', accountName: s(form,'accountName') || null } });
  await audit('MANUAL_CREATE', { kind: 'liability', name: record.name, currency: record.currency }, 'ManualLiability', record.id);
  await persistSnapshot();
  revalidatePath('/'); redirect('/');
}
export async function addManualCash(form: FormData) {
  form.set('assetClass', 'CASH');
  form.set('quantity', '1');
  return addManualAsset(form);
}
export async function createSnapshotAction() { await persistSnapshot(); revalidatePath('/'); redirect('/'); }
