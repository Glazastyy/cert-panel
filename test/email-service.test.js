const { describe, expect, test } = require('bun:test');

const {
  createEmailService,
  EmailConfigurationError,
  buildRecipientList,
  buildRecipientUsers,
  renderEmailTemplate
} = require('../src/services/email');

describe('email service', () => {
  test('deduplicates active user recipients and supports selected users', () => {
    const users = [
      { id: 1, email: 'ana@example.com', active: true },
      { id: 2, email: 'bruno@example.com', active: true },
      { id: 3, email: 'ana@example.com', active: true },
      { id: 4, email: 'inactive@example.com', active: false }
    ];

    expect(buildRecipientList(users, 'all', [])).toEqual(['ana@example.com', 'bruno@example.com']);
    expect(buildRecipientList(users, 'selected', ['2', '4'])).toEqual(['bruno@example.com']);
  });

  test('selects active recipient users for personalized messages', () => {
    const users = [
      { id: 1, email: 'ana@example.com', active: true },
      { id: 2, email: 'bruno@example.com', active: true },
      { id: 3, email: 'inactive@example.com', active: false }
    ];

    expect(buildRecipientUsers(users, 'selected', ['2', '3']).map((user) => user.email)).toEqual(['bruno@example.com']);
  });

  test('renders global and user variables in e-mail templates', () => {
    const rendered = renderEmailTemplate('Olá {{user.fullName}}, acesse {{urls.dashboard}} em {{date.today}}.', {
      user: {
        id: 7,
        username: 'ana',
        fullName: 'Ana Silva',
        email: 'ana@example.com'
      },
      baseUrl: 'https://test-pcert.zerocert.com.br',
      now: new Date('2026-08-22T12:00:00.000Z')
    });

    expect(rendered).toBe('Olá Ana Silva, acesse https://test-pcert.zerocert.com.br/dashboard em 22/08/2026.');
  });

  test('rejects unknown e-mail template variables', () => {
    expect(() => renderEmailTemplate('Olá {{user.password}}', {
      user: {
        id: 7,
        username: 'ana',
        fullName: 'Ana Silva',
        email: 'ana@example.com'
      },
      baseUrl: 'https://test-pcert.zerocert.com.br',
      now: new Date('2026-08-22T12:00:00.000Z')
    })).toThrow('Variável de e-mail inválida');
  });

  test('throws a configuration error for manual messages without email provider settings', async () => {
    const service = createEmailService({}, {
      createTransport: () => ({
        sendMail: async () => ({ messageId: 'unused' })
      })
    });

    await expect(service.sendManualMessage({
      recipients: ['ana@example.com'],
      subject: 'Aviso',
      message: 'Mensagem'
    })).rejects.toBeInstanceOf(EmailConfigurationError);
  });

  test('sends manual messages with configured SMTP transport', async () => {
    const sent = [];
    const service = createEmailService({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'secret',
      EMAIL_FROM: 'ZeroCert <no-reply@example.com>'
    }, {
      createTransport: () => ({
        sendMail: async (payload) => {
          sent.push(payload);
          return { messageId: 'message-1' };
        }
      })
    });

    const result = await service.sendManualMessage({
      recipients: ['ana@example.com', 'bruno@example.com'],
      subject: 'Aviso',
      message: 'Mensagem'
    });

    expect(result.messageId).toBe('message-1');
    expect(sent[0].to).toEqual(['ana@example.com', 'bruno@example.com']);
    expect(sent[0].from).toBe('ZeroCert <no-reply@example.com>');
    expect(sent[0].subject).toBe('Aviso');
    expect(sent[0].text).toContain('Mensagem');
  });

  test('sends personalized manual messages as plain text', async () => {
    const sent = [];
    const service = createEmailService({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      EMAIL_FROM: 'ZeroCert <no-reply@example.com>'
    }, {
      createTransport: () => ({
        sendMail: async (payload) => {
          sent.push(payload);
          return { messageId: `message-${sent.length}` };
        }
      })
    });

    await service.sendManualMessage({
      recipientUsers: [
        { id: 1, username: 'ana', fullName: 'Ana Silva', email: 'ana@example.com' },
        { id: 2, username: 'bruno', fullName: 'Bruno Dias', email: 'bruno@example.com' }
      ],
      subject: 'Olá {{user.firstName}}',
      message: 'Painel: {{urls.dashboard}}',
      messageFormat: 'text',
      baseUrl: 'https://test-pcert.zerocert.com.br',
      now: new Date('2026-08-22T12:00:00.000Z')
    });

    expect(sent).toHaveLength(2);
    expect(sent[0].to).toEqual(['ana@example.com']);
    expect(sent[0].subject).toBe('Olá Ana');
    expect(sent[0].text).toBe('Painel: https://test-pcert.zerocert.com.br/dashboard');
    expect(sent[0].html).toBeUndefined();
    expect(sent[1].subject).toBe('Olá Bruno');
  });

  test('sends personalized manual messages as HTML', async () => {
    const sent = [];
    const service = createEmailService({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      EMAIL_FROM: 'ZeroCert <no-reply@example.com>'
    }, {
      createTransport: () => ({
        sendMail: async (payload) => {
          sent.push(payload);
          return { messageId: 'message-1' };
        }
      })
    });

    await service.sendManualMessage({
      recipientUsers: [
        { id: 1, username: 'ana', fullName: 'Ana Silva', email: 'ana@example.com' }
      ],
      subject: 'Atualização',
      message: '<p>Olá {{user.fullName}}</p><a href="{{urls.login}}">Login</a>',
      messageFormat: 'html',
      baseUrl: 'https://test-pcert.zerocert.com.br',
      now: new Date('2026-08-22T12:00:00.000Z')
    });

    expect(sent[0].html).toBe('<p>Olá Ana Silva</p><a href="https://test-pcert.zerocert.com.br/login">Login</a>');
    expect(sent[0].text).toBeUndefined();
  });

  test('sends registration confirmation codes through the configured provider', async () => {
    const sent = [];
    const service = createEmailService({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      EMAIL_FROM: 'ZeroCert <no-reply@example.com>'
    }, {
      createTransport: () => ({
        sendMail: async (payload) => {
          sent.push(payload);
          return { messageId: 'message-1' };
        }
      })
    });

    await service.sendVerificationCode({
      to: 'ana@example.com',
      fullName: 'Ana Silva',
      code: 'ABC123'
    });

    expect(sent[0].to).toEqual(['ana@example.com']);
    expect(sent[0].subject).toBe('Confirme seu cadastro no ZeroCert');
    expect(sent[0].text).toContain('Ana Silva');
    expect(sent[0].text).toContain('ABC123');
  });

  test('sends manual messages with configured Resend API', async () => {
    const requests = [];
    const service = createEmailService({
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'ZeroCert <no-reply@example.com>'
    }, {
      fetch: async (url, payload) => {
        requests.push({ url, payload });
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'email-1' })
        };
      }
    });

    const result = await service.sendManualMessage({
      recipients: ['ana@example.com', 'bruno@example.com'],
      subject: 'Aviso',
      message: 'Mensagem'
    });

    expect(result.provider).toBe('resend');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://api.resend.com/emails');
    expect(requests[0].payload.headers.Authorization).toBe('Bearer re_test_key');
    expect(JSON.parse(requests[0].payload.body)).toEqual({
      from: 'ZeroCert <no-reply@example.com>',
      to: ['ana@example.com', 'bruno@example.com'],
      subject: 'Aviso',
      text: 'Mensagem'
    });
  });

  test('auto-detects Resend when API key is configured without explicit provider', async () => {
    const requests = [];
    const service = createEmailService({
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'ZeroCert <no-reply@example.com>'
    }, {
      fetch: async (url, payload) => {
        requests.push({ url, payload });
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'email-1' })
        };
      }
    });

    await service.sendManualMessage({
      recipients: ['ana@example.com'],
      subject: 'Aviso',
      message: 'Mensagem'
    });

    expect(requests).toHaveLength(1);
  });

  test('sends Resend messages in batches of up to fifty recipients', async () => {
    const requests = [];
    const recipients = Array.from({ length: 51 }, (_, index) => `user-${index}@example.com`);
    const service = createEmailService({
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      EMAIL_FROM: 'ZeroCert <no-reply@example.com>'
    }, {
      fetch: async (url, payload) => {
        requests.push({ url, payload });
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: `email-${requests.length}` })
        };
      }
    });

    const result = await service.sendManualMessage({
      recipients,
      subject: 'Aviso',
      message: 'Mensagem'
    });

    expect(result.results).toHaveLength(2);
    expect(JSON.parse(requests[0].payload.body).to).toHaveLength(50);
    expect(JSON.parse(requests[1].payload.body).to).toHaveLength(1);
  });

  test('throws a configuration error for Resend without API key', async () => {
    const service = createEmailService({
      EMAIL_PROVIDER: 'resend',
      EMAIL_FROM: 'ZeroCert <no-reply@example.com>'
    });

    await expect(service.sendManualMessage({
      recipients: ['ana@example.com'],
      subject: 'Aviso',
      message: 'Mensagem'
    })).rejects.toBeInstanceOf(EmailConfigurationError);
  });

  test('does not fail automatic notifications when SMTP is not configured', async () => {
    const service = createEmailService({}, {
      createTransport: () => ({
        sendMail: async () => ({ messageId: 'unused' })
      }),
      logger: {
        warn: () => {}
      }
    });

    const result = await service.sendNotification({
      to: 'ana@example.com',
      subject: 'Login realizado',
      message: 'Um login foi realizado.'
    });

    expect(result.skipped).toBe(true);
  });
});
