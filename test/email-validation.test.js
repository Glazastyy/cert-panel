const { describe, expect, test } = require('bun:test');

const {
  EmailValidationError,
  createEmailValidator
} = require('../src/services/email-validation');

describe('email validation service', () => {
  test('calls the backend validation API with the normalized e-mail address', async () => {
    const requests = [];
    const validator = createEmailValidator({
      fetch: async (url, payload) => {
        requests.push({ url, payload });
        return {
          ok: true,
          json: async () => ({
            email: 'user@gmail.com',
            valid: true,
            format_valid: true,
            domain: 'gmail.com',
            is_disposable: false,
            dns_valid: true,
            mx_records: [],
            provider: 'Gmail',
            errors: []
          })
        };
      }
    });

    const result = await validator.validate(' User@GMAIL.com ');
    const url = new URL(requests[0].url);

    expect(result.email).toBe('user@gmail.com');
    expect(url.origin).toBe('https://api.likn.dev');
    expect(url.pathname).toBe('/v1/public/email-validation/validate');
    expect(url.searchParams.get('email')).toBe('user@gmail.com');
    expect(requests[0].payload.method).toBe('GET');
  });

  test('rejects disposable or DNS-invalid e-mail validation results', async () => {
    const validator = createEmailValidator({
      fetch: async () => ({
        ok: true,
        json: async () => ({
          email: 'user@example.invalid',
          valid: true,
          format_valid: true,
          domain: 'example.invalid',
          is_disposable: false,
          dns_valid: false,
          mx_records: [],
          provider: null,
          errors: []
        })
      })
    });

    await expect(validator.validate('user@example.invalid')).rejects.toBeInstanceOf(EmailValidationError);
  });

  test('fails closed when the validation API is unavailable', async () => {
    const validator = createEmailValidator({
      fetch: async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: 'unavailable' })
      })
    });

    await expect(validator.validate('user@gmail.com')).rejects.toBeInstanceOf(EmailValidationError);
  });
});
