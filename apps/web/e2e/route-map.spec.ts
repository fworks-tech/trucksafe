import { expect, test, type Page } from '@playwright/test';

/**
 * Route map flows against the real backend (deterministic mock providers).
 * Requires the Django backend on :8000; the Vite dev proxy forwards /api.
 *
 * The basemap style is intercepted and replaced with an empty local style
 * so tests never depend on live tile servers: geometry layers, selection,
 * and fallback behavior are fully deterministic. Basemap rendering itself
 * is the provider's responsibility and is not asserted.
 */

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const EMPTY_STYLE = { version: 8, sources: {}, layers: [] };

async function withEmptyBasemap(page: Page): Promise<void> {
  await page.route(STYLE_URL, async (route) => {
    await route.fulfill({ json: EMPTY_STYLE });
  });
}

async function submitValidPlan(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel(/origin/i).fill('Chicago, IL');
  await page.getByLabel(/destination/i).fill('Dallas, TX');
  await page.getByLabel(/departure date and time/i).fill('2026-10-12T14:30');
  await page.getByLabel(/load weight/i).fill('20000');
  await page.getByRole('button', { name: /plan route/i }).click();
  await expect(page.getByText('Route alternatives (3)')).toBeVisible();
}

// The map section arrives via React.lazy: the first assertion waits out
// cold module transforms, which are slow when workers share one dev
// server. Later assertions keep the default timeout.
async function expectMapRegion(page: Page): Promise<void> {
  await expect(page.getByRole('region', { name: /interactive route map/i })).toBeVisible({
    timeout: 20000,
  });
}

test('shows the route map with three selectable alternatives', async ({ page }) => {
  await withEmptyBasemap(page);
  await submitValidPlan(page);

  await expectMapRegion(page);
  await expect(page.getByText('Map legend')).toBeVisible();

  const radios = page.getByRole('radio');
  await expect(radios).toHaveCount(3);
  const recommended = page.getByRole('radio', { name: /recommended/i });
  await expect(recommended).toHaveCount(1);
  // The backend recommendation is the default selection.
  await expect(recommended).toBeChecked();
});

test('synchronizes selection between route cards and the map', async ({ page }) => {
  await withEmptyBasemap(page);
  await submitValidPlan(page);
  await expectMapRegion(page);

  // Card -> map list.
  await page.getByRole('button', { name: 'Show on map' }).first().click();
  await expect(page.getByRole('button', { name: 'Selected on map' })).toHaveCount(1);

  // Map list -> card.
  await page.getByRole('radio', { name: /route-3/ }).click();
  await expect(page.getByRole('radio', { name: /route-3/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Selected on map' })).toHaveCount(1);
});

test('supports keyboard route selection', async ({ page }) => {
  await withEmptyBasemap(page);
  await submitValidPlan(page);
  await expectMapRegion(page);

  const checked = page.getByRole('radio', { checked: true });
  await checked.focus();
  await page.keyboard.press('ArrowDown');
  // Exactly one route stays selected and its card reflects it.
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Selected on map' })).toHaveCount(1);
});

test('falls back safely when the map style fails', async ({ page }) => {
  await page.route(STYLE_URL, async (route) => {
    await route.abort();
  });
  await submitValidPlan(page);

  // Same cold-load allowance as the map region: init must run before
  // the aborted style can surface the fallback.
  await expect(page.getByText('The interactive map could not be loaded')).toBeVisible({
    timeout: 20000,
  });
  // Textual comparison is untouched by the map failure.
  await expect(page.getByText('Route alternatives (3)')).toBeVisible();
  await expect(page.getByText(/Recommended: route-/)).toBeVisible();
  // Retry re-fails deterministically and keeps the fallback.
  await page.getByRole('button', { name: /retry map/i }).click();
  await expect(page.getByText('The interactive map could not be loaded')).toBeVisible();
});

test('removes the previous map when a new plan starts', async ({ page }) => {
  await withEmptyBasemap(page);
  await submitValidPlan(page);
  await expectMapRegion(page);

  await page.getByRole('button', { name: /start new plan/i }).click();
  await expect(page.getByRole('region', { name: /interactive route map/i })).toBeHidden();
  await expect(page.getByRole('radio')).toHaveCount(0);
});
