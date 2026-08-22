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

  test('binds the web server to a configurable host for containers', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'index.js'), 'utf8');

    expect(source).toContain("process.env.APP_HOST || '0.0.0.0'");
    expect(source).toContain('app.listen(HTTP_PORT, APP_HOST');
    expect(source).toContain('listen(HTTPS_PORT, APP_HOST');
  });
});
