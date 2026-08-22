const { describe, expect, test } = require('bun:test');

const { createSequelize } = require('../src/database/db');

describe('database configuration', () => {
  test('uses SQLite by default with the existing database path', async () => {
    const sequelize = createSequelize({});

    try {
      expect(sequelize.getDialect()).toBe('sqlite');
      expect(sequelize.options.storage).toContain('src/data/database.sqlite');
    } finally {
      await sequelize.close();
    }
  });

  test('uses PostgreSQL when DATABASE_URL is provided', async () => {
    const sequelize = createSequelize({
      DATABASE_URL: 'postgres://zerocert:secret@localhost:5432/zerocert'
    });

    try {
      expect(sequelize.getDialect()).toBe('postgres');
      expect(sequelize.config.host).toBe('localhost');
      expect(sequelize.config.database).toBe('zerocert');
    } finally {
      await sequelize.close();
    }
  });

  test('uses PostgreSQL from discrete environment variables', async () => {
    const sequelize = createSequelize({
      DB_DIALECT: 'postgres',
      DB_HOST: 'db',
      DB_PORT: '5432',
      DB_NAME: 'zerocert',
      DB_USER: 'zerocert',
      DB_PASSWORD: 'secret'
    });

    try {
      expect(sequelize.getDialect()).toBe('postgres');
      expect(sequelize.config.host).toBe('db');
      expect(sequelize.config.port).toBe(5432);
      expect(sequelize.config.database).toBe('zerocert');
      expect(sequelize.config.username).toBe('zerocert');
    } finally {
      await sequelize.close();
    }
  });
});
