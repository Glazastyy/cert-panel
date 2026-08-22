const { describe, expect, test } = require('bun:test');

const {
  createEmailService,
  EmailConfigurationError,
  buildRecipientList
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

  test('throws a configuration error for manual messages without SMTP settings', async () => {
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
