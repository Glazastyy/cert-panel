const ALLOWED_PRIVILEGED_EMAIL_DOMAINS = ['zerocert.com.br', 'zerocerty.com'];
const PRIVILEGED_EMAIL_MESSAGE = 'Administradores e operadores devem usar e-mail @zerocert.com.br ou @zerocerty.com.';

class PrivilegedEmailError extends Error {
  constructor(message = PRIVILEGED_EMAIL_MESSAGE) {
    super(message);
    this.name = 'PrivilegedEmailError';
  }
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isPrivilegedRole(role) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === 'admin' || normalizedRole === 'operator';
}

function getEmailDomain(email) {
  const normalizedEmail = normalizeEmail(email);
  const parts = normalizedEmail.split('@');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return '';
  }

  return parts[1];
}

function isAllowedPrivilegedEmail(email) {
  return ALLOWED_PRIVILEGED_EMAIL_DOMAINS.includes(getEmailDomain(email));
}

function assertPrivilegedEmailAllowed({ role, email }) {
  if (isPrivilegedRole(role) && !isAllowedPrivilegedEmail(email)) {
    throw new PrivilegedEmailError();
  }

  return true;
}

module.exports = {
  ALLOWED_PRIVILEGED_EMAIL_DOMAINS,
  PRIVILEGED_EMAIL_MESSAGE,
  PrivilegedEmailError,
  assertPrivilegedEmailAllowed,
  isAllowedPrivilegedEmail,
  isPrivilegedRole
};
