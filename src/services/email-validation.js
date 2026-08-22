class EmailValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmailValidationError';
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function createEmailValidator(dependencies = {}) {
  const finalDependencies = {
    fetch: globalThis.fetch,
    endpoint: 'https://api.likn.dev/v1/public/email-validation/validate',
    timeoutMs: 8000,
    ...dependencies
  };

  async function validate(email) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      throw new EmailValidationError('E-mail obrigatório');
    }

    if (typeof finalDependencies.fetch !== 'function') {
      throw new EmailValidationError('Validador de e-mail indisponível');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), finalDependencies.timeoutMs);

    try {
      const url = new URL(finalDependencies.endpoint);
      url.searchParams.set('email', normalizedEmail);

      const response = await finalDependencies.fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response || !response.ok) {
        throw new EmailValidationError('Não foi possível validar este e-mail');
      }

      const payload = await response.json();

      if (!payload || payload.valid !== true || payload.format_valid !== true || payload.dns_valid !== true || payload.is_disposable === true) {
        throw new EmailValidationError('Informe um e-mail válido e não descartável');
      }

      return {
        ...payload,
        email: normalizeEmail(payload.email || normalizedEmail)
      };
    } catch (error) {
      if (error instanceof EmailValidationError) {
        throw error;
      }

      throw new EmailValidationError('Não foi possível validar este e-mail');
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    validate
  };
}

const emailValidator = createEmailValidator();

module.exports = {
  EmailValidationError,
  createEmailValidator,
  emailValidator,
  normalizeEmail
};
