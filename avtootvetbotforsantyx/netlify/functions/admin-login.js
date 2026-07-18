const { createSession, verifyPassword } = require('../../shared/auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { password } = JSON.parse(event.body || '{}');
  if (!verifyPassword(password)) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Noto‘g‘ri parol' }) };
  }

  const session = createSession();
  return {
    statusCode: 200,
    headers: {
      'Set-Cookie': `admin_session=${session}; Path=/; HttpOnly; SameSite=Strict; Secure`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ok: true }),
  };
};
