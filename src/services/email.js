const nodemailer = require('nodemailer');

class EmailConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmailConfigurationError';
  }
}

function getEmailConfig(env = process.env) {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT || 587);
  const user = env.SMTP_USER;
  const password = env.SMTP_PASSWORD;
  const from = env.EMAIL_FROM;

  return {
    host,
    port,
    secure: env.SMTP_SECURE === 'true' || port === 465,
    auth: user && password ? { user, pass: password } : null,
    from
  };
}

function assertEmailConfigured(config) {
  if (!config.host || !config.port || !config.from) {
    throw new EmailConfigurationError('Configuração SMTP incompleta');
  }
}

function createTransport(config, dependencies) {
  assertEmailConfigured(config);

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

    const transport = createTransport(config, finalDependencies);

    return transport.sendMail({
      from: config.from,
      to: normalizedRecipients,
      subject: String(subject).trim(),
      text: String(message)
    });
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
          finalDependencies.logger.warn('Notificação por e-mail ignorada por configuração SMTP incompleta');
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
