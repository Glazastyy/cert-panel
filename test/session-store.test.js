const { describe, expect, test } = require('bun:test');
const { Sequelize } = require('sequelize');

const defineSession = require('../src/models/Session');
const { createDatabaseSessionStore } = require('../src/services/session-store');

function createSequelize() {
  return new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
}

function callStore(method, store, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

describe('database session store', () => {
  test('persists sessions so another store instance can read them after restart', async () => {
    const sequelize = createSequelize();
    const Session = defineSession(sequelize);

    try {
      await sequelize.sync({ force: true });

      const firstStore = createDatabaseSessionStore({ sessionModel: Session });
      const secondStore = createDatabaseSessionStore({ sessionModel: Session });
      const expires = new Date('2026-08-23T12:00:00.000Z');

      await callStore('set', firstStore, 'sid-1', {
        cookie: {
          expires
        },
        user: {
          id: 1,
          username: 'admin'
        },
        pendingRegistration: {
          email: 'ana@example.com'
        }
      });

      const persistedSession = await callStore('get', secondStore, 'sid-1');

      expect(persistedSession.user.username).toBe('admin');
      expect(persistedSession.pendingRegistration.email).toBe('ana@example.com');
      expect(new Date(persistedSession.cookie.expires).toISOString()).toBe(expires.toISOString());
    } finally {
      await sequelize.close();
    }
  });

  test('removes expired sessions on read', async () => {
    const sequelize = createSequelize();
    const Session = defineSession(sequelize);

    try {
      await sequelize.sync({ force: true });

      const store = createDatabaseSessionStore({
        sessionModel: Session,
        now: () => new Date('2026-08-22T12:00:00.000Z')
      });

      await Session.create({
        sid: 'expired',
        expires: new Date('2026-08-22T11:59:00.000Z'),
        data: JSON.stringify({ cookie: {} })
      });

      const result = await callStore('get', store, 'expired');

      expect(result).toBeNull();
      expect(await Session.count()).toBe(0);
    } finally {
      await sequelize.close();
    }
  });

  test('touch updates the expiration without replacing session data', async () => {
    const sequelize = createSequelize();
    const Session = defineSession(sequelize);

    try {
      await sequelize.sync({ force: true });

      const store = createDatabaseSessionStore({ sessionModel: Session });
      const initialExpires = new Date('2026-08-23T12:00:00.000Z');
      const touchedExpires = new Date('2026-08-24T12:00:00.000Z');

      await callStore('set', store, 'sid-1', {
        cookie: {
          expires: initialExpires
        },
        user: {
          id: 1
        }
      });

      await callStore('touch', store, 'sid-1', {
        cookie: {
          expires: touchedExpires
        }
      });

      const row = await Session.findByPk('sid-1');
      const data = JSON.parse(row.data);

      expect(row.expires.toISOString()).toBe(touchedExpires.toISOString());
      expect(data.user.id).toBe(1);
    } finally {
      await sequelize.close();
    }
  });
});
