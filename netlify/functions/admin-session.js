const { getSession } = require('../../shared/auth');

// Joriy sessiya: rol (owner/operator) va login — panel shunga qarab
// bo'limlarni ko'rsatadi (server tomonda baribir tekshiriladi).
exports.handler = async (event) => {
  const session = getSession(event.headers);
  return {
    statusCode: session ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session ? { ok: true, role: session.role, username: session.username } : { ok: false }),
  };
};
