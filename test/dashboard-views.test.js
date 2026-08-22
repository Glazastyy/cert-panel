const { describe, expect, test } = require('bun:test');
const fs = require('fs');
const path = require('path');
const pug = require('pug');

const viewsPath = path.join(__dirname, '..', 'src', 'views');

function renderView(relativePath, locals) {
  return pug.renderFile(path.join(viewsPath, relativePath), {
    ...locals,
    basedir: viewsPath
  });
}

describe('dashboard views', () => {
  test('load Bootstrap Icons stylesheet used by action buttons', () => {
    const html = renderView('dashboard/users.pug', {
      title: 'Gerenciar Usuários',
      user: {
        id: 1,
        fullName: 'Admin',
        role: 'admin'
      },
      users: []
    });

    expect(html).toContain('/css/bootstrap-icons.min.css');
  });

  test('render theme toggle controls in the shared layout', () => {
    const html = renderView('dashboard/users.pug', {
      title: 'Gerenciar Usuários',
      user: {
        id: 1,
        fullName: 'Admin',
        role: 'admin'
      },
      users: []
    });

    expect(html).toContain('data-bs-theme="light"');
    expect(html).toContain('id="themeToggle"');
    expect(html).toContain('aria-label="Alternar modo noturno"');
    expect(html).toContain('bi-moon-stars');
  });

  test('ship persisted dark mode assets', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'css', 'custom.css'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'js', 'custom.js'), 'utf8');

    expect(css).toContain('[data-bs-theme="dark"]');
    expect(css).toContain('--background-color: #0f1419');
    expect(css).toContain('--surface-elevated-color: #1f2933');
    expect(css).toContain('--bs-body-bg: var(--background-color)');
    expect(css).toContain('[data-bs-theme="dark"] .table');
    expect(css).toContain('[data-bs-theme="dark"] .btn-outline-primary');
    expect(css).toContain('[data-bs-theme="dark"] .form-control');
    expect(js).toContain('zerocert-theme');
    expect(js).toContain('localStorage');
    expect(js).toContain('data-bs-theme');
  });

  test('show visible action labels in users list', () => {
    const html = renderView('dashboard/users.pug', {
      title: 'Gerenciar Usuários',
      user: {
        id: 1,
        fullName: 'Admin',
        role: 'admin'
      },
      users: [
        {
          id: 2,
          username: 'usuario',
          fullName: 'Usuário Teste',
          email: 'usuario@example.com',
          role: 'user',
          active: true,
          lastLogin: null,
          createdAt: new Date('2026-01-01T00:00:00Z')
        }
      ]
    });

    expect(html).toContain('Editar');
    expect(html).toContain('Excluir');
  });

  test('show visible action labels in certificates list', () => {
    const html = renderView('dashboard/certificates.pug', {
      title: 'Gerenciar Certificados',
      user: {
        id: 1,
        fullName: 'Operador',
        role: 'operator'
      },
      certificates: [
        {
          id: 10,
          type: 'e-CPF',
          serialNumber: 'abcdef1234567890',
          subject: {
            name: 'Usuário Teste',
            cpf: '12345678901'
          },
          createdAt: new Date('2026-01-01T00:00:00Z'),
          validTo: new Date('2027-01-01T00:00:00Z'),
          revoked: false,
          User: {
            fullName: 'Usuário Teste'
          }
        }
      ]
    });

    expect(html).toContain('Visualizar');
  });

  test('show certificate request options on regular user dashboard', () => {
    const html = renderView('dashboard/user.pug', {
      title: 'Meus Certificados',
      user: {
        id: 3,
        fullName: 'Usuário',
        role: 'user'
      },
      certificates: []
    });

    expect(html).toContain('Solicitar e-CPF');
    expect(html).toContain('Solicitar e-CNPJ');
    expect(html).toContain('/certificates/request/ecpf');
    expect(html).toContain('/certificates/request/ecnpj');
  });

  test('show admin approval actions for pending certificate requests', () => {
    const html = renderView('dashboard/certificate-requests.pug', {
      title: 'Solicitações de Certificado',
      user: {
        id: 1,
        fullName: 'Admin',
        role: 'admin'
      },
      status: 'pending',
      requests: [
        {
          id: 8,
          type: 'e-CPF',
          status: 'pending',
          payload: {
            name: 'Usuário Teste',
            cpf: '12345678901'
          },
          createdAt: new Date('2026-01-01T00:00:00Z'),
          User: {
            fullName: 'Usuário Teste',
            email: 'usuario@example.com'
          }
        }
      ]
    });

    expect(html).toContain('Aprovar');
    expect(html).toContain('Rejeitar');
    expect(html).toContain('/dashboard/certificate-requests/8/approve');
    expect(html).toContain('/dashboard/certificate-requests/8/reject');
  });

  test('show admin email sending panel controls', () => {
    const html = renderView('dashboard/emails.pug', {
      title: 'Enviar E-mail',
      user: {
        id: 1,
        fullName: 'Admin',
        role: 'admin'
      },
      users: [
        {
          id: 2,
          fullName: 'Usuário Teste',
          email: 'usuario@example.com'
        }
      ]
    });

    expect(html).toContain('Todos os usuários ativos');
    expect(html).toContain('Usuários específicos');
    expect(html).toContain('name="subject"');
    expect(html).toContain('name="message"');
    expect(html).toContain('Enviar E-mail');
    expect(html).toContain('usuario@example.com');
  });
});
