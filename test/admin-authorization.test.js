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
  test('dashboard admin resources require strict admin role', () => {
    const source = readRoute('dashboard.js');

    expect(source).toContain("req.session.user.role !== 'admin'");
    expect(source).toContain("router.get('/certificate-requests', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/certificate-requests/:id', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/emails', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/emails/queue', isAuthenticated, isAdmin");
    expect(source).toContain("router.post('/emails', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/users', isAuthenticated, isAdmin");
    expect(source).toContain("router.post('/users/delete/:id', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/certificates', isAuthenticated, isAdmin");
    expect(source).not.toContain("role !== 'admin' && req.session.user.role !== 'operator'");
    expect(source).not.toContain("role === 'admin' || req.session.user.role === 'operator'");
  });

  test('certificate administration routes require strict admin role', () => {
    const source = readRoute('certificates.js');

    expect(source).toContain("req.session.user.role !== 'admin'");
    expect(source).toContain("router.get('/issue/ecpf', isAuthenticated, isAdmin");
    expect(source).toContain("router.post('/issue/ecpf', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/issue/ecnpj', isAuthenticated, isAdmin");
    expect(source).toContain("router.post('/issue/ecnpj', isAuthenticated, isAdmin");
    expect(source).toContain("router.post('/revoke/:id', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/users', isAuthenticated, isAdmin");
    expect(source).toContain("router.get('/validate', isAuthenticated");
    expect(source).toContain("router.post('/validate', isAuthenticated");
    expect(source).toContain("certificate.userId !== req.session.user.id");
    expect(source).not.toContain("role !== 'admin' && req.session.user.role !== 'operator'");
    expect(source).not.toContain("role === 'admin' || user.role === 'operator'");
  });

  test('non-admin navigation does not expose admin certificate or user management links', () => {
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
    expect(html).not.toContain('/dashboard/certificates');
    expect(html).not.toContain('/certificates/issue/ecpf');
    expect(html).not.toContain('/certificates/issue/ecnpj');
  });
});
