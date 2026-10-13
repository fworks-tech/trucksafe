import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Critical flows against the real backend (deterministic mock providers).
 * Requires the Django backend on :8000; the Vite dev proxy forwards /api.
 *
 * States that the default mocks cannot produce (all-ineligible routes,
 * provider outages) are covered by MSW integration tests in
 * `src/components/route-plan-page/RoutePlanPage.test.tsx`.
 */

async function fillValidForm(page: Page): Promise<void> {
  await page.getByLabel(/origin/i).fill('Chicago, IL');
  await page.getByLabel(/destination/i).fill('Dallas, TX');
  await page.getByLabel(/departure date and time/i).fill('2026-10-12T14:30');
  await page.getByLabel(/load weight/i).fill('20000');
}

test('creates a route plan and displays three alternatives with a recommendation', async ({
  page,
}) => {
  await page.goto('/');
  await fillValidForm(page);

  const post = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/route-plans') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /plan route/i }).click();
  const finished = await post;
  expect([200, 201]).toContain(finished.status());

  await expect(page.getByText('Route alternatives (3)')).toBeVisible();
  await expect(page.getByText(/Recommended: Route /)).toBeVisible();
  const cards = page.locator('section[aria-label="Route alternatives"]');
  await expect(cards.getByText('Recommended', { exact: true })).toHaveCount(1);
  for (const label of ['Route 1', 'Route 2', 'Route 3']) {
    await expect(cards.getByRole('heading', { name: label, exact: true })).toBeVisible();
  }
});

test('shows a backend validation error for input the client cannot catch', async ({
  page,
}) => {
  await page.goto('/');
  // Backend rejects addresses over 200 characters; the client has no
  // length rule, so this reaches the server and returns 400.
  await page.getByLabel(/origin/i).fill('A'.repeat(201));
  await page.getByLabel(/destination/i).fill('Dallas, TX');
  await page.getByLabel(/departure date and time/i).fill('2026-10-12T14:30');
  await page.getByLabel(/load weight/i).fill('20000');
  await page.getByRole('button', { name: /plan route/i }).click();

  await expect(page.getByText('Please review the route plan details.')).toBeVisible();
  await page.getByText('Technical details').first().click();
  await expect(page.getByText(/Request ID:/)).toBeVisible();
});

test('starts a new plan without showing stale results', async ({ page }) => {
  await page.goto('/');
  await fillValidForm(page);
  await page.getByRole('button', { name: /plan route/i }).click();
  await expect(page.getByText('Route alternatives (3)')).toBeVisible();

  await page.getByRole('button', { name: /start new plan/i }).click();
  await expect(page.getByText('Route alternatives (3)')).toBeHidden();

  await page.getByRole('button', { name: /plan route/i }).click();
  await expect(page.getByText('Route alternatives (3)')).toBeVisible();
  await expect(page.getByText(/Recommended: Route /)).toHaveCount(1);
});

test('has no critical accessibility violations on form and result states', async ({
  page,
}) => {
  await page.goto('/');
  const formResults = await new AxeBuilder({ page }).analyze();
  expect(formResults.violations).toEqual([]);

  await fillValidForm(page);
  await page.getByRole('button', { name: /plan route/i }).click();
  await expect(page.getByText('Route alternatives (3)')).toBeVisible();
  const resultResults = await new AxeBuilder({ page }).analyze();
  expect(resultResults.violations).toEqual([]);
});

test('flags demonstration geometry when the mock provider plans the trip', async ({
  page,
}) => {
  await page.goto('/');
  await fillValidForm(page);
  await page.getByRole('button', { name: /plan route/i }).click();

  // The dev backend runs the mock provider, so the plan must say so.
  await expect(page.getByText('Route alternatives (3)')).toBeVisible();
  await expect(page.getByText(/Demonstration geometry/)).toBeVisible();
});

test('prefills origin, departure, and load weight in pounds', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel(/origin/i)).toHaveValue('Chicago, IL');
  await expect(page.getByLabel(/load weight/i)).toHaveValue('30000');
  const departure = await page.getByLabel(/departure date and time/i).inputValue();
  expect(departure).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});
