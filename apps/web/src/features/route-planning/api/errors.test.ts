import { describe, expect, it } from 'vitest';

import {
  categoryForStatus,
  RoutePlanApiError,
  USER_MESSAGES,
  weatherUserMessage,
} from './errors';

describe('categoryForStatus', () => {
  it('maps documented statuses to categories', () => {
    expect(categoryForStatus(400)).toBe('validation');
    expect(categoryForStatus(422)).toBe('domain');
    expect(categoryForStatus(502)).toBe('provider');
    expect(categoryForStatus(503)).toBe('unavailable');
  });

  it('treats unknown statuses as unexpected', () => {
    expect(categoryForStatus(500)).toBe('unexpected');
    expect(categoryForStatus(404)).toBe('unexpected');
  });
});

describe('RoutePlanApiError', () => {
  it('exposes the fixed user-safe message per category', () => {
    expect(USER_MESSAGES.validation).toBe('Please review the route plan details.');
    expect(USER_MESSAGES.domain).toBe(
      'The submitted values are not valid for route planning.',
    );
    expect(USER_MESSAGES.provider).toBe(
      'A route or weather provider failed while creating this plan.',
    );
    expect(USER_MESSAGES.unavailable).toBe(
      'The route planning service is temporarily unavailable. Please try again.',
    );
    expect(USER_MESSAGES.unexpected).toBe(
      'We could not create the route plan. Please try again.',
    );
  });

  it('carries diagnostics without leaking them into the message', () => {
    const error = new RoutePlanApiError({
      category: 'validation',
      status: 400,
      requestId: 'req-1',
      backendCode: 'INVALID_REQUEST',
      backendMessage: 'origin: blank',
    });
    expect(error.message).toBe(USER_MESSAGES.validation);
    expect(error.message).not.toContain('INVALID_REQUEST');
    expect(error.toDetails()).toEqual({
      category: 'validation',
      status: 400,
      requestId: 'req-1',
      backendCode: 'INVALID_REQUEST',
      backendMessage: 'origin: blank',
    });
  });

  it('never reuses route-plan wording for a weather failure', () => {
    for (const category of Object.keys(USER_MESSAGES) as (keyof typeof USER_MESSAGES)[]) {
      const message = weatherUserMessage(
        new RoutePlanApiError({
          category,
          status: null,
          requestId: null,
          backendCode: null,
          backendMessage: null,
        }),
      );
      expect(message).not.toBe(USER_MESSAGES[category]);
      expect(message.toLowerCase()).not.toContain('route plan');
    }
  });

  it('falls back to unexpected weather wording for unknown errors', () => {
    expect(weatherUserMessage(new Error('boom'))).toMatch(/weather|forecast/i);
    expect(weatherUserMessage('nope')).toMatch(/weather|forecast/i);
  });
});
