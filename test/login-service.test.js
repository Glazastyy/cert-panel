const { describe, expect, test } = require('bun:test');
const { Sequelize } = require('sequelize');

const { registerModels } = require('../src/database/db');
const { findLoginUser } = require('../src/services/login');

async function createModels() {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
  const models = registerModels(sequelize);

  await sequelize.sync({ force: true });

  return { sequelize, ...models };
}

describe('login service', () => {
  test('finds users by normalized username or normalized e-mail', async () => {
    const { sequelize, User } = await createModels();

    try {
      const user = await User.create({
        username: 'ANSIL4',
        password: 'senha-segura',
        fullName: 'ANA SILVA',
        email: 'ana@example.com',
        role: 'user',
        active: true
      });

      const byUsername = await findLoginUser({
        userModel: User,
        login: ' an.sil4 '
      });
      const byEmail = await findLoginUser({
        userModel: User,
        login: ' ANA@EXAMPLE.COM '
      });

      expect(byUsername.id).toBe(user.id);
      expect(byEmail.id).toBe(user.id);
    } finally {
      await sequelize.close();
    }
  });

  test('returns null for empty login values', async () => {
    const { sequelize, User } = await createModels();

    try {
      const result = await findLoginUser({
        userModel: User,
        login: '   '
      });

      expect(result).toBeNull();
    } finally {
      await sequelize.close();
    }
  });
});
