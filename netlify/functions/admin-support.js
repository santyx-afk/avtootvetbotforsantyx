const { requireAdmin, getSession } = require('../../shared/auth');
const { getAdminClient, request, toQuery, countRows } = require('../../shared/db');
const { sendSupportReply } = require('../../shared/support-service');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

// Inbox uchun oxirgi shuncha xabar ko'riladi (suhbatlar ro'yxati). Eski
// suhbatlar ro'yxatdan tushadi, lekin mijoz kartochkasidan ochilaveradi.
const INBOX_WINDOW = 1000;
const THREAD_LIMIT = 500;
const MIGRATION_HINT = 'Murojaatlar uchun migrations/2026-10-12_support-messages.sql qo‘llanishi kerak.';

// "Murojaatlar" bo'limi (egasi ham, operator ham):
//   GET            — suhbatlar ro'yxati: har mijoz bo'yicha oxirgi xabar va o'qilmaganlar
//   GET ?count=1   — o'qilmagan murojaatlar soni (menyu nishoni)
//   GET ?user_id=X — bitta suhbat; mijoz xabarlari o'qilgan deb belgilanadi
//   POST {telegram_id, text} — javob: mijozga bot orqali boradi
exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();
  const params = event.queryStringParameters || {};

  try {
    if (event.httpMethod === 'GET' && params.count) {
      const unread = await countRows(db, 'support_messages', 'direction=eq.in&is_read=eq.false').catch(() => 0);
      return json(200, { ok: true, unread });
    }

    if (event.httpMethod === 'GET' && params.user_id) {
      const uid = String(params.user_id).replace(/\D/g, '');
      if (!uid) return json(400, { ok: false, error: 'user_id noto‘g‘ri' });
      const [{ data: messages }, { data: users }] = await Promise.all([
        request(db, 'support_messages', { query: toQuery({ select: '*', user_telegram_id: `eq.${uid}`, order: 'created_at.desc', limit: THREAD_LIMIT }) }),
        request(db, 'users', { query: `select=telegram_id,username,full_name,phone&telegram_id=eq.${uid}&limit=1` }).catch(() => ({ data: [] })),
      ]);
      // Ochildi — mijoz xabarlari o'qilgan
      await request(db, 'support_messages', {
        method: 'PATCH',
        query: toQuery({ user_telegram_id: `eq.${uid}`, direction: 'eq.in', is_read: 'eq.false' }),
        body: { is_read: true },
      }).catch((e) => console.warn('support mark read warn:', e?.message));
      return json(200, { ok: true, user: users?.[0] || { telegram_id: uid }, messages: (messages || []).reverse() });
    }

    if (event.httpMethod === 'GET') {
      let rows;
      try {
        ({ data: rows } = await request(db, 'support_messages', {
          query: toQuery({ select: 'user_telegram_id,direction,text,file_type,order_number,is_read,created_at', order: 'created_at.desc', limit: INBOX_WINDOW }),
        }));
      } catch {
        return json(200, { ok: true, conversations: [], migrationMissing: true, hint: MIGRATION_HINT });
      }
      const byUser = new Map();
      for (const m of rows || []) {
        const id = String(m.user_telegram_id);
        if (!byUser.has(id)) byUser.set(id, { telegram_id: id, last: m, unread: 0, order_number: null });
        const conv = byUser.get(id);
        if (m.direction === 'in' && !m.is_read) conv.unread += 1;
        if (!conv.order_number && m.order_number) conv.order_number = m.order_number;
      }
      const ids = [...byUser.keys()];
      const userMap = {};
      if (ids.length) {
        const { data: users } = await request(db, 'users', {
          query: `select=telegram_id,username,full_name,phone&telegram_id=in.(${ids.join(',')})`,
        }).catch(() => ({ data: [] }));
        for (const u of users || []) userMap[String(u.telegram_id)] = u;
      }
      const conversations = ids.map((id) => ({ ...byUser.get(id), user: userMap[id] || null }));
      return json(200, { ok: true, conversations });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const telegramId = String(body.telegram_id || '').replace(/\D/g, '');
      if (!telegramId) return json(400, { ok: false, error: 'telegram_id kerak' });
      const session = getSession(event.headers);
      const adminName = session?.role === 'owner' ? 'Egasi' : (session?.username || 'operator');
      try {
        const message = await sendSupportReply(db, { telegramId, text: body.text, adminName });
        return json(200, { ok: true, message });
      } catch (error) {
        if (error?.status === 400) return json(400, { ok: false, error: error.message });
        const msg = String(error?.message || '');
        if (/support_messages/.test(msg)) return json(500, { ok: false, error: MIGRATION_HINT });
        if (/blocked|deactivated|chat not found|forbidden/i.test(msg)) {
          return json(502, { ok: false, error: 'Mijozga yuborib bo‘lmadi: u botni bloklagan yoki o‘chirgan.' });
        }
        throw error;
      }
    }

    return json(405, { ok: false });
  } catch (err) {
    console.error('admin-support error', err);
    return json(500, { ok: false, error: 'server_error' });
  }
};
