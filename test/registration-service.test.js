const { describe, expect, test } = require('bun:test');
const { Sequelize } = require('sequelize');

const defineUser = require('../src/models/User');
const { EmailValidationError } = require('../src/services/email-validation');
const {
  RegistrationInputError,
  createRegistrationService
} = require('../src/services/registration');

function createSequelize() {
  return new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
}

function createValidEmailValidator() {
  return {
    validate: async () => ({
      email: 'ana@example.com',
      valid: true,
      format_valid: true,
      dns_valid: true,
      is_disposable: false,
      errors: []
    })
  };
}

describe('registration service', () => {
  test('blocks registration when the external e-mail validator rejects the address', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);
    const session = {};
    const service = createRegistrationService({
      userModel: User,
      emailValidator: {
        validate: async () => ({
          email: 'invalid@example.invalid',
          valid: false,
          format_valid: true,
          dns_valid: false,
          is_disposable: false,
          errors: ['DNS inválido']
        })
      },
      emailService: {
        sendVerificationCode: async () => {
          throw new Error('unexpected send');
        }
      },
      sessionSecret: 'test-secret',
      codeGenerator: () => 'ABC123',
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    try {
      await sequelize.sync({ force: true });

      await expect(service.beginRegistration({
        session,
        input: {
          password: 'senha123',
          confirmPassword: 'senha123',
          fullName: 'Ana Silva',
          email: 'invalid@example.invalid'
        }
      })).rejects.toThrow(RegistrationInputError);

      expect(session.pendingRegistration).toBeUndefined();
      expect(await User.count()).toBe(0);
    } finally {
      await sequelize.close();
    }
  });

  test('stores a hashed pending registration and sends a six-character confirmation code', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);
    const session = {};
    const sent = [];
    const service = createRegistrationService({
      userModel: User,
      emailValidator: createValidEmailValidator(),
      emailService: {
        sendVerificationCode: async (payload) => {
          sent.push(payload);
        }
      },
      sessionSecret: 'test-secret',
      codeGenerator: () => 'ABC123',
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    try {
      await sequelize.sync({ force: true });

      const result = await service.beginRegistration({
        session,
        input: {
          password: 'senha123',
          confirmPassword: 'senha123',
          fullName: 'ana silva',
          email: 'ana@example.com'
        }
      });

      expect(result.email).toBe('ana@example.com');
      expect(sent).toHaveLength(1);
      expect(sent[0]).toEqual({
        to: 'ana@example.com',
        fullName: 'ANA SILVA',
        code: 'ABC123'
      });
      expect(session.pendingRegistration.fullName).toBe('ANA SILVA');
      expect(session.pendingRegistration.passwordHash).not.toBe('senha123');
      expect(session.pendingRegistration.codeHash).toBeString();
      expect(session.pendingRegistration.expiresAt).toBe('2026-08-22T12:15:00.000Z');
      expect(await User.count()).toBe(0);
    } finally {
      await sequelize.close();
    }
  });

  test('shows validation API errors as registration input errors', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);
    const session = {};
    const service = createRegistrationService({
      userModel: User,
      emailValidator: {
        validate: async () => {
          throw new EmailValidationError('Informe um e-mail válido e não descartável');
        }
      },
      emailService: {
        sendVerificationCode: async () => {
          throw new Error('unexpected send');
        }
      },
      sessionSecret: 'test-secret',
      codeGenerator: () => 'ABC123',
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    try {
      await sequelize.sync({ force: true });

      await expect(service.beginRegistration({
        session,
        input: {
          password: 'senha123',
          confirmPassword: 'senha123',
          fullName: 'Ana Silva',
          email: 'ana@example.invalid'
        }
      })).rejects.toThrow(RegistrationInputError);

      expect(session.pendingRegistration).toBeUndefined();
      expect(await User.count()).toBe(0);
    } finally {
      await sequelize.close();
    }
  });

  test('requires first and last name during registration', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);
    const session = {};
    const service = createRegistrationService({
      userModel: User,
      emailValidator: createValidEmailValidator(),
      emailService: {
        sendVerificationCode: async () => {
          throw new Error('unexpected send');
        }
      },
      sessionSecret: 'test-secret',
      codeGenerator: () => 'ABC123',
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    try {
      await sequelize.sync({ force: true });

      await expect(service.beginRegistration({
        session,
        input: {
          password: 'senha123',
          confirmPassword: 'senha123',
          fullName: 'Ana',
          email: 'ana@example.com'
        }
      })).rejects.toThrow(RegistrationInputError);

      expect(session.pendingRegistration).toBeUndefined();
      expect(await User.count()).toBe(0);
    } finally {
      await sequelize.close();
    }
  });

  test('creates the user only after a valid confirmation code', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);
    const session = {};
    const service = createRegistrationService({
      userModel: User,
      emailValidator: createValidEmailValidator(),
      emailService: {
        sendVerificationCode: async () => {}
      },
      sessionSecret: 'test-secret',
      codeGenerator: () => 'ABC123',
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    try {
      await sequelize.sync({ force: true });

      await service.beginRegistration({
        session,
        input: {
          password: 'senha123',
          confirmPassword: 'senha123',
          fullName: 'ana silva',
          email: 'ana@example.com'
        }
      });

      const result = await service.confirmRegistration({
        session,
        code: 'ABC123'
      });

      const user = await User.findOne({ where: { username: 'ANASILVA' } });

      expect(result.username).toBe('ANASILVA');
      expect(user.fullName).toBe('ANA SILVA');
      expect(user.email).toBe('ana@example.com');
      expect(user.role).toBe('user');
      expect(await user.checkPassword('senha123')).toBe(true);
      expect(session.pendingRegistration).toBeUndefined();
    } finally {
      await sequelize.close();
    }
  });

  test('rejects invalid confirmation codes without creating the user', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);
    const session = {};
    const service = createRegistrationService({
      userModel: User,
      emailValidator: createValidEmailValidator(),
      emailService: {
        sendVerificationCode: async () => {}
      },
      sessionSecret: 'test-secret',
      codeGenerator: () => 'ABC123',
      now: () => new Date('2026-08-22T12:00:00.000Z')
    });

    try {
      await sequelize.sync({ force: true });

      await service.beginRegistration({
        session,
        input: {
          password: 'senha123',
          confirmPassword: 'senha123',
          fullName: 'Ana Silva',
          email: 'ana@example.com'
        }
      });

      await expect(service.confirmRegistration({
        session,
        code: 'ZZZ999'
      })).rejects.toThrow(RegistrationInputError);

      expect(await User.count()).toBe(0);
      expect(session.pendingRegistration).toBeDefined();
    } finally {
      await sequelize.close();
    }
  });

  test('expires pending registrations before creating users', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);
    const session = {};
    let currentTime = new Date('2026-08-22T12:00:00.000Z');
    const service = createRegistrationService({
      userModel: User,
      emailValidator: createValidEmailValidator(),
      emailService: {
        sendVerificationCode: async () => {}
      },
      sessionSecret: 'test-secret',
      codeGenerator: () => 'ABC123',
      now: () => currentTime
    });

    try {
      await sequelize.sync({ force: true });

      await service.beginRegistration({
        session,
        input: {
          password: 'senha123',
          confirmPassword: 'senha123',
          fullName: 'Ana Silva',
          email: 'ana@example.com'
        }
      });

      currentTime = new Date('2026-08-22T12:16:00.000Z');

      await expect(service.confirmRegistration({
        session,
        code: 'ABC123'
      })).rejects.toThrow(RegistrationInputError);

      expect(await User.count()).toBe(0);
      expect(session.pendingRegistration).toBeUndefined();
    } finally {
      await sequelize.close();
    }
  });
});
