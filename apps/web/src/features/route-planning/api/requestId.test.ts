import { describe, expect, it } from 'vitest';

import { generateRequestId, isValidRequestId, resolveRequestId } from './requestId';

describe('isValidRequestId', () => {
  it('accepts the backend rule: 1-128 ASCII letters, digits, - and _', () => {
    expect(isValidRequestId('fe-test-123_ABC')).toBe(true);
    expect(isValidRequestId('x')).toBe(true);
    expect(isValidRequestId('a'.repeat(128))).toBe(true);
  });

  it('rejects anything the backend would replace', () => {
    expect(isValidRequestId('')).toBe(false);
    expect(isValidRequestId('has space')).toBe(false);
    expect(isValidRequestId('semi;colon')).toBe(false);
    expect(isValidRequestId('newline\n')).toBe(false);
    expect(isValidRequestId('a'.repeat(129))).toBe(false);
    expect(isValidRequestId(123)).toBe(false);
    expect(isValidRequestId(null)).toBe(false);
  });
});

describe('generateRequestId', () => {
  it('generates a 32-hex id like the backend fallback', () => {
    expect(generateRequestId()).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('resolveRequestId', () => {
  it('propagates a valid supplied id', () => {
    expect(resolveRequestId('keep-me')).toBe('keep-me');
  });

  it('generates a fresh id for missing or invalid input', () => {
    expect(resolveRequestId()).toMatch(/^[0-9a-f]{32}$/);
    expect(resolveRequestId('not valid!')).toMatch(/^[0-9a-f]{32}$/);
  });
});
