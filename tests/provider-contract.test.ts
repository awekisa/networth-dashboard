import { describe, expect, it } from 'vitest';
import { manualProvider } from '@/lib/providers/manual/provider';

describe('provider adapter contract', () => {
  it('manual provider implements common provider interface', async () => {
    expect(manualProvider.id).toBe('manual');
    expect(await manualProvider.configure({})).toEqual({ ok: true });
    await expect(manualProvider.fetchAccounts()).resolves.toEqual([]);
    await expect(manualProvider.fetchHoldings()).resolves.toEqual([]);
    await expect(manualProvider.fetchBalances()).resolves.toEqual([]);
    await expect(manualProvider.sync()).resolves.toMatchObject({ status: 'SUCCESS' });
  });
});
