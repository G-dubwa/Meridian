import { expect, test } from '@playwright/test';

test('reports the repository foundation as healthy', async ({ page }) => {
  await page.goto('/health');
  await expect(
    page.getByRole('heading', { name: 'Meridian is ready.' }),
  ).toBeVisible();
});
