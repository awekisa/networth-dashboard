import type { NormalizedHolding } from '@/lib/portfolio/types';
export type RawErc20Balance = { contractAddress: string; name: string; symbol: string; decimals: number; balance: string };
export type RawEthereumBalances = { address: string; ethWei: string; tokens: RawErc20Balance[] };
function integerToDecimal(raw: string, decimals: number): number {
  const whole = BigInt(raw || '0');
  const divisor = 10n ** BigInt(decimals);
  const intPart = whole / divisor;
  const fracPart = whole % divisor;
  const frac = fracPart.toString().padStart(decimals, '0').replace(/0+$/, '');
  return Number(`${intPart.toString()}${frac ? `.${frac}` : ''}`);
}
export function normalizeEthereumBalances(input: RawEthereumBalances): NormalizedHolding[] {
  const updated = new Date().toISOString();
  const holdings: NormalizedHolding[] = [];
  const ethQty = integerToDecimal(input.ethWei, 18);
  if (ethQty > 0) holdings.push({ name: 'Ethereum', symbol: 'ETH', provider: 'crypto', account: input.address, assetClass: 'CRYPTO', currency: 'USD', quantity: ethQty, lastUpdatedAt: updated });
  for (const token of input.tokens) {
    const quantity = integerToDecimal(token.balance, token.decimals);
    if (quantity > 0) holdings.push({ name: token.name, symbol: token.symbol, provider: 'crypto', account: input.address, assetClass: 'CRYPTO', currency: 'USD', quantity, lastUpdatedAt: updated });
  }
  return holdings;
}
export async function fetchCryptoPrices(symbols: string[], currency = 'usd'): Promise<Record<string, number>> {
  const ids: Record<string, string> = { ETH: 'ethereum', WETH: 'weth', USDC: 'usd-coin', USDT: 'tether', DAI: 'dai', WBTC: 'wrapped-bitcoin', BTC: 'bitcoin' };
  const selected = [...new Set(symbols.map(s => ids[s.toUpperCase()]).filter(Boolean))];
  if (selected.length === 0) return {};
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${selected.join(',')}&vs_currencies=${currency}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Price fetch failed: ${response.status}`);
  const json = await response.json() as Record<string, Record<string, number>>;
  const out: Record<string, number> = {};
  for (const [symbol, id] of Object.entries(ids)) if (json[id]?.[currency] !== undefined) out[symbol] = json[id][currency];
  return out;
}
