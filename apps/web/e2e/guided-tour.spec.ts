/** Guided product tour: banner entry, full walkthrough, persistence. */

import { expect, test, type Page } from '@playwright/test';

async function startTour(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Explore TruckSafe')).toBeVisible();
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Welcome to TruckSafe')).toBeVisible();
}

test('walks the complete tour and finishes', async ({ page }) => {
  // Long multi-step flow against the real backend: triple the default
  // timeout so parallel CI workers never flake on a slow step.
  test.slow();
  await startTour(page);
  const dialog = page.getByRole('dialog');

  // Form steps with visible spotlights.
  for (const title of [
    'Origin and destination',
    'Departure time',
    'Load weight',
    'Weather checkpoints',
  ]) {
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('tour-spotlight')).toBeVisible();

  // Generate step offers the explicit example action (never auto-submits).
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('Generate a route plan')).toBeVisible();
  await expect(page.getByText('Route alternatives (3)')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Use example trip' }).click();
  await expect(page.getByText('Route alternatives (3)')).toBeVisible({ timeout: 30000 });

  // Result steps.
  for (const title of [
    'Route alternatives',
    'Routes and checkpoints',
    'Risk details and arrival times',
    'Weather heatmap',
  ]) {
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByText(title, { exact: true })).toBeVisible();
  }

  // Forecast lives in a collapsed section: expand it, then continue.
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('Forecast timeline')).toBeVisible();
  await page.getByText('Forecast', { exact: true }).click();
  await expect(page.getByRole('slider', { name: /forecast hour offset/i })).toBeVisible();

  // Backward navigation, then finish.
  await dialog.getByRole('button', { name: 'Previous' }).click();
  await expect(dialog.getByText('Weather heatmap')).toBeVisible();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('You are ready to use TruckSafe')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Finish tour' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Restart tour' }).click();
  await expect(dialog.getByText('Welcome to TruckSafe')).toBeVisible();
  await dialog.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Completion persists: compact restart entry, no autoplay.
  await expect(
    page.getByRole('button', { name: 'Restart the guided tour' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Restart the guided tour' }),
  ).toBeVisible();
});

test('skips the tour and keeps user input', async ({ page }) => {
  await startTour(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('Origin and destination')).toBeVisible();
  await dialog.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Form untouched, nothing generated.
  await expect(page.getByLabel('Origin')).toHaveValue('Chicago, IL');
  await expect(page.getByText('Route alternatives (3)')).toHaveCount(0);
});

test('banner dismisses to a restart action', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dismiss tour banner' }).click();
  await expect(page.getByText('Explore TruckSafe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Restart the guided tour' }).click();
  await expect(page.getByText('Welcome to TruckSafe')).toBeVisible();
});

test('dialog stays inside narrow viewports without overflow', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'narrow viewport case');
  await page.setViewportSize({ width: 390, height: 844 });
  await startTour(page);
  const dialog = page.getByRole('dialog');
  for (let step = 0; step < 4; step += 1) {
    const box = await dialog.boundingBox();
    expect(box, 'dialog box').not.toBeNull();
    expect(box!.x, 'dialog left edge').toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, 'dialog right edge').toBeLessThanOrEqual(390);
    expect(box!.y + box!.height, 'dialog bottom edge').toBeLessThanOrEqual(844);
    await dialog.getByRole('button', { name: 'Next' }).click();
  }
  const overflow: number = await page.evaluate(
    'document.documentElement.scrollWidth - window.innerWidth',
  );
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(1);
});

test('dialog stays inside a wide viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'wide viewport case');
  await page.setViewportSize({ width: 1440, height: 900 });
  await startTour(page);
  const dialog = page.getByRole('dialog');
  // Welcome is centered (no target); the first anchored step spotlights.
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('Origin and destination')).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box, 'dialog box').not.toBeNull();
  expect(box!.x, 'dialog left edge').toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, 'dialog right edge').toBeLessThanOrEqual(1440);
  await expect(page.getByTestId('tour-spotlight')).toBeVisible();
});
