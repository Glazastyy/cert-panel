const { describe, expect, test } = require('bun:test');
const { Sequelize } = require('sequelize');

const defineUser = require('../src/models/User');
const defineCertificate = require('../src/models/Certificate');
const defineCertificateAuthority = require('../src/models/CertificateAuthority');
const defineCertificateRequest = require('../src/models/CertificateRequest');

function createSequelize() {
  return new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
}

describe('CertificateRequest model', () => {
  test('stores pending requests for later admin review', async () => {
    const sequelize = createSequelize();
    const User = defineUser(sequelize);
    const Certificate = defineCertificate(sequelize);
    const CertificateAuthority = defineCertificateAuthority(sequelize);
    const CertificateRequest = defineCertificateRequest(sequelize);

    User.hasMany(CertificateRequest, { foreignKey: 'userId' });
    CertificateRequest.belongsTo(User, { foreignKey: 'userId' });
    CertificateRequest.belongsTo(Certificate, { foreignKey: 'certificateId' });
    CertificateRequest.belongsTo(User, { as: 'Reviewer', foreignKey: 'reviewedBy' });
    CertificateAuthority.hasMany(Certificate, { foreignKey: 'caId' });
    Certificate.belongsTo(CertificateAuthority, { foreignKey: 'caId' });
    User.hasMany(Certificate, { foreignKey: 'userId' });
    Certificate.belongsTo(User, { foreignKey: 'userId' });

    try {
      await sequelize.sync({ force: true });

      const user = await User.create({
        username: 'usuario',
        password: 'senha-segura',
        fullName: 'Usuário Teste',
        email: 'usuario@example.com',
        role: 'user'
      });

      const request = await CertificateRequest.create({
        type: 'e-CPF',
        status: 'pending',
        payload: {
          name: 'Usuário Teste',
          cpf: '12345678901',
          birthDate: '1990-01-01',
          socialSecurity: '12345678901',
          email: 'usuario@example.com',
          state: 'SP',
          city: 'São Paulo',
          p12Password: 'senha-do-certificado'
        },
        userId: user.id
      });

      expect(request.status).toBe('pending');
      expect(request.type).toBe('e-CPF');
      expect(request.payload.cpf).toBe('12345678901');
      expect(request.userId).toBe(user.id);
    } finally {
      await sequelize.close();
    }
  });
});
