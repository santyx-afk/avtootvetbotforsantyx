const { requireOwner, hashPassword } = require('../../shared/auth');
const { getAdminClient, request, toQuery } = require('../../shared/db');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Operatorlarni boshqarish — FAQAT egasi. Egasi o'zi jadvalda emas (env parol).
// Operator: login + parol (scrypt), rol 'operator'. Faol bo'lmagan operator
// kira olmaydi, lekin tarixda qoladi.
exports.handler = async (event) => {
  if (!requireOwner(event.headers)) return json(403, { ok: false, error: 'Faqat egasi uchun' });
  const db = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      const { data } = await request(db, 'admins', { query: toQuery({ select: 'id,username,role,is_active,telegram_id,last_login_at,created_at', order: 'created_at.asc', limit: 100 }) });
      return json(200, { ok: true, admins: data || [] });
    }
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

    const body = JSON.parse(event.body || '{}');
    const action = String(body.action || 'create');

    if (action === 'create') {
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!/^[a-z0-9_.-]{2,40}$/.test(username)) return json(400, { ok: false, error: 'Login: 2–40 belgi, lotin harflari, raqam, _ . -' });
      if (password.length < 6) return json(400, { ok: false, error: 'Parol kamida 6 belgi' });
      if (username === 'owner') return json(400, { ok: false, error: 'Bu login band' });
      const { data } = await request(db, 'admins', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: { username, password_hash: hashPassword(password), role: 'operator', is_active: true, telegram_id: body.telegram_id ? String(body.telegram_id).replace(/\D/g, '') || null : null },
      }).catch((error) => {
        if (/duplicate|unique|23505/i.test(String(error?.message))) throw Object.assign(new Error('Bunday login allaqachon bor'), { expose: true });
        throw error;
      });
      return json(200, { ok: true, admin: data?.[0] || null });
    }

    const id = String(body.id || '').replace(/[^0-9a-f-]/gi, '');
    if (!id) return json(400, { ok: false, error: 'id talab qilinadi' });

    if (action === 'set-active') {
      await request(db, 'admins', { method: 'PATCH', query: `id=eq.${id}`, body: { is_active: Boolean(body.is_active) } });
      return json(200, { ok: true });
    }
    if (action === 'set-password') {
      const password = String(body.password || '');
      if (password.length < 6) return json(400, { ok: false, error: 'Parol kamida 6 belgi' });
      await request(db, 'admins', { method: 'PATCH', query: `id=eq.${id}`, body: { password_hash: hashPassword(password) } });
      return json(200, { ok: true });
    }
    if (action === 'delete') {
      await request(db, 'admins', { method: 'DELETE', query: `id=eq.${id}` });
      return json(200, { ok: true });
    }
    return json(400, { ok: false, error: 'Noma’lum action' });
  } catch (error) {
    console.error('admin-admins error', error);
    return json(500, { ok: false, error: error?.expose ? error.message : 'Server xatosi' });
  }
};
