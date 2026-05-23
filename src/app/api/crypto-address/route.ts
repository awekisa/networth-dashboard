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

function integerToDecimal(raw: string, decimals: number): number {
  const whole = BigInt(raw || '0');
  const divisor = 10n ** BigInt(decimals);
  const intPart = whole / divisor;
  const fracPart = whole % divisor;
  const frac = fracPart.toString().padStart(decimals, '0').replace(/0+$/, '');
  return Number(`${intPart.toString()}${frac ? `.${frac}` : ''}`);
}

type EtherscanToken = { contractAddress: string; tokenName: string; tokenSymbol: string; tokenDecimal: string };
async function fetchErc20Tokens(address: string): Promise<EtherscanToken[]> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return [];
  const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${address}&sort=desc&apikey=${key}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) return [];
  const json = await response.json() as { result?: EtherscanToken[] };
  const unique = new Map<string, EtherscanToken>();
  for (const token of json.result ?? []) unique.set(token.contractAddress.toLowerCase(), token);
  return [...unique.values()].slice(0, 50);
}

async function fetchErc20Balance(address: string, contractAddress: string, decimals: number): Promise<number> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return 0;
  const url = `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=${contractAddress}&address=${address}&tag=latest&apikey=${key}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) return 0;
  const json = await response.json() as { result?: string };
  return integerToDecimal(json.result ?? '0', decimals);
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
    const erc20Tokens = await fetchErc20Tokens(address);
    const prices: Record<string, number> = await fetchCryptoPrices(['ETH', ...erc20Tokens.map(token => token.tokenSymbol)], 'usd').catch(() => ({ ETH: 0 }));
    const unitPrice = prices.ETH ?? 0;
    await prisma.holding.upsert({ where: { accountId_assetId: { accountId: account.id, assetId: asset.id } }, create: { accountId: account.id, assetId: asset.id, quantity, unitPrice, marketValue: quantity * unitPrice, lastUpdatedAt: new Date() }, update: { quantity, unitPrice, marketValue: quantity * unitPrice, lastUpdatedAt: new Date() } });
    for (const token of erc20Tokens) {
      const decimals = Number(token.tokenDecimal || '18');
      const tokenQuantity = await fetchErc20Balance(address, token.contractAddress, decimals);
      if (tokenQuantity <= 0) continue;
      const tokenSymbol = token.tokenSymbol.toUpperCase();
      const tokenAsset = await prisma.asset.upsert({
        where: { id: `asset-${token.contractAddress.toLowerCase()}` },
        create: { id: `asset-${token.contractAddress.toLowerCase()}`, name: token.tokenName, symbol: tokenSymbol, assetClass: 'CRYPTO', currency: 'USD', decimals, externalId: token.contractAddress },
        update: { name: token.tokenName, symbol: tokenSymbol, decimals }
      });
      const tokenUnitPrice = prices[tokenSymbol] ?? 0;
      await prisma.holding.upsert({
        where: { accountId_assetId: { accountId: account.id, assetId: tokenAsset.id } },
        create: { accountId: account.id, assetId: tokenAsset.id, quantity: tokenQuantity, unitPrice: tokenUnitPrice, marketValue: tokenQuantity * tokenUnitPrice, lastUpdatedAt: new Date() },
        update: { quantity: tokenQuantity, unitPrice: tokenUnitPrice, marketValue: tokenQuantity * tokenUnitPrice, lastUpdatedAt: new Date() }
      });
    }
    await audit('SYNC_SUCCESS', { provider: 'crypto', addressSuffix: address.slice(-6), asset: 'ETH', erc20Count: erc20Tokens.length }, 'Account', account.id);
    await persistSnapshot();
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error) {
    await audit('SYNC_FAILURE', { provider: 'crypto', addressSuffix: address.slice(-6), message: error instanceof Error ? error.message : 'unknown' }, 'Account');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Crypto sync failed' }, { status: 502 });
  }
}
