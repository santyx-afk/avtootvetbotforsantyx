const requiredVars = ['TELEGRAM_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

function getEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

function assertEnv(names = requiredVars) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  getEnv,
  assertEnv,
};
