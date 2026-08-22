const crypto = require('crypto');
const { Op } = require('sequelize');

class UserIdentityError extends Error {
  constructor(message, formData = {}) {
    super(message);
    this.name = 'UserIdentityError';
    this.formData = formData;
  }
}

function stripAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeFullName(fullName) {
  const normalized = stripAccents(fullName)
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  if (normalized.split(' ').filter(Boolean).length < 2) {
    throw new UserIdentityError('Informe nome e sobrenome');
  }

  return normalized;
}

function normalizeUsername(username) {
  return stripAccents(username).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function isUsernameCompliant(username) {
  return /^[A-Z0-9]+$/.test(String(username || ''));
}

function buildUsernameBase(fullName) {
  return normalizeUsername(normalizeFullName(fullName));
}

function randomTwoDigits() {
  return String(crypto.randomInt(0, 100)).padStart(2, '0');
}

async function usernameExists(userModel, username, excludeUserId) {
  const where = { username };

  if (excludeUserId) {
    where.id = { [Op.ne]: excludeUserId };
  }

  return Boolean(await userModel.findOne({ where }));
}

async function generateUniqueUsername({ userModel, fullName, excludeUserId = null, randomDigits = randomTwoDigits }) {
  const baseUsername = buildUsernameBase(fullName);

  if (!await usernameExists(userModel, baseUsername, excludeUserId)) {
    return baseUsername;
  }

  const tried = new Set();

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = String(randomDigits()).replace(/\D/g, '').padStart(2, '0').slice(-2);
    const candidate = `${baseUsername}${suffix}`;

    if (tried.has(candidate)) {
      continue;
    }

    tried.add(candidate);

    if (!await usernameExists(userModel, candidate, excludeUserId)) {
      return candidate;
    }
  }

  throw new UserIdentityError('Não foi possível gerar um nome de usuário único');
}

async function normalizeUserIdentity({ userModel, user, forceUsername = false, randomDigits = randomTwoDigits }) {
  const fullName = normalizeFullName(user.fullName);
  const currentUsername = normalizeUsername(user.username);
  const shouldRegenerateUsername = forceUsername || !currentUsername || currentUsername !== user.username || !isUsernameCompliant(user.username);
  const username = shouldRegenerateUsername
    ? await generateUniqueUsername({
      userModel,
      fullName,
      excludeUserId: user.id,
      randomDigits
    })
    : user.username;

  return {
    username,
    fullName
  };
}

module.exports = {
  UserIdentityError,
  generateUniqueUsername,
  isUsernameCompliant,
  normalizeFullName,
  normalizeUserIdentity,
  normalizeUsername
};
