import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EligibilityBadge } from './EligibilityBadge';
import { RequestIdNotice } from './RequestIdNotice';
import { RiskBadge } from './RiskBadge';
import { WeatherStatus } from './WeatherStatus';
import { RISK_LABELS } from '../../features/route-planning/risk';
import { renderWithProviders } from '../../../test/render';

describe('RiskBadge', () => {
  it('renders every risk level as visible text, never color alone', () => {
    const levels = Object.keys(RISK_LABELS) as Array<keyof typeof RISK_LABELS>;
    for (const level of levels) {
      const { unmount } = renderWithProviders(<RiskBadge level={level} />);
      expect(screen.getByText(`Risk: ${RISK_LABELS[level]}`)).toBeInTheDocument();
      unmount();
    }
  });

  it('renders unavailable risk instead of implying safety', () => {
    renderWithProviders(<RiskBadge level={null} />);
    expect(screen.getByText('Risk unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Risk: Low')).not.toBeInTheDocument();
  });
});

describe('EligibilityBadge', () => {
  it('marks eligible and ineligible routes with explicit text', () => {
    const { unmount } = renderWithProviders(<EligibilityBadge isEligible={true} />);
    expect(screen.getByText('Eligible')).toBeInTheDocument();
    unmount();
    renderWithProviders(<EligibilityBadge isEligible={false} />);
    expect(screen.getByText('Not eligible')).toBeInTheDocument();
  });
});

describe('WeatherStatus', () => {
  it('shows unavailable weather distinctly from any risk level', () => {
    renderWithProviders(<WeatherStatus available={false} />);
    expect(screen.getByText('Weather unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Risk:/)).not.toBeInTheDocument();
  });

  it('renders nothing when weather is available', () => {
    const { container } = renderWithProviders(<WeatherStatus available={true} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RequestIdNotice', () => {
  it('shows the request id in collapsed diagnostics', () => {
    renderWithProviders(<RequestIdNotice requestId="req-abc-123" />);
    expect(screen.getByText('Technical details')).toBeInTheDocument();
    expect(screen.getByText(/req-abc-123/)).toBeInTheDocument();
  });

  it('renders nothing without a request id', () => {
    const { container } = renderWithProviders(<RequestIdNotice requestId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
