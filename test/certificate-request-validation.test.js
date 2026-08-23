const { describe, expect, test } = require('bun:test');

const {
  CertificateRequestValidationError,
  validateEcpfCertificateRequest,
  validateEcnpjCertificateRequest,
  validateCpf,
  validateCnpj,
  validatePisPasepNis
} = require('../src/services/certificate-request-validation');

function createEmailValidator() {
  return {
    validate: async (email) => ({
      email: String(email || '').trim().toLowerCase(),
      valid: true,
      format_valid: true,
      dns_valid: true,
      is_disposable: false
    })
  };
}

describe('certificate request validation service', () => {
  test('validates Brazilian document numbers', () => {
    expect(validateCpf('529.982.247-25')).toBe(true);
    expect(validateCpf('111.111.111-11')).toBe(false);
    expect(validateCnpj('04.252.011/0001-10')).toBe(true);
    expect(validateCnpj('11.111.111/1111-11')).toBe(false);
    expect(validatePisPasepNis('170.33259.50-4')).toBe(true);
    expect(validatePisPasepNis('000.00000.00-0')).toBe(false);
  });

  test('accepts e-CPF requests with optional empty PIS/PASEP/NIS and validated e-mail', async () => {
    const requests = [];
    const result = await validateEcpfCertificateRequest({
      input: {
        name: 'ANA SILVA',
        cpf: '529.982.247-25',
        birthDate: '2000-08-23',
        socialSecurity: '',
        email: ' ANA@EXAMPLE.COM ',
        state: 'SP',
        city: 'São Paulo'
      },
      emailValidator: {
        validate: async (email) => {
          requests.push(email);
          return {
            email: 'ana@example.com',
            valid: true,
            format_valid: true,
            dns_valid: true,
            is_disposable: false
          };
        }
      },
      now: () => new Date('2026-08-23T12:00:00.000Z')
    });

    expect(requests).toEqual(['ana@example.com']);
    expect(result.email).toBe('ana@example.com');
    expect(result.socialSecurity).toBe('');
  });

  test('rejects invalid e-CPF document values before creating requests', async () => {
    await expect(validateEcpfCertificateRequest({
      input: {
        name: 'ANA SILVA',
        cpf: '111.111.111-11',
        birthDate: '2000-08-23',
        socialSecurity: '170.33259.50-4',
        email: 'ana@example.com',
        state: 'SP',
        city: 'São Paulo'
      },
      emailValidator: createEmailValidator(),
      now: () => new Date('2026-08-23T12:00:00.000Z')
    })).rejects.toThrow('CPF inválido');

    await expect(validateEcpfCertificateRequest({
      input: {
        name: 'ANA SILVA',
        cpf: '529.982.247-25',
        birthDate: '2000-08-23',
        socialSecurity: '123.45678.90-1',
        email: 'ana@example.com',
        state: 'SP',
        city: 'São Paulo'
      },
      emailValidator: createEmailValidator(),
      now: () => new Date('2026-08-23T12:00:00.000Z')
    })).rejects.toThrow('PIS/PASEP/NIS inválido');
  });

  test('rejects invalid birth dates without explaining the age rule', async () => {
    await expect(validateEcpfCertificateRequest({
      input: {
        name: 'ANA SILVA',
        cpf: '529.982.247-25',
        birthDate: '2011-08-24',
        socialSecurity: '',
        email: 'ana@example.com',
        state: 'SP',
        city: 'São Paulo'
      },
      emailValidator: createEmailValidator(),
      now: () => new Date('2026-08-23T12:00:00.000Z')
    })).rejects.toThrow('Data de nascimento inválida');

    await expect(validateEcpfCertificateRequest({
      input: {
        name: 'ANA SILVA',
        cpf: '529.982.247-25',
        birthDate: '1926-08-23',
        socialSecurity: '',
        email: 'ana@example.com',
        state: 'SP',
        city: 'São Paulo'
      },
      emailValidator: createEmailValidator(),
      now: () => new Date('2026-08-23T12:00:00.000Z')
    })).rejects.toThrow('Data de nascimento inválida');
  });

  test('validates e-CNPJ requests with company CNPJ, responsible CPF, birth date and e-mail', async () => {
    const result = await validateEcnpjCertificateRequest({
      input: {
        companyName: 'ACME LTDA',
        cnpj: '04.252.011/0001-10',
        tradeName: 'ACME',
        responsibleName: 'ANA SILVA',
        responsibleCpf: '529.982.247-25',
        responsiblePosition: 'Diretora',
        responsibleBirthDate: '2000-08-23',
        email: ' contato@example.com ',
        state: 'SP',
        city: 'São Paulo'
      },
      emailValidator: createEmailValidator(),
      now: () => new Date('2026-08-23T12:00:00.000Z')
    });

    expect(result.cnpj).toBe('04252011000110');
    expect(result.responsibleCpf).toBe('52998224725');
    expect(result.email).toBe('contato@example.com');
  });

  test('wraps e-mail validation failures as request validation errors', async () => {
    await expect(validateEcnpjCertificateRequest({
      input: {
        companyName: 'ACME LTDA',
        cnpj: '04.252.011/0001-10',
        tradeName: 'ACME',
        responsibleName: 'ANA SILVA',
        responsibleCpf: '529.982.247-25',
        responsiblePosition: 'Diretora',
        responsibleBirthDate: '2000-08-23',
        email: 'invalid@example.invalid',
        state: 'SP',
        city: 'São Paulo'
      },
      emailValidator: {
        validate: async () => {
          throw new Error('validator failed');
        }
      },
      now: () => new Date('2026-08-23T12:00:00.000Z')
    })).rejects.toBeInstanceOf(CertificateRequestValidationError);
  });
});
