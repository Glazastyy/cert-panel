const { describe, expect, test } = require('bun:test');
const { Sequelize } = require('sequelize');

const { registerModels } = require('../src/database/db');
const { migrateSqliteToPostgres } = require('../scripts/migrate-sqlite-to-postgres');

function createMemoryDatabase() {
  return new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
}

describe('SQLite to PostgreSQL migration', () => {
  test('copies records in dependency order while preserving ids', async () => {
    const source = createMemoryDatabase();
    const target = createMemoryDatabase();
    const sourceModels = registerModels(source);
    const targetModels = registerModels(target);

    try {
      await source.sync({ force: true });
      await target.sync({ force: true });

      const user = await sourceModels.User.create({
        id: 7,
        username: 'usuario',
        password: 'senha-segura',
        fullName: 'Usuário Teste',
        email: 'usuario@example.com',
        role: 'user'
      });

      const ca = await sourceModels.CertificateAuthority.create({
        id: 11,
        name: 'AC Teste',
        commonName: 'AC Teste',
        organization: 'ZeroCert',
        organizationalUnit: 'Teste',
        country: 'BR',
        state: 'SP',
        locality: 'São Paulo',
        serialNumber: 'ca-serial',
        publicKey: 'public',
        privateKey: 'private',
        certificate: 'certificate',
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validTo: new Date('2027-01-01T00:00:00Z'),
        isRoot: true,
        crlDistributionPoint: 'https://example.com/crl',
        ocspResponderUrl: 'https://example.com/ocsp',
        active: true
      });

      const certificate = await sourceModels.Certificate.create({
        id: 13,
        serialNumber: 'cert-serial',
        type: 'e-CPF',
        subject: {
          name: 'Usuário Teste',
          cpf: '12345678901'
        },
        publicKey: 'public',
        privateKey: 'private',
        certificate: 'certificate',
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validTo: new Date('2027-01-01T00:00:00Z'),
        policyOid: '2.16.76.1.2.1.7',
        dpcUrl: 'https://example.com/dpc',
        keyUsage: {
          digitalSignature: true
        },
        extendedKeyUsage: {
          clientAuth: true
        },
        caId: ca.id,
        userId: user.id
      });

      await sourceModels.CertificateRequest.create({
        id: 17,
        type: 'e-CPF',
        status: 'approved',
        payload: {
          name: 'Usuário Teste',
          cpf: '12345678901'
        },
        reviewedAt: new Date('2026-01-02T00:00:00Z'),
        reviewedBy: user.id,
        certificateId: certificate.id,
        userId: user.id
      });

      const summary = await migrateSqliteToPostgres(source, target, {
        requirePostgresTarget: false
      });

      expect(summary.Users).toBe(1);
      expect(summary.CertificateAuthorities).toBe(1);
      expect(summary.Certificates).toBe(1);
      expect(summary.CertificateRequests).toBe(1);
      expect(await targetModels.User.count()).toBe(1);
      expect(await targetModels.Certificate.count()).toBe(1);
      expect(await targetModels.CertificateRequest.count()).toBe(1);

      const migratedRequest = await targetModels.CertificateRequest.findByPk(17);
      expect(migratedRequest.userId).toBe(7);
      expect(migratedRequest.certificateId).toBe(13);
      expect(migratedRequest.payload.cpf).toBe('12345678901');
    } finally {
      await source.close();
      await target.close();
    }
  });

  test('treats missing legacy source tables as empty tables', async () => {
    const source = createMemoryDatabase();
    const target = createMemoryDatabase();
    const sourceModels = registerModels(source);
    const targetModels = registerModels(target);

    try {
      await sourceModels.User.sync({ force: true });
      await sourceModels.CertificateAuthority.sync({ force: true });
      await sourceModels.Certificate.sync({ force: true });
      await target.sync({ force: true });

      await sourceModels.User.create({
        id: 3,
        username: 'legado',
        password: 'senha-segura',
        fullName: 'Usuário Legado',
        email: 'legado@example.com',
        role: 'user'
      });

      const summary = await migrateSqliteToPostgres(source, target, {
        requirePostgresTarget: false
      });

      expect(summary.Users).toBe(1);
      expect(summary.CertificateAuthorities).toBe(0);
      expect(summary.Certificates).toBe(0);
      expect(summary.CertificateRequests).toBe(0);
      expect(await targetModels.User.count()).toBe(1);
      expect(await targetModels.CertificateRequest.count()).toBe(0);
    } finally {
      await source.close();
      await target.close();
    }
  });

  test('merges into a non-empty target when explicitly allowed', async () => {
    const source = createMemoryDatabase();
    const target = createMemoryDatabase();
    const sourceModels = registerModels(source);
    const targetModels = registerModels(target);

    try {
      await source.sync({ force: true });
      await target.sync({ force: true });

      await sourceModels.User.create({
        id: 5,
        username: 'importado',
        password: 'senha-importada',
        fullName: 'Nome Importado',
        email: 'importado@example.com',
        role: 'user'
      });

      await targetModels.User.create({
        id: 5,
        username: 'antigo',
        password: 'senha-antiga',
        fullName: 'Nome Antigo',
        email: 'antigo@example.com',
        role: 'operator'
      });

      await targetModels.User.create({
        id: 99,
        username: 'mantido',
        password: 'senha-mantida',
        fullName: 'Nome Mantido',
        email: 'mantido@example.com',
        role: 'admin'
      });

      const summary = await migrateSqliteToPostgres(source, target, {
        requireEmptyTarget: false,
        requirePostgresTarget: false
      });

      const mergedUser = await targetModels.User.findByPk(5);
      const retainedUser = await targetModels.User.findByPk(99);

      expect(summary.Users).toBe(1);
      expect(await targetModels.User.count()).toBe(2);
      expect(mergedUser.username).toBe('importado');
      expect(mergedUser.fullName).toBe('Nome Importado');
      expect(retainedUser.username).toBe('mantido');
    } finally {
      await source.close();
      await target.close();
    }
  });
});
