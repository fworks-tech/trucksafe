import { describe, expect, it } from 'vitest';

import type { CheckpointPayload } from '../route-planning/types';
import { checkpointPopupText, heatCellPopupText } from './popupText';
import type { MappableWeatherCell } from './geo';

function checkpoint(overrides: Partial<CheckpointPayload> = {}): CheckpointPayload {
  return {
    sequence: 3,
    checkpoint_id: 'cp-3',
    distance_miles: 25.0,
    latitude: 41.0,
    longitude: -87.0,
    eta: '2026-10-14T02:07:00Z',
    weather_available: true,
    risk_level: 'LOW',
    risk_score: 1.0,
    risk_reasons: ['rain 0.1 in/h'],
    ...overrides,
  };
}

describe('checkpointPopupText', () => {
  it('names the checkpoint, risk, distance, ETA, and reason', () => {
    expect(checkpointPopupText(checkpoint())).toBe(
      'Checkpoint 3 · Low risk · 25.0 mi from origin · ETA 14 Oct 2026, 02:07 UTC · rain 0.1 in/h',
    );
  });

  it('falls back when weather is unavailable', () => {
    expect(
      checkpointPopupText(
        checkpoint({ weather_available: false, risk_level: null, risk_reasons: [] }),
      ),
    ).toBe(
      'Checkpoint 3 · Weather unavailable · 25.0 mi from origin · ETA 14 Oct 2026, 02:07 UTC',
    );
  });
});

describe('heatCellPopupText', () => {
  it('prefers reasons, which already carry observed values', () => {
    const cell: MappableWeatherCell = {
      cellId: 'cell-1',
      longitude: -87.0,
      latitude: 41.0,
      risk: 'HIGH',
      riskScore: 3.0,
      riskReasons: ['wind 38 mph'],
      windMph: 38,
      rainInchesPerHour: 0,
      snowInchesPerHour: null,
    };
    expect(heatCellPopupText(cell)).toBe('Forecast · High risk · wind 38 mph');
  });

  it('falls back to raw measures when no reasons were sent', () => {
    const cell: MappableWeatherCell = {
      cellId: 'cell-3',
      longitude: -87.0,
      latitude: 41.0,
      risk: 'MODERATE',
      riskScore: 2.0,
      riskReasons: [],
      windMph: 28,
      rainInchesPerHour: 0.1,
      snowInchesPerHour: null,
    };
    expect(heatCellPopupText(cell)).toBe(
      'Forecast · Moderate risk · Wind 28 mph · Rain 0.1 in/h',
    );
  });

  it('omits missing measures', () => {
    const cell: MappableWeatherCell = {
      cellId: 'cell-2',
      longitude: -87.0,
      latitude: 41.0,
      risk: 'unavailable',
      riskScore: null,
      riskReasons: [],
      windMph: null,
      rainInchesPerHour: null,
      snowInchesPerHour: null,
    };
    expect(heatCellPopupText(cell)).toBe('Forecast · Weather unavailable');
  });
});
