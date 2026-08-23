const { describe, expect, test } = require('bun:test');

const {
  buildCertificateRequestMetadata,
  formatCertificateRequestPayload,
  formatCertificateRequestMetadata
} = require('../src/services/certificate-request-metadata');

describe('certificate request metadata service', () => {
  test('collects request metadata without sensitive headers', () => {
    const metadata = buildCertificateRequestMetadata({
      ip: '10.0.0.1',
      method: 'POST',
      originalUrl: '/certificates/request/ecpf',
      get: (name) => ({
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
        'accept-language': 'pt-BR,pt;q=0.9',
        referer: 'https://test-pcert.zerocert.com.br/dashboard',
        origin: 'https://test-pcert.zerocert.com.br',
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        cookie: 'connect.sid=secret'
      }[String(name).toLowerCase()])
    }, () => new Date('2026-08-23T12:00:00.000Z'));

    expect(metadata.ip).toBe('10.0.0.1');
    expect(metadata.forwardedFor).toBe('203.0.113.10, 10.0.0.1');
    expect(metadata.device).toBe('Mobile');
    expect(metadata.submittedAt).toBe('2026-08-23T12:00:00.000Z');
    expect(metadata.cookie).toBeUndefined();
  });

  test('formats submitted payload and metadata for detail pages', () => {
    const payloadRows = formatCertificateRequestPayload({
      name: 'ANA SILVA',
      cpf: '52998224725',
      metadata: {
        ip: '10.0.0.1'
      }
    });
    const metadataRows = formatCertificateRequestMetadata({
      ip: '10.0.0.1',
      device: 'Desktop'
    });

    expect(payloadRows).toEqual([
      ['Nome Completo', 'ANA SILVA'],
      ['CPF', '52998224725']
    ]);
    expect(metadataRows).toEqual([
      ['IP', '10.0.0.1'],
      ['Dispositivo', 'Desktop']
    ]);
  });
});
