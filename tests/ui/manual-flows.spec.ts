import { expect, test } from '@playwright/test';

test('dashboard exposes manual entry and crypto address flows', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /local net worth dashboard/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /add manual asset/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /add manual liability/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /add ethereum public address/i })).toBeVisible();
  await expect(page.getByText(/never enter private keys/i)).toBeVisible();
});
