import { describe, expect, it } from 'vitest';

import { worstRiskLevel } from './risk';
import { makeCheckpoint } from './fixtures';

describe('worstRiskLevel', () => {
  it('returns null when no checkpoint reports risk', () => {
    expect(worstRiskLevel([])).toBeNull();
    expect(worstRiskLevel([makeCheckpoint({ riskLevel: null })])).toBeNull();
  });

  it('selects the highest severity present', () => {
    const checkpoints = [
      makeCheckpoint({ riskLevel: 'LOW' }),
      makeCheckpoint({ riskLevel: 'SEVERE' }),
      makeCheckpoint({ riskLevel: 'MODERATE' }),
    ];
    expect(worstRiskLevel(checkpoints)).toBe('SEVERE');
  });

  it('ranks NO_TRAVEL above SEVERE', () => {
    const checkpoints = [
      makeCheckpoint({ riskLevel: 'SEVERE' }),
      makeCheckpoint({ riskLevel: 'NO_TRAVEL' }),
    ];
    expect(worstRiskLevel(checkpoints)).toBe('NO_TRAVEL');
  });

  it('ignores null levels when a real level exists', () => {
    const checkpoints = [
      makeCheckpoint({ riskLevel: null }),
      makeCheckpoint({ riskLevel: 'HIGH' }),
    ];
    expect(worstRiskLevel(checkpoints)).toBe('HIGH');
  });
});
