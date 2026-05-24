import { afterEach, describe, expect, it, vi } from 'vitest';
import { CRYPTO_CHAINS, fetchNativeCryptoBalance, parseConfiguredCryptoAddresses, validateCryptoAddress } from '@/lib/providers/crypto/chains';

const sampleAddresses = {
  bitcoin: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  ethereum: '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe',
  solana: '11111111111111111111111111111111',
  sui: '0x0000000000000000000000000000000000000000000000000000000000000001'
};

describe('public crypto address chains', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts sample public BTC, ETH, SOL, and SUI addresses and rejects private-key-shaped input', () => {
    expect(Object.keys(CRYPTO_CHAINS)).toEqual(['bitcoin', 'ethereum', 'solana', 'sui']);
    for (const [chain, address] of Object.entries(sampleAddresses)) {
      expect(validateCryptoAddress(chain, address).ok).toBe(true);
    }
    expect(validateCryptoAddress('ethereum', 'private key: not-an-address')).toEqual({ ok: false, message: 'Only Ethereum public addresses are accepted.' });
    expect(validateCryptoAddress('bitcoin', 'seed phrase abandon abandon abandon')).toEqual({ ok: false, message: 'Only Bitcoin public addresses are accepted.' });
  });

  it('parses configured public addresses from local env-style values', () => {
    const configured = parseConfiguredCryptoAddresses([
      `bitcoin:${sampleAddresses.bitcoin}`,
      `ethereum:${sampleAddresses.ethereum}`,
      `solana:${sampleAddresses.solana}`,
      `sui:${sampleAddresses.sui}`,
      'ethereum:private key: not-an-address'
    ].join('\n'));

    expect(configured.map(item => item.chain)).toEqual(['bitcoin', 'ethereum', 'solana', 'sui']);
    expect(configured[0]).toMatchObject({ label: 'Bitcoin address', maskedAddress: '1A1zP1…DivfNa' });
    expect(configured.map(item => item.address)).not.toContain('private key: not-an-address');
  });

  it('fetches native balances from read-only public endpoints without private key material', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('blockstream.info')) return new Response(JSON.stringify({ chain_stats: { funded_txo_sum: 250_000_000, spent_txo_sum: 50_000_000 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 } }));
      if (target.includes('cloudflare-eth.com')) return new Response(JSON.stringify({ result: '0xde0b6b3a7640000' }));
      if (target.includes('solana.com')) return new Response(JSON.stringify({ result: { value: 2_500_000_000 } }));
      if (target.includes('sui.io')) return new Response(JSON.stringify({ result: { totalBalance: '3000000000' } }));
      throw new Error(`Unexpected URL ${target} ${JSON.stringify(init)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchNativeCryptoBalance('bitcoin', sampleAddresses.bitcoin)).resolves.toMatchObject({ symbol: 'BTC', quantity: 2 });
    await expect(fetchNativeCryptoBalance('ethereum', sampleAddresses.ethereum)).resolves.toMatchObject({ symbol: 'ETH', quantity: 1 });
    await expect(fetchNativeCryptoBalance('solana', sampleAddresses.solana)).resolves.toMatchObject({ symbol: 'SOL', quantity: 2.5 });
    await expect(fetchNativeCryptoBalance('sui', sampleAddresses.sui)).resolves.toMatchObject({ symbol: 'SUI', quantity: 3 });

    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(/private|seed|phrase|sign/i);
  });
});
