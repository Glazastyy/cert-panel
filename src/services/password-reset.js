const crypto = require('crypto');
const { Op } = require('sequelize');
const { normalizeEmail } = require('./email-validation');

class PasswordResetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PasswordResetError';
  }
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function generateResetToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function buildResetUrl(baseUrl, token) {
  const url = new URL('/password/reset', String(baseUrl || '').replace(/\/+$/, ''));
  url.searchParams.set('token', token);

  return url.toString();
}

function createPasswordResetService(options) {
  const {
    userModel,
    resetTokenModel,
    emailService,
    tokenGenerator = generateResetToken,
    now = () => new Date()
  } = options;

  if (!userModel || !resetTokenModel || !emailService) {
    throw new Error('Serviço de redefinição de senha configurado de forma incompleta');
  }

  async function requestPasswordReset({ email, baseUrl }) {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return { sent: false };
    }

    const user = await userModel.findOne({
      where: {
        email: normalizedEmail,
        active: true
      }
    });

    if (!user) {
      return { sent: false };
    }

    const token = tokenGenerator();
    const createdAt = now();

    await resetTokenModel.update({
      usedAt: createdAt
    }, {
      where: {
        userId: user.id,
        usedAt: null
      }
    });

    await resetTokenModel.create({
      userId: user.id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(createdAt.getTime() + RESET_TOKEN_TTL_MS)
    });

    await emailService.sendPasswordResetLink({
      to: user.email,
      fullName: user.fullName,
      resetUrl: buildResetUrl(baseUrl, token)
    });

    return { sent: true };
  }

  async function findValidToken(token) {
    if (!String(token || '').trim()) {
      throw new PasswordResetError('Link de redefinição inválido ou expirado');
    }

    const tokenRow = await resetTokenModel.findOne({
      where: {
        tokenHash: hashResetToken(token),
        usedAt: null,
        expiresAt: {
          [Op.gt]: now()
        }
      },
      include: [{
        model: userModel,
        required: true
      }]
    });

    if (!tokenRow || !tokenRow.User || tokenRow.User.active === false) {
      throw new PasswordResetError('Link de redefinição inválido ou expirado');
    }

    return tokenRow;
  }

  async function resetPassword({ token, password, confirmPassword }) {
    if (!String(password || '') || password !== confirmPassword) {
      throw new PasswordResetError('As senhas não coincidem');
    }

    const tokenRow = await findValidToken(token);
    const currentTime = now();

    await tokenRow.User.update({ password });
    await tokenRow.update({ usedAt: currentTime });

    return tokenRow.User;
  }

  return {
    requestPasswordReset,
    resetPassword,
    findValidToken
  };
}

module.exports = {
  PasswordResetError,
  createPasswordResetService,
  generateResetToken,
  hashResetToken
};
