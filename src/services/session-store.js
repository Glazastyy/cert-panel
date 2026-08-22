const session = require('express-session');

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function resolveSessionExpiration(sess, now, ttlMs) {
  if (sess && sess.cookie && sess.cookie.expires) {
    return new Date(sess.cookie.expires);
  }

  return new Date(now().getTime() + ttlMs);
}

function createDatabaseSessionStore({ sessionModel, now = () => new Date(), ttlMs = DEFAULT_SESSION_TTL_MS }) {
  class DatabaseSessionStore extends session.Store {
    async get(sid, callback) {
      try {
        const row = await sessionModel.findByPk(sid);

        if (!row) {
          callback(null, null);
          return;
        }

        if (row.expires.getTime() <= now().getTime()) {
          await row.destroy();
          callback(null, null);
          return;
        }

        callback(null, JSON.parse(row.data));
      } catch (error) {
        callback(error);
      }
    }

    async set(sid, sess, callback) {
      try {
        await sessionModel.upsert({
          sid,
          expires: resolveSessionExpiration(sess, now, ttlMs),
          data: JSON.stringify(sess)
        });

        callback(null);
      } catch (error) {
        callback(error);
      }
    }

    async destroy(sid, callback) {
      try {
        await sessionModel.destroy({
          where: { sid }
        });

        callback(null);
      } catch (error) {
        callback(error);
      }
    }

    async touch(sid, sess, callback) {
      try {
        const expires = resolveSessionExpiration(sess, now, ttlMs);
        const [updated] = await sessionModel.update({
          expires
        }, {
          where: { sid }
        });

        if (updated === 0) {
          await this.set(sid, sess, callback);
          return;
        }

        callback(null);
      } catch (error) {
        callback(error);
      }
    }
  }

  return new DatabaseSessionStore();
}

function getSessionCookieConfig(env = process.env) {
  const maxAge = Number(env.SESSION_MAX_AGE_MS || DEFAULT_SESSION_TTL_MS);

  return {
    secure: env.SESSION_COOKIE_SECURE === 'true',
    sameSite: env.SESSION_COOKIE_SAME_SITE || 'lax',
    httpOnly: true,
    maxAge
  };
}

module.exports = {
  DEFAULT_SESSION_TTL_MS,
  createDatabaseSessionStore,
  getSessionCookieConfig
};
