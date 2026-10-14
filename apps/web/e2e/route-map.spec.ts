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
  // Departure ships prefilled with today/now and stays untouched.
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

/** Small screens start with the planning sheet at half height; collapse
 * it to interact with the map itself. Snap order is half -> expanded ->
 * collapsed, so up to two clicks land collapsed. Desktop has no snap
 * control and both lookups stay invisible. */
async function collapseSheetIfExpanded(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand panel to full height' });
  if (await expand.isVisible()) {
    await expand.click();
  }
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

  // One selection surface only: the bottom-sheet cards (with carousel
  // dots). No floating radio panel over the map.
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByText('Select a route to inspect')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Show Route \d/ })).toHaveCount(3);
  await expect(page.getByText(/Recommended: Route \d/)).toBeVisible();
  // The backend recommendation is the default selection.
  await expect(page.getByRole('button', { name: 'Selected on map' })).toHaveCount(1);
});

test('synchronizes selection between route cards and the map', async ({ page }) => {
  await withEmptyBasemap(page);
  await submitValidPlan(page);
  await expectMapRegion(page);

  // Card button -> selection. Route 3 is picked through the carousel dot;
  // map-click selection is covered by component tests with a stubbed map.
  await page.getByRole('button', { name: 'Show Route 3' }).click();
  await expect(page.getByRole('button', { name: 'Selected on map' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Show on map' })).toHaveCount(2);

  // Back to the recommended route through its card.
  await page.getByRole('button', { name: 'Show Route 1' }).click();
  await expect(page.getByRole('button', { name: 'Selected on map' })).toHaveCount(1);
});

test('supports keyboard route selection', async ({ page }) => {
  await withEmptyBasemap(page);
  await submitValidPlan(page);
  await expectMapRegion(page);

  const show = page.getByRole('button', { name: 'Show on map' }).first();
  await show.focus();
  await page.keyboard.press('Enter');
  // Exactly one route stays selected.
  await expect(page.getByRole('button', { name: 'Selected on map' })).toHaveCount(1);
});

test('hides and re-shows a route without losing selection', async ({ page }) => {
  await withEmptyBasemap(page);
  await submitValidPlan(page);
  await expectMapRegion(page);

  const card = page.locator('[data-route-id]').first();
  await card.getByRole('button', { name: 'Hide route' }).click();
  await expect(card.getByRole('button', { name: 'Show route' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Selected on map' })).toHaveCount(1);
  await card.getByRole('button', { name: 'Show route' }).click();
  await expect(card.getByRole('button', { name: 'Hide route' })).toBeVisible();
});

test('focuses a sidebar checkpoint pick on the map', async ({ page }) => {
  await withEmptyBasemap(page);
  await submitValidPlan(page);
  await expectMapRegion(page);

  const card = page.locator('[data-route-id]').first();
  await card.getByText(/Checkpoints \(\d+\)/).click();
  await card
    .getByRole('button', { name: /0\.0 mi/ })
    .first()
    .click();
  // The pick raises the checkpoint detail panel and popup path.
  await expect(
    page.getByRole('heading', { name: /checkpoint 1 of route/i }),
  ).toBeVisible();
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
  await expect(page.getByText('Route alternatives')).toHaveCount(0);
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

  // The forecast lives in the bottom sheet, collapsed at first: expand it.
  // Hidden accordion content stays out of the accessible tree.
  await expect(page.getByRole('slider', { name: /forecast hour offset/i })).toHaveCount(
    0,
  );
  await page.getByText('Forecast', { exact: true }).click();

  const slider = page.getByRole('slider', { name: /forecast hour offset/i });
  await expect(slider).toBeVisible();
  await expect(page.getByText('Departure time').first()).toBeVisible();

  // The settled initial position fetches offset 0 (debounced, cached after).
  await expect.poll(() => gridOffsets, { timeout: 20000 }).toContain(0);

  // The slider disables while a forecast is loading; wait until it
  // accepts input or Home/End keypresses land on a dead control.
  await expect(slider).toBeEnabled({ timeout: 20000 });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(page.getByText('+48h').first()).toBeVisible();
  await expect.poll(() => gridOffsets, { timeout: 20000 }).toContain(48);

  // Returning to a cached offset updates the display without refetching.
  const requestsBefore = gridOffsets.length;
  await expect(slider).toBeEnabled({ timeout: 20000 });
  // Grid arrivals re-render the slider and drop focus; re-focus first.
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(page.getByText('Departure time').first()).toBeVisible();
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
  // The error lives in the (collapsed) forecast section: expand it first.
  await expect(page.getByText('Route alternatives (3)')).toBeVisible();
  await page.getByText('Forecast', { exact: true }).click();
  await expect(page.getByText(/weather forecast unavailable/i)).toBeVisible({
    timeout: 20000,
  });
});

test.describe('mobile results layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps one results surface with no overlap or overflow', async ({ page }) => {
    await withEmptyBasemap(page);
    await submitValidPlan(page);
    await expectMapRegion(page);

    // Single selection surface: bottom-sheet cards only.
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByText('Select a route to inspect')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Show Route \d/ })).toHaveCount(3);

    // Forecast collapsed initially: header visible, slider out of the tree.
    await expect(page.getByText('Forecast', { exact: true })).toBeVisible();
    await expect(page.getByRole('slider', { name: /forecast hour offset/i })).toHaveCount(
      0,
    );

    // No horizontal overflow at 390px.
    const overflow: number = await page.evaluate(
      'document.documentElement.scrollWidth - window.innerWidth',
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Snap half -> expanded -> collapsed; the body hides only when collapsed.
    await page.getByRole('button', { name: 'Expand panel to full height' }).click();
    await expect(page.getByText('Route alternatives (3)')).toBeVisible();
    await page.getByRole('button', { name: 'Collapse panel' }).click();
    await expect(page.getByText('Route alternatives (3)')).toHaveCount(0);
    await expect(page.getByText('Forecast', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Expand panel to half height' }).click();
    await expect(page.getByText('Route alternatives (3)')).toBeVisible();

    // Every alternative stays reachable; selection syncs with the map.
    await page.getByRole('button', { name: 'Show Route 3' }).click();
    await expect(page.getByRole('button', { name: 'Selected on map' })).toHaveCount(1);

    // Forecast expands in place, inside the sheet flow.
    await page.getByText('Forecast', { exact: true }).click();
    await expect(
      page.getByRole('slider', { name: /forecast hour offset/i }),
    ).toBeVisible();
  });
});

for (const viewport of [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
]) {
  test.describe(`results layout at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('shows every alternative with no overflow', async ({ page }) => {
      await withEmptyBasemap(page);
      await submitValidPlan(page);
      await expectMapRegion(page);

      await expect(page.getByRole('radio')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Show Route \d/ })).toHaveCount(3);
      const overflow: number = await page.evaluate(
        'document.documentElement.scrollWidth - window.innerWidth',
      );
      expect(overflow).toBeLessThanOrEqual(1);

      await page.getByRole('button', { name: 'Show Route 2' }).click();
      await expect(page.getByRole('button', { name: 'Selected on map' })).toHaveCount(1);
    });
  });
}
