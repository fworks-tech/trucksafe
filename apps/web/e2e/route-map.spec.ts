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
  // First result render can race the cold lazy-map transform on a shared
  // dev server; same allowance as expectMapRegion below.
  await expect(page.getByText('Route alternatives (3)')).toBeVisible({ timeout: 20000 });
}

// The map section arrives via React.lazy: the first assertion waits out
// cold module transforms, which are slow when workers share one dev
// server. Later assertions keep the default timeout.
async function expectMapRegion(page: Page): Promise<void> {
  await expect(page.getByRole('region', { name: /interactive route map/i })).toBeVisible({
    timeout: 20000,
  });
}

/** Small screens start with the planning sheet expanded (bottom-sheet
 * pattern); collapse it to interact with the floating map overlays. */
async function collapseSheetIfExpanded(page: Page): Promise<void> {
  const collapse = page.getByRole('button', { name: 'Collapse panel' });
  if (await collapse.isVisible()) {
    await collapse.click();
  }
}

test('documents segment risk colors in the map legend', async ({ page }) => {
  await withEmptyBasemap(page);
  await submitValidPlan(page);
  await expectMapRegion(page);
  await collapseSheetIfExpanded(page);

  // On small screens the legend starts collapsed to keep the map clear;
  // expand it before asserting the color decoding.
  const expand = page.getByRole('button', { name: 'Expand map legend' });
  if (await expand.isVisible()) {
    await expand.click();
  }

  // The legend is the accessible decoder for every map treatment, so the
  // segment colors drawn on the map are also stated as text.
  await expect(page.getByText('Segment risk')).toBeVisible();
  for (const label of [
    'Segment: Low risk',
    'Segment: Moderate risk',
    'Segment: High risk',
    'Segment: Severe risk',
    'Segment: No Travel risk',
    'Segment: risk unavailable',
  ]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});

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

  // Card -> map list. The RouteCard lives in the planning panel, which is
  // visible (expanded) on mobile by default.
  await page.getByRole('button', { name: 'Show on map' }).first().click();
  await expect(page.getByRole('button', { name: 'Selected on map' })).toHaveCount(1);

  // Map list -> card. The floating route radios sit over the map; on
  // small screens collapse the sheet first so they are not covered.
  await collapseSheetIfExpanded(page);
  await page.getByRole('radio', { name: /route 3/i }).click();
  await expect(page.getByRole('radio', { name: /route 3/i })).toBeChecked();
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
  await expect(page.getByText(/Recommended: Route /)).toBeVisible();
  // Retry re-fails deterministically and keeps the fallback.
  await page.getByRole('button', { name: /retry map/i }).click();
  await expect(page.getByText('The interactive map could not be loaded')).toBeVisible();
});

test('shows the origin map on load and keeps it when a new plan starts', async ({
  page,
}) => {
  await withEmptyBasemap(page);
  await page.goto('/');
  // The background map renders before any plan, centered on the
  // default origin (Chicago, IL).
  await expect(page.getByRole('region', { name: /showing chicago, il/i })).toBeVisible({
    timeout: 20000,
  });

  await submitValidPlan(page);
  await expectMapRegion(page);

  // Starting over clears results but never removes the map itself: it
  // falls back to the origin focus instead of a placeholder.
  await page.getByRole('button', { name: /start new plan/i }).click();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: /interactive route map/i }),
  ).toBeVisible();
});

test('updates the displayed forecast when the slider moves', async ({ page }) => {
  await withEmptyBasemap(page);
  const gridOffsets: number[] = [];
  await page.route('**/weather-grid*', async (route) => {
    const url = new URL(route.request().url());
    gridOffsets.push(Number(url.searchParams.get('offset_hours')));
    await route.continue();
  });
  await submitValidPlan(page);
  await expectMapRegion(page);
  await collapseSheetIfExpanded(page);

  const slider = page.getByRole('slider', { name: /forecast hour offset/i });
  await expect(slider).toBeVisible();
  await expect(page.getByText('Departure time')).toBeVisible();

  // The settled initial position fetches offset 0 (debounced, cached after).
  await expect.poll(() => gridOffsets, { timeout: 20000 }).toContain(0);

  // The slider disables while a forecast is loading; wait until it
  // accepts input or Home/End keypresses land on a dead control.
  await expect(slider).toBeEnabled({ timeout: 20000 });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(page.getByText('+48h')).toBeVisible();
  await expect.poll(() => gridOffsets, { timeout: 20000 }).toContain(48);

  // Returning to a cached offset updates the display without refetching.
  const requestsBefore = gridOffsets.length;
  await expect(slider).toBeEnabled({ timeout: 20000 });
  // Grid arrivals re-render the slider and drop focus; re-focus first.
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(page.getByText('Departure time')).toBeVisible();
  await page.waitForTimeout(600);
  expect(gridOffsets.length).toBe(requestsBefore);
});

test('keeps route results when the forecast request fails', async ({ page }) => {
  await withEmptyBasemap(page);
  await page.route('**/weather-grid*', async (route) => {
    await route.fulfill({
      status: 503,
      json: {
        error: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'Weather provider temporarily unavailable.',
          request_id: 'e2e-forecast-failure',
        },
      },
    });
  });
  await submitValidPlan(page);
  await expectMapRegion(page);

  // The plan itself succeeded: routes stay, only the forecast degrades.
  await expect(page.getByText('Route alternatives (3)')).toBeVisible();
  await expect(page.getByText(/weather forecast unavailable/i)).toBeVisible({
    timeout: 20000,
  });
});
