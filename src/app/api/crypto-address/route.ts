import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fetchCryptoPrices } from '@/lib/providers/crypto/ethereum';
import { persistSnapshot } from '@/lib/portfolio/db-aggregation';

function isEthAddress(address: string) { return /^0x[a-fA-F0-9]{40}$/.test(address); }
async function fetchEthBalance(address: string): Promise<number> {
  const response = await fetch('https://cloudflare-eth.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 1 }) });
  if (!response.ok) throw new Error(`Ethereum RPC failed: ${response.status}`);
  const json = await response.json();
  const wei = BigInt(json.result ?? '0x0');
  return Number(wei) / 1e18;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const address = String(form.get('address') ?? '').trim();
  if (!isEthAddress(address)) return NextResponse.json({ error: 'Only Ethereum public addresses are accepted.' }, { status: 400 });
  await audit('SYNC_ATTEMPT', { provider: 'crypto', addressSuffix: address.slice(-6) }, 'Account');
  try {
    const provider = await prisma.provider.upsert({ where: { id: 'crypto-provider' }, create: { id: 'crypto-provider', name: 'Ethereum public address', type: 'crypto' }, update: {} });
    const account = await prisma.account.upsert({ where: { id: `eth-${address.toLowerCase()}` }, create: { id: `eth-${address.toLowerCase()}`, providerId: provider.id, name: `ETH ${address.slice(0,6)}…${address.slice(-4)}`, type: 'crypto-wallet', currency: 'USD' }, update: {} });
    const asset = await prisma.asset.upsert({ where: { id: 'asset-eth' }, create: { id: 'asset-eth', name: 'Ethereum', symbol: 'ETH', assetClass: 'CRYPTO', currency: 'USD', decimals: 18, externalId: 'ethereum' }, update: {} });
    const quantity = await fetchEthBalance(address);
    const prices = await fetchCryptoPrices(['ETH'], 'usd').catch(() => ({ ETH: 0 }));
    const unitPrice = prices.ETH ?? 0;
    await prisma.holding.upsert({ where: { accountId_assetId: { accountId: account.id, assetId: asset.id } }, create: { accountId: account.id, assetId: asset.id, quantity, unitPrice, marketValue: quantity * unitPrice, lastUpdatedAt: new Date() }, update: { quantity, unitPrice, marketValue: quantity * unitPrice, lastUpdatedAt: new Date() } });
    await audit('SYNC_SUCCESS', { provider: 'crypto', addressSuffix: address.slice(-6), asset: 'ETH' }, 'Account', account.id);
    await persistSnapshot();
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error) {
    await audit('SYNC_FAILURE', { provider: 'crypto', addressSuffix: address.slice(-6), message: error instanceof Error ? error.message : 'unknown' }, 'Account');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Crypto sync failed' }, { status: 502 });
  }
}
