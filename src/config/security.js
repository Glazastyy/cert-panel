function getRequiredEnv(key, env = process.env) {
  const value = env[key];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required`);
  }

  return value;
}

module.exports = {
  getRequiredEnv,
};
