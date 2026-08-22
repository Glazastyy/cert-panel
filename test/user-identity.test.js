const { describe, expect, test } = require('bun:test');
const { Sequelize } = require('sequelize');

const defineUser = require('../src/models/User');
const {
  UserIdentityError,
  generateUniqueUsername,
  isUsernameCompliant,
  normalizeFullName,
  normalizeUserIdentity,
  normalizeUsername
} = require('../src/services/user-identity');

function createSequelize() {
  return new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
}

describe('user identity service', () => {
  test('normalizes full names to uppercase without accepting single names', () => {
    expect(normalizeFullName('  josé   da silva  ')).toBe('JOSE DA SILVA');
    expect(() => normalizeFullName('José')).toThrow(UserIdentityError);
  });

  test('normalizes usernames to uppercase letters and numbers only', () => {
    expect(normalizeUsername(' joão.silva-42 ')).toBe('JOAOSILVA42');
    expect(isUsernameCompliant('JOSIL4')).toBe(true);
    expect(isUsernameCompliant('JOAOSILVA42')).toBe(false);
    expect(isUsernameCompliant('joao.silva')).toBe(false);
  });

  test('generates short usernames from full names with a numeric suffix', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);

    try {
      await sequelize.sync({ force: true });

      const username = await generateUniqueUsername({
        userModel: User,
        fullName: 'João Silva',
        randomDigits: () => '42'
      });

      expect(username).toBe('JOSIL4');
      expect(username).toHaveLength(6);
    } finally {
      await sequelize.close();
    }
  });

  test('uses another short numeric suffix when the generated username already exists', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);

    try {
      await sequelize.sync({ force: true });
      await User.create({
        username: 'JOSIL4',
        password: 'secret',
        fullName: 'JOAO SILVA',
        email: 'joao@example.com'
      });

      const suffixes = ['42', '73'];
      const username = await generateUniqueUsername({
        userModel: User,
        fullName: 'João Silva',
        randomDigits: () => suffixes.shift()
      });

      expect(username).toBe('JOSIL7');
      expect(username).toHaveLength(6);
    } finally {
      await sequelize.close();
    }
  });

  test('ignores the current user when checking username uniqueness', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);

    try {
      await sequelize.sync({ force: true });
      const user = await User.create({
        username: 'JOSIL4',
        password: 'secret',
        fullName: 'JOAO SILVA',
        email: 'joao@example.com'
      });

      const username = await generateUniqueUsername({
        userModel: User,
        fullName: 'João Silva',
        excludeUserId: user.id,
        randomDigits: () => '42'
      });

      expect(username).toBe('JOSIL4');
    } finally {
      await sequelize.close();
    }
  });

  test('repairs non-compliant existing usernames from the stored full name', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);

    try {
      await sequelize.sync({ force: true });
      const user = await User.create({
        username: 'joão.silva',
        password: 'secret',
        fullName: 'joão silva',
        email: 'joao@example.com'
      });

      const identity = await normalizeUserIdentity({
        userModel: User,
        user,
        randomDigits: () => '42'
      });

      expect(identity.username).toBe('JOSIL4');
      expect(identity.fullName).toBe('JOAO SILVA');
    } finally {
      await sequelize.close();
    }
  });
});
