const { Sequelize } = require('sequelize');
const path = require('path');

// Configuração do Sequelize com SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../data/database.sqlite'),
  logging: false
});

// Função para inicializar o banco de dados
async function initializeDatabase() {
  try {
    // Importação dos modelos
    const User = require('../models/User')(sequelize);
    const Certificate = require('../models/Certificate')(sequelize);
    const CertificateAuthority = require('../models/CertificateAuthority')(sequelize);
    const CertificateRequest = require('../models/CertificateRequest')(sequelize);
    
    // Definição das relações entre os modelos
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
    
    // Sincronização dos modelos com o banco de dados
    // Usamos { force: false } para não recriar as tabelas se já existirem
    await sequelize.sync({ force: false });
    console.log('Modelos sincronizados com o banco de dados');
    
    return { sequelize, models: { User, Certificate, CertificateAuthority, CertificateRequest } };
  } catch (error) {
    console.error('Erro ao inicializar o banco de dados:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  initializeDatabase
};
