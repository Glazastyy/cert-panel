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
  return /^[A-Z0-9]{1,6}$/.test(String(username || ''));
}

function buildUsernamePrefix(fullName) {
  const parts = normalizeFullName(fullName).split(' ').filter(Boolean);
  const first = normalizeUsername(parts[0] || '');
  const last = normalizeUsername(parts[parts.length - 1] || '');
  const prefix = `${first.slice(0, 2)}${last.slice(0, 3)}`.padEnd(5, 'X');

  return prefix.slice(0, 5);
}

function randomTwoDigits() {
  return String(crypto.randomInt(0, 100)).padStart(2, '0');
}

function normalizeNumericSuffix(value, size) {
  const digits = String(value || '').replace(/\D/g, '').padStart(size, '0');

  return digits.slice(0, size);
}

async function usernameExists(userModel, username, excludeUserId) {
  const where = { username };

  if (excludeUserId) {
    where.id = { [Op.ne]: excludeUserId };
  }

  return Boolean(await userModel.findOne({ where }));
}

async function generateUniqueUsername({ userModel, fullName, excludeUserId = null, randomDigits = randomTwoDigits }) {
  const prefix = buildUsernamePrefix(fullName);

  const tried = new Set();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const suffix = normalizeNumericSuffix(randomDigits(), 1);
    const candidate = `${prefix}${suffix}`;

    if (tried.has(candidate)) {
      continue;
    }

    tried.add(candidate);

    if (!await usernameExists(userModel, candidate, excludeUserId)) {
      return candidate;
    }
  }

  const shortPrefix = prefix.slice(0, 4);

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const suffix = normalizeNumericSuffix(randomDigits(), 2);
    const candidate = `${shortPrefix}${suffix}`;

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
