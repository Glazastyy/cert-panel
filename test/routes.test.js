const { describe, expect, test } = require('bun:test');

describe('route modules', () => {
  test('load with the installed Express version', () => {
    const authRoutes = require('../src/routes/auth');
    const certificateRoutes = require('../src/routes/certificates');
    const dashboardRoutes = require('../src/routes/dashboard');

    expect(typeof authRoutes).toBe('function');
    expect(typeof certificateRoutes).toBe('function');
    expect(typeof dashboardRoutes).toBe('function');
  });
});
