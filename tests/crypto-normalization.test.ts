import { describe, expect, it } from 'vitest';
import { normalizeEthereumBalances } from '@/lib/providers/crypto/ethereum';

describe('crypto balance normalization', () => {
  it('normalizes ETH wei and ERC-20 integer balances without private key material', () => {
    const balances = normalizeEthereumBalances({ address: '0x0000000000000000000000000000000000000001', ethWei: '1500000000000000000', tokens: [{ contractAddress: '0xtoken', name: 'USD Coin', symbol: 'USDC', decimals: 6, balance: '2500000' }] });
    expect(balances).toEqual([
      expect.objectContaining({ symbol: 'ETH', quantity: 1.5, assetClass: 'CRYPTO' }),
      expect.objectContaining({ symbol: 'USDC', quantity: 2.5, assetClass: 'CRYPTO' })
    ]);
    expect(JSON.stringify(balances)).not.toMatch(/private|seed|phrase|sign/i);
  });
});
