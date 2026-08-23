const { describe, expect, test } = require('bun:test');

const {
  DISPLAY_TIME_ZONE,
  formatDate,
  formatDateTime
} = require('../src/services/datetime');

describe('display datetime formatting', () => {
  test('formats datetimes in Sao Paulo time', () => {
    expect(DISPLAY_TIME_ZONE).toBe('America/Sao_Paulo');
    expect(formatDateTime(new Date('2026-08-23T12:30:00.000Z'))).toBe('23/08/2026, 09:30');
  });

  test('formats date-only strings without timezone day shifts', () => {
    expect(formatDate('1990-01-01')).toBe('01/01/1990');
  });
});
