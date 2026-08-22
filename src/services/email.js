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
  return buildRecipientUsers(users, recipientMode, selectedUserIds).map((user) => user.email);
}

function buildRecipientUsers(users, recipientMode, selectedUserIds) {
  const selectedIds = new Set((selectedUserIds || []).map(String));

  const seenEmails = new Set();

  return (users || [])
    .filter((user) => user.active !== false)
    .filter((user) => recipientMode === 'all' || selectedIds.has(String(user.id)))
    .filter((user) => {
      const email = String(user.email || '').trim().toLowerCase();

      if (!email || seenEmails.has(email)) {
        return false;
      }

      seenEmails.add(email);
      return true;
    });
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

function buildTemplateVariables({ user, baseUrl, now }) {
  const currentDate = now instanceof Date ? now : new Date(now || Date.now());
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    'user.id': String(user.id || ''),
    'user.username': String(user.username || ''),
    'user.fullName': String(user.fullName || ''),
    'user.firstName': firstName(user.fullName),
    'user.email': String(user.email || ''),
    'date.today': formatDate(currentDate),
    'date.now': formatDateTime(currentDate),
    'urls.base': normalizedBaseUrl,
    'urls.login': `${normalizedBaseUrl}/login`,
    'urls.dashboard': `${normalizedBaseUrl}/dashboard`,
    'urls.certificates': `${normalizedBaseUrl}/dashboard/certificates`,
    'urls.certificateRequests': `${normalizedBaseUrl}/dashboard/certificate-requests`
  };
}

function renderEmailTemplate(template, context) {
  const variables = buildTemplateVariables(context);

  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) {
      throw new Error(`Variável de e-mail inválida: ${key}`);
    }

    return variables[key];
  });
}

function createEmailService(env = process.env, dependencies = {}) {
  const config = getEmailConfig(env);
  const finalDependencies = {
    createTransport: nodemailer.createTransport,
    fetch: globalThis.fetch,
    logger: console,
    ...dependencies
  };

  async function send({ recipients, subject, message, messageFormat = 'text' }) {
    const normalizedRecipients = normalizeRecipients(recipients);
    const normalizedFormat = normalizeMessageFormat(messageFormat);

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
        message: String(message),
        messageFormat: normalizedFormat
      });
    }

    if (provider !== 'smtp') {
      throw new EmailConfigurationError('Provedor de e-mail inválido');
    }

    return sendWithSmtp({
      recipients: normalizedRecipients,
      subject: String(subject).trim(),
      message: String(message),
      messageFormat: normalizedFormat
    });
  }

  function normalizeMessageFormat(messageFormat) {
    const normalizedFormat = String(messageFormat || 'text').trim().toLowerCase();

    if (!['text', 'html'].includes(normalizedFormat)) {
      throw new Error('Formato de e-mail inválido');
    }

    return normalizedFormat;
  }

  function buildProviderPayload({ from, recipients, subject, message, messageFormat }) {
    const payload = {
      from,
      to: recipients,
      subject
    };

    if (messageFormat === 'html') {
      payload.html = message;
    } else {
      payload.text = message;
    }

    return payload;
  }

  async function sendWithSmtp({ recipients, subject, message, messageFormat }) {
    const transport = createTransport(config, finalDependencies);

    return transport.sendMail(buildProviderPayload({
      from: config.from,
      recipients,
      subject,
      message,
      messageFormat
    }));
  }

  async function sendWithResend({ recipients, subject, message, messageFormat }) {
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
          [messageFormat]: message
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

  async function sendPersonalizedManualMessage({ recipientUsers, subject, message, messageFormat, baseUrl, now }) {
    const users = recipientUsers || [];

    if (users.length === 0) {
      throw new Error('Nenhum destinatário válido informado');
    }

    const results = [];

    for (const user of users) {
      const context = {
        user,
        baseUrl,
        now
      };

      results.push(await send({
        recipients: [user.email],
        subject: renderEmailTemplate(subject, context),
        message: renderEmailTemplate(message, context),
        messageFormat
      }));
    }

    return {
      personalized: true,
      count: results.length,
      results
    };
  }

  return {
    async sendManualMessage({ recipients, recipientUsers, subject, message, messageFormat, baseUrl, now = new Date() }) {
      if (recipientUsers) {
        return sendPersonalizedManualMessage({
          recipientUsers,
          subject,
          message,
          messageFormat,
          baseUrl,
          now
        });
      }

      return send({ recipients, subject, message, messageFormat });
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
    },

    async sendVerificationCode({ to, fullName, code }) {
      return send({
        recipients: [to],
        subject: 'Confirme seu cadastro no ZeroCert',
        message: `Olá, ${fullName}.\n\nSeu código de confirmação do ZeroCert é: ${code}\n\nEle expira em 15 minutos.`
      });
    }
  };
}

const emailService = createEmailService();

module.exports = {
  EmailConfigurationError,
  buildRecipientList,
  buildRecipientUsers,
  createEmailService,
  emailService,
  renderEmailTemplate
};
