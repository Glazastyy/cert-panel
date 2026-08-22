const { Sequelize } = require('sequelize');
const path = require('path');

function createSequelize(env = process.env) {
  const dialect = env.DB_DIALECT || (env.DATABASE_URL ? 'postgres' : 'sqlite');
  const logging = env.DB_LOGGING === 'true' ? console.log : false;

  if (dialect === 'postgres') {
    if (env.DATABASE_URL) {
      return new Sequelize(env.DATABASE_URL, {
        dialect: 'postgres',
        logging
      });
    }

    return new Sequelize(env.DB_NAME || 'zerocert', env.DB_USER || 'zerocert', env.DB_PASSWORD || 'zerocert', {
      dialect: 'postgres',
      host: env.DB_HOST || 'localhost',
      port: Number(env.DB_PORT || 5432),
      logging
    });
  }

  return new Sequelize({
    dialect: 'sqlite',
    storage: env.DB_PATH || path.join(__dirname, '../data/database.sqlite'),
    logging
  });
}

const sequelize = createSequelize();

function registerModels(targetSequelize) {
  const User = require('../models/User')(targetSequelize);
  const Certificate = require('../models/Certificate')(targetSequelize);
  const CertificateAuthority = require('../models/CertificateAuthority')(targetSequelize);
  const CertificateRequest = require('../models/CertificateRequest')(targetSequelize);
  const Session = require('../models/Session')(targetSequelize);

  User.hasMany(Certificate, { foreignKey: 'userId' });
  Certificate.belongsTo(User, { foreignKey: 'userId' });

  CertificateAuthority.hasMany(Certificate, { foreignKey: 'caId' });
  Certificate.belongsTo(CertificateAuthority, { foreignKey: 'caId' });

  User.hasMany(CertificateRequest, { foreignKey: 'userId' });
  CertificateRequest.belongsTo(User, { foreignKey: 'userId' });
  User.hasMany(CertificateRequest, { as: 'ReviewedCertificateRequests', foreignKey: 'reviewedBy' });
  CertificateRequest.belongsTo(User, { as: 'Reviewer', foreignKey: 'reviewedBy' });
  Certificate.hasOne(CertificateRequest, { foreignKey: 'certificateId' });
  CertificateRequest.belongsTo(Certificate, { foreignKey: 'certificateId' });

  return { User, Certificate, CertificateAuthority, CertificateRequest, Session };
}

async function initializeDatabase() {
  try {
    const models = registerModels(sequelize);

    await sequelize.sync({ force: false });
    console.log('Modelos sincronizados com o banco de dados');
    
    return { sequelize, models };
  } catch (error) {
    console.error('Erro ao inicializar o banco de dados:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  createSequelize,
  registerModels,
  initializeDatabase
};
