const { describe, expect, test } = require('bun:test');
const { Sequelize } = require('sequelize');

const defineUser = require('../src/models/User');
const definePasswordResetToken = require('../src/models/PasswordResetToken');
const {
  PasswordResetError,
  createPasswordResetService
} = require('../src/services/password-reset');

function createSequelize() {
  return new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
}

async function createModels() {
  const sequelize = createSequelize();
  const User = defineUser(sequelize);
  const PasswordResetToken = definePasswordResetToken(sequelize);

  User.hasMany(PasswordResetToken, { foreignKey: 'userId' });
  PasswordResetToken.belongsTo(User, { foreignKey: 'userId' });

  await sequelize.sync({ force: true });

  return { sequelize, User, PasswordResetToken };
}

describe('password reset service', () => {
  test('creates a hashed single-use token and sends a reset link for existing users', async () => {
    const { sequelize, User, PasswordResetToken } = await createModels();
    const sent = [];
    const service = createPasswordResetService({
      userModel: User,
      resetTokenModel: PasswordResetToken,
      emailService: {
        sendPasswordResetLink: async (payload) => {
          sent.push(payload);
        }
      },
      tokenGenerator: () => 'raw-token',
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    try {
      await User.create({
        username: 'ANSIL4',
        password: 'old-password',
        fullName: 'ANA SILVA',
        email: 'ana@example.com'
      });

      const result = await service.requestPasswordReset({
        email: 'ANA@example.com',
        baseUrl: 'https://test-pcert.zerocert.com.br'
      });
      const tokenRows = await PasswordResetToken.findAll();

      expect(result.sent).toBe(true);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('ana@example.com');
      expect(sent[0].resetUrl).toBe('https://test-pcert.zerocert.com.br/password/reset?token=raw-token');
      expect(tokenRows).toHaveLength(1);
      expect(tokenRows[0].tokenHash).not.toBe('raw-token');
      expect(tokenRows[0].expiresAt.toISOString()).toBe('2026-08-22T13:00:00.000Z');
    } finally {
      await sequelize.close();
    }
  });

  test('does not reveal whether an e-mail exists', async () => {
    const { sequelize, User, PasswordResetToken } = await createModels();
    const sent = [];
    const service = createPasswordResetService({
      userModel: User,
      resetTokenModel: PasswordResetToken,
      emailService: {
        sendPasswordResetLink: async (payload) => {
          sent.push(payload);
        }
      },
      tokenGenerator: () => 'raw-token',
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    try {
      const result = await service.requestPasswordReset({
        email: 'missing@example.com',
        baseUrl: 'https://test-pcert.zerocert.com.br'
      });

      expect(result.sent).toBe(false);
      expect(sent).toHaveLength(0);
      expect(await PasswordResetToken.count()).toBe(0);
    } finally {
      await sequelize.close();
    }
  });

  test('does not send password reset links or create tokens for admins', async () => {
    const { sequelize, User, PasswordResetToken } = await createModels();
    const sent = [];
    const service = createPasswordResetService({
      userModel: User,
      resetTokenModel: PasswordResetToken,
      emailService: {
        sendPasswordResetLink: async (payload) => {
          sent.push(payload);
        }
      },
      tokenGenerator: () => 'raw-token',
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    try {
      await User.create({
        username: 'ADSIS0',
        password: 'admin-password',
        fullName: 'ADMINISTRADOR DO SISTEMA',
        email: 'admin@example.com',
        role: 'admin'
      });

      const result = await service.requestPasswordReset({
        email: 'admin@example.com',
        baseUrl: 'https://test-pcert.zerocert.com.br'
      });

      expect(result.sent).toBe(false);
      expect(sent).toHaveLength(0);
      expect(await PasswordResetToken.count()).toBe(0);
    } finally {
      await sequelize.close();
    }
  });

  test('resets password once with a valid non-expired token', async () => {
    const { sequelize, User, PasswordResetToken } = await createModels();
    const service = createPasswordResetService({
      userModel: User,
      resetTokenModel: PasswordResetToken,
      emailService: {
        sendPasswordResetLink: async () => {}
      },
      tokenGenerator: () => 'raw-token',
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    try {
      const user = await User.create({
        username: 'ANSIL4',
        password: 'old-password',
        fullName: 'ANA SILVA',
        email: 'ana@example.com'
      });

      await service.requestPasswordReset({
        email: 'ana@example.com',
        baseUrl: 'https://test-pcert.zerocert.com.br'
      });

      await service.resetPassword({
        token: 'raw-token',
        password: 'new-password',
        confirmPassword: 'new-password'
      });

      await user.reload();
      const tokenRow = await PasswordResetToken.findOne();

      expect(await user.checkPassword('new-password')).toBe(true);
      expect(tokenRow.usedAt).toBeInstanceOf(Date);
      await expect(service.resetPassword({
        token: 'raw-token',
        password: 'another-password',
        confirmPassword: 'another-password'
      })).rejects.toThrow(PasswordResetError);
    } finally {
      await sequelize.close();
    }
  });

  test('rejects expired tokens and mismatched passwords', async () => {
    const { sequelize, User, PasswordResetToken } = await createModels();
    let currentTime = new Date('2026-08-22T12:00:00.000Z');
    const service = createPasswordResetService({
      userModel: User,
      resetTokenModel: PasswordResetToken,
      emailService: {
        sendPasswordResetLink: async () => {}
      },
      tokenGenerator: () => 'raw-token',
      now: () => currentTime
    });

    try {
      await User.create({
        username: 'ANSIL4',
        password: 'old-password',
        fullName: 'ANA SILVA',
        email: 'ana@example.com'
      });

      await service.requestPasswordReset({
        email: 'ana@example.com',
        baseUrl: 'https://test-pcert.zerocert.com.br'
      });

      await expect(service.resetPassword({
        token: 'raw-token',
        password: 'new-password',
        confirmPassword: 'different-password'
      })).rejects.toThrow(PasswordResetError);

      currentTime = new Date('2026-08-22T13:01:00.000Z');

      await expect(service.resetPassword({
        token: 'raw-token',
        password: 'new-password',
        confirmPassword: 'new-password'
      })).rejects.toThrow(PasswordResetError);
    } finally {
      await sequelize.close();
    }
  });
});
