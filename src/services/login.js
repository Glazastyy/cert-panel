const { Op } = require('sequelize');
const { normalizeEmail } = require('./email-validation');
const { normalizeUsername } = require('./user-identity');

async function findLoginUser({ userModel, login }) {
  if (!userModel) {
    throw new Error('Modelo de usuário não informado');
  }

  const rawLogin = String(login || '').trim();
  const normalizedUsername = normalizeUsername(rawLogin);
  const normalizedEmail = normalizeEmail(rawLogin);
  const identifiers = [];

  if (rawLogin) {
    identifiers.push({ username: rawLogin });
  }

  if (normalizedUsername) {
    identifiers.push({ username: normalizedUsername });
  }

  if (normalizedEmail) {
    identifiers.push({ email: normalizedEmail });
  }

  if (identifiers.length === 0) {
    return null;
  }

  return userModel.findOne({
    where: {
      [Op.or]: identifiers
    }
  });
}

module.exports = {
  findLoginUser
};
