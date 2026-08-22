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
    expect(isUsernameCompliant('JOAOSILVA42')).toBe(true);
    expect(isUsernameCompliant('joao.silva')).toBe(false);
  });

  test('generates usernames from full names and appends two random digits on collision', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);

    try {
      await sequelize.sync({ force: true });
      await User.create({
        username: 'JOAOSILVA',
        password: 'secret',
        fullName: 'JOAO SILVA',
        email: 'joao@example.com'
      });

      const username = await generateUniqueUsername({
        userModel: User,
        fullName: 'João Silva',
        randomDigits: () => '42'
      });

      expect(username).toBe('JOAOSILVA42');
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
        username: 'JOAOSILVA',
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

      expect(username).toBe('JOAOSILVA');
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
        user
      });

      expect(identity.username).toBe('JOAOSILVA');
      expect(identity.fullName).toBe('JOAO SILVA');
    } finally {
      await sequelize.close();
    }
  });
});
