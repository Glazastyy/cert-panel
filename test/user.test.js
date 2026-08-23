const { describe, expect, test } = require('bun:test');
const { Sequelize } = require('sequelize');

const defineUser = require('../src/models/User');

function createSequelize() {
  return new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
}

describe('User model', () => {
  test('hashes passwords when users are created', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);

    try {
      await sequelize.sync({ force: true });

      const user = await User.create({
        username: 'admin',
        password: 'admin123',
        fullName: 'Administrador do Sistema',
        email: 'admin@zerocert.local',
        role: 'admin'
      });

      expect(user.password).not.toBe('admin123');
      expect(await user.checkPassword('admin123')).toBe(true);
      expect(await user.checkPassword('senha-errada')).toBe(false);
    } finally {
      await sequelize.close();
    }
  });

  test('creates the default admin only once', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);

    try {
      await sequelize.sync({ force: true });

      await User.createDefaultAdmin();
      await User.createDefaultAdmin();

      const admins = await User.findAll({ where: { username: 'ADSIS0' } });
      expect(admins).toHaveLength(1);
      expect(admins[0].fullName).toBe('ADMINISTRADOR DO SISTEMA');
      expect(admins[0].email).toBe('admin@zerocert.com.br');
      expect(admins[0].role).toBe('admin');
      expect(await admins[0].checkPassword('admin123')).toBe(true);
    } finally {
      await sequelize.close();
    }
  });

  test('normalizes legacy default admin e-mail to an allowed privileged domain', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);

    try {
      await sequelize.sync({ force: true });

      await User.create({
        username: 'admin',
        password: 'admin123',
        fullName: 'Administrador do Sistema',
        email: 'admin@zerocert.local',
        role: 'admin'
      });

      await User.createDefaultAdmin();

      const admin = await User.findOne({ where: { username: 'ADSIS0' } });
      expect(admin.email).toBe('admin@zerocert.com.br');
      expect(admin.fullName).toBe('ADMINISTRADOR DO SISTEMA');
      expect(admin.role).toBe('admin');
    } finally {
      await sequelize.close();
    }
  });

  test('uses a unique allowed e-mail when the default admin address is already taken', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);

    try {
      await sequelize.sync({ force: true });

      await User.create({
        username: 'USUAR1',
        password: 'admin123',
        fullName: 'USUARIO TESTE',
        email: 'admin@zerocert.com.br',
        role: 'user'
      });

      await User.createDefaultAdmin();

      const admin = await User.findOne({ where: { username: 'ADSIS0' } });
      expect(admin.email).toBe('admin+adsis0@zerocert.com.br');
      expect(admin.role).toBe('admin');
    } finally {
      await sequelize.close();
    }
  });
});
