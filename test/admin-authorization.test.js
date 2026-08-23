const { describe, expect, test } = require('bun:test');
const fs = require('fs');
const path = require('path');
const pug = require('pug');

const routesPath = path.join(__dirname, '..', 'src', 'routes');
const viewsPath = path.join(__dirname, '..', 'src', 'views');

function readRoute(name) {
  return fs.readFileSync(path.join(routesPath, name), 'utf8');
}

function renderLayoutForUser(user) {
  return pug.renderFile(path.join(viewsPath, 'dashboard', 'user.pug'), {
    basedir: viewsPath,
    title: 'Dashboard',
    user,
    certificates: []
  });
}

describe('admin authorization boundaries', () => {
  test('dashboard user, email and request resources require strict admin role', () => {
    const source = readRoute('dashboard.js');

    expect(source).toContain("createAuthenticatedMiddleware({ sequelize })");
    expect(source).toContain('assertPrivilegedEmailAllowed');
    expect(source).toContain("req.session.user.role !== 'admin'");
    expect(source).toContain("router.get('/certificate-requests', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/certificate-requests/:id', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/emails', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/emails/queue', isAuthenticated, isAdmin");
    expect(source).toContain("router.post('/emails', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/users', isAuthenticated, isAdmin");
    expect(source).toContain("router.post('/users/delete/:id', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/certificates', isAuthenticated, isAdminOrOperator");
    expect(source).toContain("req.session.user.role !== 'admin' && req.session.user.role !== 'operator'");
  });

  test('certificate management routes allow admins and operators only', () => {
    const source = readRoute('certificates.js');

    expect(source).toContain("createAuthenticatedMiddleware({ sequelize })");
    expect(source).toContain("req.session.user.role !== 'admin' && req.session.user.role !== 'operator'");
    expect(source).toContain("router.get('/issue/ecpf', isAuthenticated, isAdminOrOperator");
    expect(source).toContain("router.post('/issue/ecpf', isAuthenticated, isAdminOrOperator");
    expect(source).toContain("router.get('/issue/ecnpj', isAuthenticated, isAdminOrOperator");
    expect(source).toContain("router.post('/issue/ecnpj', isAuthenticated, isAdminOrOperator");
    expect(source).toContain("router.post('/revoke/:id', isAuthenticated, isAdminOrOperator");
    expect(source).toContain("router.get('/users', isAuthenticated, isAdminOrOperator");
    expect(source).toContain("router.get('/validate', (req, res)");
    expect(source).toContain("router.post('/validate', async (req, res)");
    expect(source).toContain("certificate.userId !== req.session.user.id");
  });

  test('operator navigation exposes certificate management but not admin-only areas', () => {
    const html = renderLayoutForUser({
      id: 7,
      username: 'OPERA1',
      fullName: 'OPERADOR TESTE',
      email: 'operador@example.com',
      role: 'operator'
    });

    expect(html).not.toContain('/dashboard/users');
    expect(html).not.toContain('/dashboard/certificate-requests');
    expect(html).not.toContain('/dashboard/emails');
    expect(html).toContain('/dashboard/certificates');
    expect(html).toContain('/certificates/issue/ecpf');
    expect(html).toContain('/certificates/issue/ecnpj');
  });

  test('user edit route normalizes e-mail before privileged role validation', () => {
    const source = readRoute('dashboard.js');
    const editRouteStart = source.indexOf("router.post('/users/edit/:id'");
    const editRouteEnd = source.indexOf("router.post('/users/delete/:id'");
    const editRouteSource = source.slice(editRouteStart, editRouteEnd);

    expect(editRouteSource).toContain('const normalizedEmail = String(email || \'\').trim().toLowerCase();');
    expect(editRouteSource.indexOf('const normalizedEmail')).toBeLessThan(editRouteSource.indexOf('assertPrivilegedEmailAllowed'));
  });
});
