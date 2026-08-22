const { describe, expect, test } = require('bun:test');
const { Sequelize } = require('sequelize');

const defineEmailDelivery = require('../src/models/EmailDelivery');
const {
  createEmailQueueService,
  processNextEmailDelivery
} = require('../src/services/email-queue');

function createSequelize() {
  return new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
}

describe('email queue service', () => {
  test('enqueues one rendered delivery per recipient user', async () => {
    const sequelize = createSequelize();
    const EmailDelivery = defineEmailDelivery(sequelize);
    const queue = createEmailQueueService({
      deliveryModel: EmailDelivery,
      emailService: {
        sendManualMessage: async () => {}
      },
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    try {
      await sequelize.sync({ force: true });

      const result = await queue.enqueueManualMessage({
        recipientUsers: [
          { id: 1, username: 'ANSIL4', fullName: 'ANA SILVA', email: 'ana@example.com' },
          { id: 2, username: 'BRDIA7', fullName: 'BRUNO DIAS', email: 'bruno@example.com' }
        ],
        subject: 'Olá {{user.firstName}}',
        message: '<p>{{user.email}} {{urls.dashboard}}</p>',
        messageFormat: 'html',
        baseUrl: 'https://test-pcert.zerocert.com.br'
      });

      const deliveries = await EmailDelivery.findAll({ order: [['id', 'ASC']] });

      expect(result.count).toBe(2);
      expect(deliveries).toHaveLength(2);
      expect(deliveries[0].toEmail).toBe('ana@example.com');
      expect(deliveries[0].subject).toBe('Olá ANA');
      expect(deliveries[0].message).toContain('https://test-pcert.zerocert.com.br/dashboard');
      expect(deliveries[0].messageFormat).toBe('html');
      expect(deliveries[0].status).toBe('pending');
    } finally {
      await sequelize.close();
    }
  });

  test('processes only one pending delivery at a time', async () => {
    const sequelize = createSequelize();
    const EmailDelivery = defineEmailDelivery(sequelize);
    const sent = [];

    try {
      await sequelize.sync({ force: true });
      await EmailDelivery.bulkCreate([
        {
          toEmail: 'ana@example.com',
          subject: 'Mensagem 1',
          message: 'Conteúdo 1',
          messageFormat: 'text',
          status: 'pending',
          nextAttemptAt: new Date('2026-08-22T12:00:00.000Z')
        },
        {
          toEmail: 'bruno@example.com',
          subject: 'Mensagem 2',
          message: 'Conteúdo 2',
          messageFormat: 'text',
          status: 'pending',
          nextAttemptAt: new Date('2026-08-22T12:00:00.000Z')
        }
      ]);

      const result = await processNextEmailDelivery({
        deliveryModel: EmailDelivery,
        emailService: {
          sendManualMessage: async (payload) => {
            sent.push(payload);
          }
        },
        now: () => new Date('2026-08-22T12:00:01.000Z')
      });

      const deliveries = await EmailDelivery.findAll({ order: [['id', 'ASC']] });

      expect(result.sent).toBe(true);
      expect(sent).toHaveLength(1);
      expect(sent[0].recipients).toEqual(['ana@example.com']);
      expect(deliveries[0].status).toBe('sent');
      expect(deliveries[1].status).toBe('pending');
    } finally {
      await sequelize.close();
    }
  });

  test('keeps failed deliveries pending for retry before marking final failure', async () => {
    const sequelize = createSequelize();
    const EmailDelivery = defineEmailDelivery(sequelize);

    try {
      await sequelize.sync({ force: true });
      await EmailDelivery.create({
        toEmail: 'ana@example.com',
        subject: 'Mensagem',
        message: 'Conteúdo',
        messageFormat: 'text',
        status: 'pending',
        nextAttemptAt: new Date('2026-08-22T12:00:00.000Z')
      });

      await processNextEmailDelivery({
        deliveryModel: EmailDelivery,
        emailService: {
          sendManualMessage: async () => {
            throw new Error('SMTP indisponível');
          }
        },
        now: () => new Date('2026-08-22T12:00:01.000Z'),
        retryDelayMs: 60000,
        maxAttempts: 2
      });

      let delivery = await EmailDelivery.findByPk(1);
      expect(delivery.status).toBe('pending');
      expect(delivery.attempts).toBe(1);
      expect(delivery.nextAttemptAt.toISOString()).toBe('2026-08-22T12:01:01.000Z');

      await delivery.update({ nextAttemptAt: new Date('2026-08-22T12:00:00.000Z') });
      await processNextEmailDelivery({
        deliveryModel: EmailDelivery,
        emailService: {
          sendManualMessage: async () => {
            throw new Error('SMTP indisponível');
          }
        },
        now: () => new Date('2026-08-22T12:00:02.000Z'),
        retryDelayMs: 60000,
        maxAttempts: 2
      });

      delivery = await EmailDelivery.findByPk(1);
      expect(delivery.status).toBe('failed');
      expect(delivery.attempts).toBe(2);
    } finally {
      await sequelize.close();
    }
  });
});
