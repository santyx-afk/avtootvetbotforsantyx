const { getSession } = require('../../shared/auth');
const { getAdminClient, request } = require('../../shared/db');

const CLEAR_COOKIE = 'admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure';

function json(statusCode, body, extraHeaders = {}) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) };
}

// Joriy sessiya: rol (owner/operator) va login — panel shunga qarab
// bo'limlarni ko'rsatadi (server tomonda baribir tekshiriladi).
// Operator uchun faolligi ham tekshiriladi: egasi uni o'chirgan bo'lsa,
// panel qayta ochilganda sessiya tugaydi (cookie tozalanadi).
exports.handler = async (event) => {
  const session = getSession(event.headers);
  if (!session) return json(401, { ok: false });

  if (session.role === 'operator') {
    try {
      const { data } = await request(getAdminClient(), 'admins', {
        query: `select=is_active&username=eq.${encodeURIComponent(String(session.username || '').toLowerCase())}&limit=1`,
      });
      if (!data?.[0] || data[0].is_active === false) {
        return json(401, { ok: false, error: 'operator_inactive' }, { 'Set-Cookie': CLEAR_COOKIE });
      }
    } catch (error) {
      // Baza javob bermasa sessiya kuchda qoladi (TTL 2 soat baribir cheklaydi)
      console.warn('operator active check warn:', error?.message);
    }
  }
  return json(200, { ok: true, role: session.role, username: session.username });
};
