import { describe, expect, it } from 'vitest';

import { normalizeFormValues, routePlanFormSchema } from './schemas';

const VALID = {
  origin: 'Chicago, IL',
  destination: 'Dallas, TX',
  departure: '2026-10-12T14:30',
  loadWeight: 20000,
  checkpointInterval: 25,
} as const;

describe('routePlanFormSchema', () => {
  it('accepts a complete valid submission', () => {
    expect(routePlanFormSchema.safeParse({ ...VALID }).success).toBe(true);
  });

  it('rejects blank origin and destination', () => {
    expect(routePlanFormSchema.safeParse({ ...VALID, origin: '   ' }).success).toBe(
      false,
    );
    expect(routePlanFormSchema.safeParse({ ...VALID, destination: '' }).success).toBe(
      false,
    );
  });

  it('rejects identical origin and destination after trimming', () => {
    const result = routePlanFormSchema.safeParse({
      ...VALID,
      destination: '  Chicago, IL ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing or invalid departure times', () => {
    expect(routePlanFormSchema.safeParse({ ...VALID, departure: '' }).success).toBe(
      false,
    );
    expect(
      routePlanFormSchema.safeParse({ ...VALID, departure: 'yesterday' }).success,
    ).toBe(false);
  });

  it('rejects negative, non-finite, or missing load weights', () => {
    expect(routePlanFormSchema.safeParse({ ...VALID, loadWeight: -1 }).success).toBe(
      false,
    );
    expect(routePlanFormSchema.safeParse({ ...VALID, loadWeight: '' }).success).toBe(
      false,
    );
    expect(routePlanFormSchema.safeParse({ ...VALID, loadWeight: 'abc' }).success).toBe(
      false,
    );
  });

  it('accepts zero load weight and string numbers from inputs', () => {
    expect(routePlanFormSchema.safeParse({ ...VALID, loadWeight: 0 }).success).toBe(true);
    expect(routePlanFormSchema.safeParse({ ...VALID, loadWeight: '20000' }).success).toBe(
      true,
    );
  });

  it('rejects checkpoint intervals outside 10, 25, or 50', () => {
    expect(
      routePlanFormSchema.safeParse({ ...VALID, checkpointInterval: 7 }).success,
    ).toBe(false);
    for (const interval of [10, 25, 50]) {
      expect(
        routePlanFormSchema.safeParse({ ...VALID, checkpointInterval: interval }).success,
      ).toBe(true);
    }
  });
});

describe('normalizeFormValues', () => {
  it('serializes the request shape with an explicit UTC timestamp', () => {
    const normalized = normalizeFormValues({ ...VALID });
    expect(normalized.origin).toBe('Chicago, IL');
    expect(normalized.destination).toBe('Dallas, TX');
    expect(normalized.departure_at).toMatch(/Z$/);
    expect(normalized.load_weight_lb).toBe(20000);
    expect(normalized.checkpoint_interval_miles).toBe(25);
  });
});
