const { requireAdmin } = require('../../shared/auth');

exports.handler = async (event) => {
  return {
    statusCode: requireAdmin(event.headers) ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: requireAdmin(event.headers) }),
  };
};
