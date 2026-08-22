require('dotenv').config();
const path = require('path');
const { createSequelize, registerModels } = require('../src/database/db');

const modelOrder = ['User', 'CertificateAuthority', 'Certificate', 'CertificateRequest'];
const tableNames = {
  User: 'Users',
  CertificateAuthority: 'CertificateAuthorities',
  Certificate: 'Certificates',
  CertificateRequest: 'CertificateRequests'
};
const jsonFields = {
  Certificate: ['subject', 'keyUsage', 'extendedKeyUsage'],
  CertificateRequest: ['payload']
};

function createSqliteSource(env = process.env) {
  return createSequelize({
    DB_DIALECT: 'sqlite',
    DB_PATH: env.SQLITE_DB_PATH || env.DB_PATH || path.join(__dirname, '..', 'src', 'data', 'database.sqlite')
  });
}

function createPostgresTarget(env = process.env) {
  return createSequelize({
    DATABASE_URL: env.POSTGRES_DATABASE_URL || env.DATABASE_URL,
    DB_DIALECT: 'postgres',
    DB_HOST: env.POSTGRES_HOST || env.DB_HOST,
    DB_PORT: env.POSTGRES_PORT || env.DB_PORT,
    DB_NAME: env.POSTGRES_DB || env.DB_NAME,
    DB_USER: env.POSTGRES_USER || env.DB_USER,
    DB_PASSWORD: env.POSTGRES_PASSWORD || env.DB_PASSWORD,
    DB_LOGGING: env.DB_LOGGING
  });
}

function envFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

async function assertTargetCanReceiveData(targetSequelize, models, options) {
  if (targetSequelize.getDialect() !== 'postgres' && options.requirePostgresTarget) {
    throw new Error('O banco de destino deve ser PostgreSQL');
  }

  if (!options.requireEmptyTarget) {
    return;
  }

  for (const modelName of modelOrder) {
    const count = await models[modelName].count();
    if (count > 0) {
      throw new Error(`O destino já possui registros em ${tableNames[modelName]}`);
    }
  }
}

async function resetPostgresSequence(sequelize, tableName) {
  if (sequelize.getDialect() !== 'postgres') {
    return;
  }

  await sequelize.query(
    `SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 1), (SELECT COUNT(*) FROM "${tableName}") > 0)`
  );
}

async function sourceTableExists(sequelize, tableName) {
  const inspector = sequelize.getQueryInterface();

  return inspector.tableExists(tableName);
}

function parseJsonValue(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return JSON.parse(value);
}

function normalizeRecord(modelName, record) {
  const fields = jsonFields[modelName] || [];
  const normalized = { ...record };

  for (const field of fields) {
    if (normalized[field]) {
      normalized[field] = parseJsonValue(normalized[field]);
    }
  }

  return normalized;
}

async function copyModel(modelName, sourceModel, targetModel, transaction) {
  const tableName = tableNames[modelName];

  if (!await sourceTableExists(sourceModel.sequelize, tableName)) {
    return 0;
  }

  const records = await sourceModel.findAll({
    order: [['id', 'ASC']],
    raw: true
  });

  for (const record of records) {
    await targetModel.upsert(normalizeRecord(modelName, record), { transaction });
  }

  return records.length;
}

async function migrateSqliteToPostgres(sourceSequelize, targetSequelize, options = {}) {
  const finalOptions = {
    requireEmptyTarget: true,
    requirePostgresTarget: true,
    ...options
  };
  const sourceModels = registerModels(sourceSequelize);
  const targetModels = registerModels(targetSequelize);

  await sourceSequelize.authenticate();
  await targetSequelize.authenticate();
  await targetSequelize.sync({ force: false });
  await assertTargetCanReceiveData(targetSequelize, targetModels, finalOptions);

  const summary = {};

  await targetSequelize.transaction(async (transaction) => {
    for (const modelName of modelOrder) {
      summary[tableNames[modelName]] = await copyModel(modelName, sourceModels[modelName], targetModels[modelName], transaction);
    }
  });

  for (const modelName of modelOrder) {
    await resetPostgresSequence(targetSequelize, tableNames[modelName]);
  }

  return summary;
}

async function main() {
  const sourceSequelize = createSqliteSource();
  const targetSequelize = createPostgresTarget();

  try {
    const summary = await migrateSqliteToPostgres(sourceSequelize, targetSequelize, {
      requireEmptyTarget: !envFlag(process.env.MIGRATION_ALLOW_NON_EMPTY)
    });
    console.log('Migração concluída com sucesso');
    for (const [tableName, count] of Object.entries(summary)) {
      console.log(`${tableName}: ${count}`);
    }
  } finally {
    await sourceSequelize.close();
    await targetSequelize.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Falha ao migrar SQLite para PostgreSQL:', error.message);
    process.exit(1);
  });
}

module.exports = {
  migrateSqliteToPostgres,
  createSqliteSource,
  createPostgresTarget
};
