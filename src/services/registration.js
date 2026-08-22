const crypto = require('crypto');
const bcrypt = require('bcrypt');

const { EmailValidationError, normalizeEmail } = require('./email-validation');

class RegistrationInputError extends Error {
  constructor(message, formData = {}) {
    super(message);
    this.name = 'RegistrationInputError';
    this.formData = formData;
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const REGISTRATION_TTL_MS = 15 * 60 * 1000;

function normalizeUsername(username) {
  return String(username || '').trim();
}

function normalizeFullName(fullName) {
  return String(fullName || '').trim();
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function generateVerificationCode() {
  let code = '';

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    const randomIndex = crypto.randomInt(0, CODE_ALPHABET.length);
    code += CODE_ALPHABET[randomIndex];
  }

  return code;
}

function hashCode(code, sessionSecret) {
  return crypto
    .createHmac('sha256', sessionSecret)
    .update(normalizeCode(code))
    .digest('hex');
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');

  if (leftBuffer.length !== rightBuffer.length || leftBuffer.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getPublicFormData(input) {
  return {
    username: normalizeUsername(input.username),
    fullName: normalizeFullName(input.fullName),
    email: normalizeEmail(input.email)
  };
}

function createRegistrationService(options) {
  const {
    userModel,
    emailValidator,
    emailService,
    sessionSecret,
    codeGenerator = generateVerificationCode,
    now = () => new Date()
  } = options;

  if (!userModel || !emailValidator || !emailService || !sessionSecret) {
    throw new Error('Serviço de registro configurado de forma incompleta');
  }

  async function beginRegistration({ session, input }) {
    const formData = getPublicFormData(input);
    const password = String(input.password || '');
    const confirmPassword = String(input.confirmPassword || '');

    if (!formData.username || !formData.fullName || !formData.email || !password || !confirmPassword) {
      throw new RegistrationInputError('Preencha todos os campos obrigatórios', formData);
    }

    if (password !== confirmPassword) {
      throw new RegistrationInputError('As senhas não coincidem', formData);
    }

    const existingUser = await userModel.findOne({
      where: { username: formData.username }
    });

    if (existingUser) {
      throw new RegistrationInputError('Nome de usuário já está em uso', {
        fullName: formData.fullName,
        email: formData.email
      });
    }

    const existingEmail = await userModel.findOne({
      where: { email: formData.email }
    });

    if (existingEmail) {
      throw new RegistrationInputError('E-mail já está em uso', {
        username: formData.username,
        fullName: formData.fullName
      });
    }

    let validation;

    try {
      validation = await emailValidator.validate(formData.email);
    } catch (error) {
      if (error instanceof EmailValidationError) {
        throw new RegistrationInputError(error.message, formData);
      }

      throw error;
    }

    if (!validation || validation.valid !== true || validation.format_valid !== true || validation.dns_valid !== true || validation.is_disposable === true) {
      throw new RegistrationInputError('Informe um e-mail válido e não descartável', formData);
    }

    const verifiedEmail = normalizeEmail(validation.email || formData.email);
    const code = normalizeCode(codeGenerator());
    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + REGISTRATION_TTL_MS);

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      throw new Error('Código de confirmação inválido');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await emailService.sendVerificationCode({
      to: verifiedEmail,
      fullName: formData.fullName,
      code
    });

    session.pendingRegistration = {
      username: formData.username,
      passwordHash,
      fullName: formData.fullName,
      email: verifiedEmail,
      codeHash: hashCode(code, sessionSecret),
      expiresAt: expiresAt.toISOString()
    };

    return {
      username: formData.username,
      fullName: formData.fullName,
      email: verifiedEmail,
      expiresAt: expiresAt.toISOString()
    };
  }

  async function confirmRegistration({ session, code }) {
    const pendingRegistration = session.pendingRegistration;

    if (!pendingRegistration) {
      throw new RegistrationInputError('Nenhum cadastro pendente para confirmar');
    }

    if (new Date(pendingRegistration.expiresAt).getTime() <= now().getTime()) {
      delete session.pendingRegistration;
      throw new RegistrationInputError('O código expirou. Faça o cadastro novamente.');
    }

    const candidateHash = hashCode(code, sessionSecret);

    if (!safeCompare(candidateHash, pendingRegistration.codeHash)) {
      throw new RegistrationInputError('Código de confirmação inválido');
    }

    const existingUser = await userModel.findOne({
      where: { username: pendingRegistration.username }
    });

    if (existingUser) {
      delete session.pendingRegistration;
      throw new RegistrationInputError('Nome de usuário já está em uso');
    }

    const existingEmail = await userModel.findOne({
      where: { email: pendingRegistration.email }
    });

    if (existingEmail) {
      delete session.pendingRegistration;
      throw new RegistrationInputError('E-mail já está em uso');
    }

    const user = await userModel.create({
      username: pendingRegistration.username,
      password: pendingRegistration.passwordHash,
      fullName: pendingRegistration.fullName,
      email: pendingRegistration.email,
      role: 'user'
    }, {
      hooks: false
    });

    delete session.pendingRegistration;

    return user;
  }

  return {
    beginRegistration,
    confirmRegistration
  };
}

module.exports = {
  RegistrationInputError,
  createRegistrationService,
  generateVerificationCode,
  normalizeCode
};
