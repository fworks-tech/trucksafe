import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  makeAllIneligiblePlan,
  makeCheckpoint,
  makeRoute,
  makeRoutePlan,
} from '../../features/route-planning/fixtures';
import { CheckpointList } from './CheckpointList';
import { RecommendationSummary } from './RecommendationSummary';
import { RouteCard } from './RouteCard';
import { RouteComparison } from './RouteComparison';
import { WarningList } from './WarningList';
import { renderWithProviders } from '../../../test/render';

describe('RouteCard', () => {
  it('identifies the recommended route and its stats', () => {
    renderWithProviders(
      <RouteCard
        route={makeRoute('route-1', { recommended: true })}
        recommended={true}
      />,
    );
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('route-1')).toBeInTheDocument();
    expect(screen.getByText('Eligible')).toBeInTheDocument();
  });

  it('never shows an ineligible route as recommended', () => {
    renderWithProviders(
      <RouteCard
        route={makeRoute('route-9', { eligible: false, recommended: true })}
        recommended={true}
      />,
    );
    expect(screen.getByText('Not eligible')).toBeInTheDocument();
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
  });
});

describe('RouteComparison', () => {
  it('renders exactly the routes returned by the backend', () => {
    const plan = makeRoutePlan();
    renderWithProviders(
      <RouteComparison
        routes={plan.routes}
        recommendedRouteId={plan.recommended_route_id}
        selectedRouteId={null}
        onSelectRoute={() => {}}
      />,
    );
    expect(screen.getByText('Route alternatives (3)')).toBeInTheDocument();
    for (const route of plan.routes) {
      expect(screen.getByText(route.id)).toBeInTheDocument();
    }
  });

  it('marks the selected route and syncs selection through cards', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    const plan = makeRoutePlan();
    const { rerender } = renderWithProviders(
      <RouteComparison
        routes={plan.routes}
        recommendedRouteId={plan.recommended_route_id}
        selectedRouteId="route-1"
        onSelectRoute={(id) => seen.push(id)}
      />,
    );
    expect(screen.getAllByText('Selected')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Selected on map' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const showButtons = screen.getAllByRole('button', { name: 'Show on map' });
    expect(showButtons).toHaveLength(2);
    await user.click(showButtons[0]!);
    expect(seen).toEqual(['route-2']);
    rerender(
      <RouteComparison
        routes={plan.routes}
        recommendedRouteId={plan.recommended_route_id}
        selectedRouteId="route-2"
        onSelectRoute={(id) => seen.push(id)}
      />,
    );
    expect(screen.getAllByText('Selected')).toHaveLength(1);
  });
});

describe('RecommendationSummary', () => {
  it('shows the recommended route with the backend reason', () => {
    const plan = makeRoutePlan();
    renderWithProviders(<RecommendationSummary response={plan} requestId="req-1" />);
    expect(screen.getByText('Recommended: route-1')).toBeInTheDocument();
    expect(screen.getByText(/deterministic route ranking criteria/)).toBeInTheDocument();
    expect(screen.getByText(/severe_miles/)).toBeInTheDocument();
  });

  it('shows no recommendation when every route is ineligible', () => {
    const plan = makeAllIneligiblePlan();
    renderWithProviders(<RecommendationSummary response={plan} requestId={null} />);
    expect(screen.getByText(/no eligible route available/i)).toBeInTheDocument();
    expect(screen.queryByText(/Recommended:/)).not.toBeInTheDocument();
  });
});

describe('CheckpointList', () => {
  it('orders checkpoints with ETA, risk, and origin/destination markers', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CheckpointList
        routeId="route-1"
        checkpoints={[
          makeCheckpoint({ distanceMiles: 0, riskReasons: ['wind 30 mph'] }),
          makeCheckpoint({
            distanceMiles: 25,
            riskLevel: 'HIGH',
            riskScore: 3,
            eta: '2026-10-12T15:00:00Z',
          }),
        ]}
      />,
    );
    await user.click(screen.getByText(/Checkpoints \(2\)/));
    expect(screen.getByText('Origin')).toBeInTheDocument();
    expect(screen.getByText('Destination')).toBeInTheDocument();
    expect(screen.getByText(/12 Oct 2026, 15:00 UTC/)).toBeInTheDocument();
    expect(screen.getByText('Risk: High')).toBeInTheDocument();
    expect(screen.getByText(/wind 30 mph/)).toBeInTheDocument();
  });

  it('shows unavailable weather instead of a risk level', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CheckpointList
        routeId="route-1"
        checkpoints={[
          makeCheckpoint({ weatherAvailable: false, riskLevel: null, riskScore: null }),
        ]}
      />,
    );
    await user.click(screen.getByText(/Checkpoints \(1\)/));
    expect(screen.getByText('Weather unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Risk: Low')).not.toBeInTheDocument();
  });

  it('handles routes without checkpoints', () => {
    renderWithProviders(<CheckpointList routeId="route-1" checkpoints={[]} />);
    expect(screen.getByText(/no checkpoints reported/i)).toBeInTheDocument();
  });
});

describe('WarningList', () => {
  it('displays every warning and nothing when empty', () => {
    const { unmount } = renderWithProviders(
      <WarningList warnings={['route-3 ineligible: no-travel segments present']} />,
    );
    expect(screen.getByText(/no-travel segments present/)).toBeInTheDocument();
    unmount();
    const empty = renderWithProviders(<WarningList warnings={[]} />);
    expect(empty.container).toBeEmptyDOMElement();
  });
});
