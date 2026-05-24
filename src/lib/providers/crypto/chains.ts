export type CryptoChainId = 'bitcoin' | 'ethereum' | 'solana' | 'sui';

export type CryptoChainConfig = {
  id: CryptoChainId;
  name: string;
  symbol: 'BTC' | 'ETH' | 'SOL' | 'SUI';
  decimals: number;
  coingeckoId: string;
  addressPattern: RegExp;
  addressLabel: string;
};

export type NativeCryptoBalance = {
  chain: CryptoChainId;
  address: string;
  name: string;
  symbol: CryptoChainConfig['symbol'];
  quantity: number;
};

export type ConfiguredCryptoAddress = {
  chain: CryptoChainId;
  address: string;
  label: string;
  maskedAddress: string;
};

export const CRYPTO_CHAINS: Record<CryptoChainId, CryptoChainConfig> = {
  bitcoin: {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
    coingeckoId: 'bitcoin',
    addressPattern: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,90}$/,
    addressLabel: 'Bitcoin public address'
  },
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    coingeckoId: 'ethereum',
    addressPattern: /^0x[a-fA-F0-9]{40}$/,
    addressLabel: 'Ethereum public address'
  },
  solana: {
    id: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    decimals: 9,
    coingeckoId: 'solana',
    addressPattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    addressLabel: 'Solana public address'
  },
  sui: {
    id: 'sui',
    name: 'Sui',
    symbol: 'SUI',
    decimals: 9,
    coingeckoId: 'sui',
    addressPattern: /^0x[a-fA-F0-9]{64}$/,
    addressLabel: 'Sui public address'
  }
};

export function normalizeCryptoChain(value: unknown): CryptoChainId | undefined {
  const id = String(value ?? '').trim().toLowerCase();
  return id in CRYPTO_CHAINS ? id as CryptoChainId : undefined;
}

export function validateCryptoAddress(chain: unknown, rawAddress: unknown): { ok: true; chain: CryptoChainId; address: string } | { ok: false; message: string } {
  const chainId = normalizeCryptoChain(chain);
  if (!chainId) return { ok: false, message: 'Unsupported crypto network.' };
  const address = String(rawAddress ?? '').trim();
  const config = CRYPTO_CHAINS[chainId];
  if (!config.addressPattern.test(address)) return { ok: false, message: `Only ${config.name} public addresses are accepted.` };
  return { ok: true, chain: chainId, address };
}

export function maskCryptoAddress(address: string): string {
  return address.length <= 14 ? address : `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export function parseConfiguredCryptoAddresses(rawConfig = process.env.CRYPTO_PUBLIC_ADDRESSES ?? ''): ConfiguredCryptoAddress[] {
  return rawConfig
    .split(/[\n,]+/)
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [chainPart, ...addressParts] = entry.split(':');
      const rawAddress = addressParts.join(':').trim();
      const validation = validateCryptoAddress(chainPart, rawAddress);
      return validation.ok
        ? {
            chain: validation.chain,
            address: validation.address,
            label: `${CRYPTO_CHAINS[validation.chain].name} address`,
            maskedAddress: maskCryptoAddress(validation.address)
          }
        : undefined;
    })
    .filter((address): address is ConfiguredCryptoAddress => Boolean(address));
}

function integerToDecimal(raw: string | number | bigint, decimals: number): number {
  const whole = BigInt(raw || 0);
  const divisor = 10n ** BigInt(decimals);
  const intPart = whole / divisor;
  const fracPart = whole % divisor;
  const frac = fracPart.toString().padStart(decimals, '0').replace(/0+$/, '');
  return Number(`${intPart.toString()}${frac ? `.${frac}` : ''}`);
}

async function fetchBitcoinBalance(address: string): Promise<number> {
  const response = await fetch(`https://blockstream.info/api/address/${encodeURIComponent(address)}`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Bitcoin address lookup failed: ${response.status}`);
  const json = await response.json() as { chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number }; mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number } };
  const chainStats = json.chain_stats ?? {};
  const mempoolStats = json.mempool_stats ?? {};
  const sats = (chainStats.funded_txo_sum ?? 0) - (chainStats.spent_txo_sum ?? 0) + (mempoolStats.funded_txo_sum ?? 0) - (mempoolStats.spent_txo_sum ?? 0);
  return integerToDecimal(sats, CRYPTO_CHAINS.bitcoin.decimals);
}

async function fetchEthereumBalance(address: string): Promise<number> {
  const response = await fetch('https://cloudflare-eth.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 1 }) });
  if (!response.ok) throw new Error(`Ethereum RPC failed: ${response.status}`);
  const json = await response.json() as { result?: string };
  return Number(BigInt(json.result ?? '0x0')) / 1e18;
}

async function fetchSolanaBalance(address: string): Promise<number> {
  const response = await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'getBalance', params: [address], id: 1 }) });
  if (!response.ok) throw new Error(`Solana RPC failed: ${response.status}`);
  const json = await response.json() as { result?: { value?: number } };
  return integerToDecimal(json.result?.value ?? 0, CRYPTO_CHAINS.solana.decimals);
}

async function fetchSuiBalance(address: string): Promise<number> {
  const response = await fetch('https://fullnode.mainnet.sui.io:443', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'suix_getBalance', params: [address, '0x2::sui::SUI'], id: 1 }) });
  if (!response.ok) throw new Error(`Sui RPC failed: ${response.status}`);
  const json = await response.json() as { result?: { totalBalance?: string } };
  return integerToDecimal(json.result?.totalBalance ?? '0', CRYPTO_CHAINS.sui.decimals);
}

export async function fetchNativeCryptoBalance(chain: CryptoChainId, address: string): Promise<NativeCryptoBalance> {
  const config = CRYPTO_CHAINS[chain];
  const quantity = chain === 'bitcoin'
    ? await fetchBitcoinBalance(address)
    : chain === 'ethereum'
      ? await fetchEthereumBalance(address)
      : chain === 'solana'
        ? await fetchSolanaBalance(address)
        : await fetchSuiBalance(address);
  return { chain, address, name: config.name, symbol: config.symbol, quantity };
}

export async function fetchNativeCryptoPrices(chains: CryptoChainId[], currency = 'usd'): Promise<Record<CryptoChainId, number>> {
  const uniqueChains = [...new Set(chains)];
  const ids = uniqueChains.map(chain => CRYPTO_CHAINS[chain].coingeckoId);
  if (ids.length === 0) return {} as Record<CryptoChainId, number>;
  const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=${currency}`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Price fetch failed: ${response.status}`);
  const json = await response.json() as Record<string, Record<string, number>>;
  return Object.fromEntries(uniqueChains.map(chain => [chain, json[CRYPTO_CHAINS[chain].coingeckoId]?.[currency] ?? 0])) as Record<CryptoChainId, number>;
}
