exports.handler = async () => ({
  statusCode: 200,
  headers: {
    'Set-Cookie': 'admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ ok: true }),
});
