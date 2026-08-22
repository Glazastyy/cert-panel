const nodemailer = require('nodemailer');

class EmailConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmailConfigurationError';
  }
}

function getEmailConfig(env = process.env) {
  const provider = String(env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT || 587);
  const user = env.SMTP_USER;
  const password = env.SMTP_PASSWORD;
  const from = env.EMAIL_FROM;
  const resendApiKey = env.RESEND_API_KEY;

  return {
    provider,
    host,
    port,
    secure: env.SMTP_SECURE === 'true' || port === 465,
    auth: user && password ? { user, pass: password } : null,
    from,
    resendApiKey
  };
}

function resolveEmailProvider(config) {
  if (config.provider) {
    return config.provider;
  }

  if (config.resendApiKey) {
    return 'resend';
  }

  return 'smtp';
}

function assertSmtpConfigured(config) {
  if (!config.host || !config.port || !config.from) {
    throw new EmailConfigurationError('Configuração de e-mail incompleta');
  }
}

function assertResendConfigured(config) {
  if (!config.resendApiKey || !config.from) {
    throw new EmailConfigurationError('Configuração de e-mail incompleta');
  }
}

function createTransport(config, dependencies) {
  assertSmtpConfigured(config);

  return dependencies.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth || undefined
  });
}

function normalizeRecipients(recipients) {
  return [...new Set((recipients || []).map((recipient) => String(recipient || '').trim()).filter(Boolean))];
}

function chunkRecipients(recipients, size) {
  const chunks = [];

  for (let index = 0; index < recipients.length; index += size) {
    chunks.push(recipients.slice(index, index + size));
  }

  return chunks;
}

function buildRecipientList(users, recipientMode, selectedUserIds) {
  const selectedIds = new Set((selectedUserIds || []).map(String));

  return normalizeRecipients(users
    .filter((user) => user.active !== false)
    .filter((user) => recipientMode === 'all' || selectedIds.has(String(user.id)))
    .map((user) => user.email));
}

function createEmailService(env = process.env, dependencies = {}) {
  const config = getEmailConfig(env);
  const finalDependencies = {
    createTransport: nodemailer.createTransport,
    fetch: globalThis.fetch,
    logger: console,
    ...dependencies
  };

  async function send({ recipients, subject, message }) {
    const normalizedRecipients = normalizeRecipients(recipients);

    if (normalizedRecipients.length === 0) {
      throw new Error('Nenhum destinatário válido informado');
    }

    if (!String(subject || '').trim()) {
      throw new Error('Assunto obrigatório');
    }

    if (!String(message || '').trim()) {
      throw new Error('Mensagem obrigatória');
    }

    const provider = resolveEmailProvider(config);

    if (provider === 'resend') {
      return sendWithResend({
        recipients: normalizedRecipients,
        subject: String(subject).trim(),
        message: String(message)
      });
    }

    if (provider !== 'smtp') {
      throw new EmailConfigurationError('Provedor de e-mail inválido');
    }

    return sendWithSmtp({
      recipients: normalizedRecipients,
      subject: String(subject).trim(),
      message: String(message)
    });
  }

  async function sendWithSmtp({ recipients, subject, message }) {
    const transport = createTransport(config, finalDependencies);

    return transport.sendMail({
      from: config.from,
      to: recipients,
      subject,
      text: message
    });
  }

  async function sendWithResend({ recipients, subject, message }) {
    assertResendConfigured(config);

    if (typeof finalDependencies.fetch !== 'function') {
      throw new EmailConfigurationError('Cliente HTTP indisponível para envio de e-mail');
    }

    const results = [];

    for (const batch of chunkRecipients(recipients, 50)) {
      const response = await finalDependencies.fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: config.from,
          to: batch,
          subject,
          text: message
        })
      });

      if (!response || !response.ok) {
        throw new Error('Falha ao enviar e-mail pelo Resend');
      }

      results.push(await response.json());
    }

    return {
      provider: 'resend',
      results
    };
  }

  return {
    async sendManualMessage({ recipients, subject, message }) {
      return send({ recipients, subject, message });
    },

    async sendNotification({ to, subject, message }) {
      try {
        return await send({ recipients: [to], subject, message });
      } catch (error) {
        if (error instanceof EmailConfigurationError) {
          finalDependencies.logger.warn('Notificação por e-mail ignorada por configuração incompleta');
          return { skipped: true };
        }

        finalDependencies.logger.warn('Falha ao enviar notificação por e-mail');
        return { skipped: true };
      }
    }
  };
}

const emailService = createEmailService();

module.exports = {
  EmailConfigurationError,
  buildRecipientList,
  createEmailService,
  emailService
};
