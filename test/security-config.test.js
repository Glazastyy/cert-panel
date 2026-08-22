const { describe, expect, test } = require('bun:test');
const { getRequiredEnv } = require('../src/config/security');

describe('security configuration', () => {
  test('requires session secret without fallback values', () => {
    expect(() => getRequiredEnv('SESSION_SECRET', {})).toThrow('SESSION_SECRET is required');
  });

  test('returns configured session secret', () => {
    expect(getRequiredEnv('SESSION_SECRET', { SESSION_SECRET: 'configured-secret' })).toBe('configured-secret');
  });
});
