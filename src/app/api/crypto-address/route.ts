import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fetchCryptoPrices } from '@/lib/providers/crypto/ethereum';
import { CRYPTO_CHAINS, fetchNativeCryptoBalance, fetchNativeCryptoPrices, validateCryptoAddress } from '@/lib/providers/crypto/chains';
import { persistSnapshot } from '@/lib/portfolio/db-aggregation';

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
  const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${encodeURIComponent(address)}&sort=desc&apikey=${encodeURIComponent(key)}`;
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
  const url = `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=${encodeURIComponent(contractAddress)}&address=${encodeURIComponent(address)}&tag=latest&apikey=${encodeURIComponent(key)}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) return 0;
  const json = await response.json() as { result?: string };
  return integerToDecimal(json.result ?? '0', decimals);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const validation = validateCryptoAddress(form.get('chain') ?? 'ethereum', form.get('address'));
  if (!validation.ok) return NextResponse.json({ error: validation.message }, { status: 400 });
  const { chain, address } = validation;
  const config = CRYPTO_CHAINS[chain];
  await audit('SYNC_ATTEMPT', { provider: 'crypto', chain, addressSuffix: address.slice(-6) }, 'Account');
  try {
    const provider = await prisma.provider.upsert({
      where: { id: 'crypto-provider' },
      create: { id: 'crypto-provider', name: 'Crypto public addresses', type: 'crypto' },
      update: { name: 'Crypto public addresses', type: 'crypto' }
    });
    const account = await prisma.account.upsert({
      where: { id: `${chain}-${address.toLowerCase()}` },
      create: { id: `${chain}-${address.toLowerCase()}`, providerId: provider.id, name: `${config.symbol} ${address.slice(0, 6)}…${address.slice(-4)}`, type: 'crypto-wallet', currency: 'USD' },
      update: { name: `${config.symbol} ${address.slice(0, 6)}…${address.slice(-4)}` }
    });
    const asset = await prisma.asset.upsert({
      where: { id: `asset-${config.symbol.toLowerCase()}` },
      create: { id: `asset-${config.symbol.toLowerCase()}`, name: config.name, symbol: config.symbol, assetClass: 'CRYPTO', currency: 'USD', decimals: config.decimals, externalId: config.coingeckoId },
      update: { name: config.name, symbol: config.symbol, decimals: config.decimals, externalId: config.coingeckoId }
    });
    const nativeBalance = await fetchNativeCryptoBalance(chain, address);
    const nativePrices = await fetchNativeCryptoPrices([chain], 'usd').catch(() => ({ [chain]: 0 } as Record<typeof chain, number>));
    const unitPrice = nativePrices[chain] ?? 0;
    await prisma.holding.upsert({
      where: { accountId_assetId: { accountId: account.id, assetId: asset.id } },
      create: { accountId: account.id, assetId: asset.id, quantity: nativeBalance.quantity, unitPrice, marketValue: nativeBalance.quantity * unitPrice, lastUpdatedAt: new Date() },
      update: { quantity: nativeBalance.quantity, unitPrice, marketValue: nativeBalance.quantity * unitPrice, lastUpdatedAt: new Date() }
    });

    let erc20Count = 0;
    if (chain === 'ethereum') {
      const erc20Tokens = await fetchErc20Tokens(address);
      erc20Count = erc20Tokens.length;
      const prices: Record<string, number> = await fetchCryptoPrices(erc20Tokens.map(token => token.tokenSymbol), 'usd').catch(() => ({}));
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
    }

    await audit('SYNC_SUCCESS', { provider: 'crypto', chain, addressSuffix: address.slice(-6), asset: config.symbol, erc20Count }, 'Account', account.id);
    await persistSnapshot();
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error) {
    await audit('SYNC_FAILURE', { provider: 'crypto', chain, addressSuffix: address.slice(-6), message: error instanceof Error ? error.message : 'unknown' }, 'Account');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Crypto sync failed' }, { status: 502 });
  }
}
