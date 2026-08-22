const { describe, expect, test } = require('bun:test');

const { formatCertificateUsage } = require('../src/services/certificate-formatting');

describe('certificate formatting service', () => {
  test('formats object usage values without object coercion', () => {
    expect(formatCertificateUsage({
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: false,
      emailProtection: true
    })).toBe('Digital Signature, Non Repudiation, Email Protection');
  });

  test('formats arrays and empty values safely', () => {
    expect(formatCertificateUsage(['clientAuth', 'timeStamping'])).toBe('Client Auth, Time Stamping');
    expect(formatCertificateUsage({})).toBe('Não disponível');
    expect(formatCertificateUsage(null)).toBe('Não disponível');
  });
});
