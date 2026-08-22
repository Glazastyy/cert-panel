const { Op } = require('sequelize');
const { renderEmailTemplate } = require('./email');

const DEFAULT_RETRY_DELAY_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 3;

function normalizeMessageFormat(messageFormat) {
  const normalized = String(messageFormat || 'text').trim().toLowerCase();

  if (!['text', 'html'].includes(normalized)) {
    throw new Error('Formato de e-mail inválido');
  }

  return normalized;
}

function serializeError(error) {
  return String(error && error.message ? error.message : error || 'Falha ao enviar e-mail').slice(0, 1000);
}

function createEmailQueueService({ deliveryModel, emailService, now = () => new Date() }) {
  if (!deliveryModel || !emailService) {
    throw new Error('Fila de e-mail configurada de forma incompleta');
  }

  async function enqueueManualMessage({ recipientUsers, subject, message, messageFormat, baseUrl }) {
    const users = recipientUsers || [];

    if (users.length === 0) {
      throw new Error('Nenhum destinatário válido informado');
    }

    const normalizedFormat = normalizeMessageFormat(messageFormat);
    const createdAt = now();
    const deliveries = users.map((user) => {
      const context = {
        user,
        baseUrl,
        now: createdAt
      };

      return {
        toEmail: user.email,
        subject: renderEmailTemplate(subject, context).trim(),
        message: renderEmailTemplate(message, context),
        messageFormat: normalizedFormat,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: createdAt
      };
    });

    if (deliveries.some((delivery) => !delivery.subject || !delivery.message.trim())) {
      throw new Error('Assunto e mensagem são obrigatórios');
    }

    await deliveryModel.bulkCreate(deliveries);

    return {
      count: deliveries.length
    };
  }

  return {
    enqueueManualMessage
  };
}

async function processNextEmailDelivery({
  deliveryModel,
  emailService,
  now = () => new Date(),
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS
}) {
  const currentTime = now();
  const delivery = await deliveryModel.findOne({
    where: {
      status: 'pending',
      nextAttemptAt: {
        [Op.lte]: currentTime
      }
    },
    order: [['id', 'ASC']]
  });

  if (!delivery) {
    return { sent: false };
  }

  await delivery.update({ status: 'processing' });

  try {
    await emailService.sendManualMessage({
      recipients: [delivery.toEmail],
      subject: delivery.subject,
      message: delivery.message,
      messageFormat: delivery.messageFormat
    });

    await delivery.update({
      status: 'sent',
      sentAt: currentTime,
      lastError: null
    });

    return {
      sent: true,
      id: delivery.id
    };
  } catch (error) {
    const attempts = delivery.attempts + 1;

    await delivery.update({
      status: attempts >= maxAttempts ? 'failed' : 'pending',
      attempts,
      lastError: serializeError(error),
      nextAttemptAt: new Date(currentTime.getTime() + retryDelayMs)
    });

    return {
      sent: false,
      failed: true,
      id: delivery.id
    };
  }
}

function startEmailQueueWorker({
  deliveryModel,
  emailService,
  intervalMs = 3000,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  logger = console
}) {
  let running = false;

  const timer = setInterval(async () => {
    if (running) {
      return;
    }

    running = true;

    try {
      await processNextEmailDelivery({
        deliveryModel,
        emailService,
        retryDelayMs,
        maxAttempts
      });
    } catch (error) {
      logger.warn('Falha ao processar fila de e-mails');
    } finally {
      running = false;
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return timer;
}

module.exports = {
  createEmailQueueService,
  processNextEmailDelivery,
  startEmailQueueWorker
};
