const { EmailValidationError, normalizeEmail } = require('./email-validation');

class CertificateRequestValidationError extends Error {
  constructor(message, formData = {}) {
    super(message);
    this.name = 'CertificateRequestValidationError';
    this.formData = formData;
  }
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function hasRepeatedDigits(value) {
  return /^(\d)\1+$/.test(value);
}

function validateCpf(value) {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || hasRepeatedDigits(cpf)) {
    return false;
  }

  let sum = 0;

  for (let index = 0; index < 9; index += 1) {
    sum += Number(cpf[index]) * (10 - index);
  }

  const firstDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11);

  if (firstDigit !== Number(cpf[9])) {
    return false;
  }

  sum = 0;

  for (let index = 0; index < 10; index += 1) {
    sum += Number(cpf[index]) * (11 - index);
  }

  const secondDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11);

  return secondDigit === Number(cpf[10]);
}

function validateCnpj(value) {
  const cnpj = onlyDigits(value);

  if (cnpj.length !== 14 || hasRepeatedDigits(cnpj)) {
    return false;
  }

  function digit(length) {
    let sum = 0;
    let position = length - 7;

    for (let index = length; index >= 1; index -= 1) {
      sum += Number(cnpj[length - index]) * position;
      position -= 1;

      if (position < 2) {
        position = 9;
      }
    }

    return sum % 11 < 2 ? 0 : 11 - (sum % 11);
  }

  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

function validatePisPasepNis(value) {
  const pis = onlyDigits(value);
  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  if (pis.length !== 11 || hasRepeatedDigits(pis)) {
    return false;
  }

  const sum = weights.reduce((total, weight, index) => total + Number(pis[index]) * weight, 0);
  const remainder = 11 - (sum % 11);
  const digit = remainder === 10 || remainder === 11 ? 0 : remainder;

  return digit === Number(pis[10]);
}

function parseDateOnly(value) {
  const raw = String(value || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }

  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return { year, month, day, raw };
}

function calculateAge(birthDate, currentDate) {
  let age = currentDate.getFullYear() - birthDate.year;
  const currentMonth = currentDate.getMonth() + 1;
  const currentDay = currentDate.getDate();

  if (currentMonth < birthDate.month || (currentMonth === birthDate.month && currentDay < birthDate.day)) {
    age -= 1;
  }

  return age;
}

function validateBirthDate(value, now) {
  const birthDate = parseDateOnly(value);

  if (!birthDate) {
    throw new CertificateRequestValidationError('Data de nascimento inválida');
  }

  const currentDate = new Date(now());

  if (Number.isNaN(currentDate.getTime())) {
    throw new Error('Data atual inválida');
  }

  const age = calculateAge(birthDate, currentDate);

  if (age < 16 || age >= 100) {
    throw new CertificateRequestValidationError('Data de nascimento inválida');
  }

  return birthDate.raw;
}

function requireText(input, field, message) {
  const value = String(input[field] || '').trim();

  if (!value) {
    throw new CertificateRequestValidationError(message);
  }

  return value;
}

async function validateRequestEmail({ email, emailValidator }) {
  const normalizedEmail = normalizeEmail(email);

  try {
    const result = await emailValidator.validate(normalizedEmail);

    return normalizeEmail(result.email || normalizedEmail);
  } catch (error) {
    if (error instanceof EmailValidationError || error instanceof Error) {
      throw new CertificateRequestValidationError('Informe um e-mail válido e não descartável');
    }

    throw error;
  }
}

async function validateEcpfCertificateRequest({ input, emailValidator, now = () => new Date() }) {
  const formData = {
    name: requireText(input, 'name', 'Nome completo obrigatório'),
    cpf: String(input.cpf || '').trim(),
    birthDate: String(input.birthDate || '').trim(),
    socialSecurity: String(input.socialSecurity || '').trim(),
    email: normalizeEmail(input.email),
    state: requireText(input, 'state', 'Estado obrigatório'),
    city: requireText(input, 'city', 'Cidade obrigatória')
  };

  if (!validateCpf(formData.cpf)) {
    throw new CertificateRequestValidationError('CPF inválido', formData);
  }

  if (formData.socialSecurity && !validatePisPasepNis(formData.socialSecurity)) {
    throw new CertificateRequestValidationError('PIS/PASEP/NIS inválido', formData);
  }

  try {
    formData.birthDate = validateBirthDate(formData.birthDate, now);
  } catch (error) {
    if (error instanceof CertificateRequestValidationError) {
      throw new CertificateRequestValidationError(error.message, formData);
    }

    throw error;
  }

  formData.email = await validateRequestEmail({ email: formData.email, emailValidator });

  return {
    ...formData,
    cpf: onlyDigits(formData.cpf),
    socialSecurity: formData.socialSecurity ? onlyDigits(formData.socialSecurity) : ''
  };
}

async function validateEcnpjCertificateRequest({ input, emailValidator, now = () => new Date() }) {
  const formData = {
    companyName: requireText(input, 'companyName', 'Razão social obrigatória'),
    cnpj: String(input.cnpj || '').trim(),
    tradeName: requireText(input, 'tradeName', 'Nome fantasia obrigatório'),
    responsibleName: requireText(input, 'responsibleName', 'Nome do responsável obrigatório'),
    responsibleCpf: String(input.responsibleCpf || '').trim(),
    responsiblePosition: requireText(input, 'responsiblePosition', 'Cargo do responsável obrigatório'),
    responsibleBirthDate: String(input.responsibleBirthDate || '').trim(),
    email: normalizeEmail(input.email),
    state: requireText(input, 'state', 'Estado obrigatório'),
    city: requireText(input, 'city', 'Cidade obrigatória')
  };

  if (!validateCnpj(formData.cnpj)) {
    throw new CertificateRequestValidationError('CNPJ inválido', formData);
  }

  if (!validateCpf(formData.responsibleCpf)) {
    throw new CertificateRequestValidationError('CPF do responsável inválido', formData);
  }

  try {
    formData.responsibleBirthDate = validateBirthDate(formData.responsibleBirthDate, now);
  } catch (error) {
    if (error instanceof CertificateRequestValidationError) {
      throw new CertificateRequestValidationError(error.message, formData);
    }

    throw error;
  }

  formData.email = await validateRequestEmail({ email: formData.email, emailValidator });

  return {
    ...formData,
    cnpj: onlyDigits(formData.cnpj),
    responsibleCpf: onlyDigits(formData.responsibleCpf)
  };
}

module.exports = {
  CertificateRequestValidationError,
  onlyDigits,
  validateBirthDate,
  validateCnpj,
  validateCpf,
  validateEcnpjCertificateRequest,
  validateEcpfCertificateRequest,
  validatePisPasepNis
};
