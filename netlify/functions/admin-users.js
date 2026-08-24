const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, request, toQuery, addWalletTransaction } = require('../../shared/db');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();
  try {
    // --- Bitta foydalanuvchi tafsilotlari: balans, xaridlar, balans tarixi ---
    if (event.httpMethod === 'GET' && event.queryStringParameters?.user_id) {
      const uid = String(event.queryStringParameters.user_id);
      const [walletRes, ordersRes, txRes, plansRes] = await Promise.all([
        request(db, 'user_wallets', { query: `select=balance&user_telegram_id=eq.${uid}&limit=1` }).catch(() => ({ data: [] })),
        request(db, 'orders', { query: `select=order_number,created_at,unique_price,amount,status,order_type,promo_code,payment_method,plan_id&user_telegram_id=eq.${uid}&order=created_at.desc&limit=100` }).catch(() => ({ data: [] })),
        request(db, 'wallet_transactions', { query: `select=amount,type,description,created_at&user_telegram_id=eq.${uid}&order=created_at.desc&limit=100` }).catch(() => ({ data: [] })),
        request(db, 'plans', { query: 'select=id,name' }).catch(() => ({ data: [] })),
      ]);
      const planMap = {};
      for (const p of plansRes.data || []) planMap[p.id] = p.name;
      const balance = Number(walletRes.data?.[0]?.balance || 0);
      const purchases = (ordersRes.data || [])
        .filter((o) => String(o.order_type || 'purchase') !== 'topup')
        .map((o) => ({
          order_number: o.order_number,
          created_at: o.created_at,
          amount: Number(o.unique_price ?? o.amount ?? 0),
          status: o.status,
          plan_name: planMap[o.plan_id] || '-',
          promo_code: o.promo_code || null,
          payment_method: o.payment_method || null,
        }));
      const balanceHistory = (txRes.data || []).map((t) => ({
        amount: Number(t.amount), type: t.type, description: t.description, created_at: t.created_at,
      }));
      return json(200, { ok: true, balance, purchases, balanceHistory });
    }

    // --- Foydalanuvchilar ro'yxati (balans + xaridlar soni + oxirgi faollik) ---
    if (event.httpMethod === 'GET') {
      // Ilgari limit 500 edi — 889 foydalanuvchidan 389 tasi admin panelda
      // umuman ko'rinmasdi (qidiruv ham faqat yuklanganlar ichida ishlardi).
      // Endi standart 5000: butun baza bir marta keladi, qidiruv to'liq ishlaydi.
      const limit = Math.min(Math.max(Number(event.queryStringParameters?.limit || 5000), 1), 10000);
      const cols = 'telegram_id,username,full_name,phone,language_code,is_blocked,created_at,updated_at';
      const [usersRes, walletsRes, ordersRes] = await Promise.all([
        request(db, 'users', { query: `select=${cols}&order=created_at.desc&limit=${limit}` })
          .catch(() => request(db, 'users', { query: `select=telegram_id,username,full_name,phone,language_code,created_at&order=created_at.desc&limit=${limit}` })),
        request(db, 'user_wallets', { query: 'select=user_telegram_id,balance' }).catch(() => ({ data: [] })),
        request(db, 'orders', { query: 'select=user_telegram_id,created_at,order_type&order=created_at.desc&limit=10000' }).catch(() => ({ data: [] })),
      ]);
      const balanceMap = {};
      for (const w of walletsRes.data || []) balanceMap[String(w.user_telegram_id)] = Number(w.balance || 0);
      const purchaseMap = {};
      const lastMap = {};
      for (const o of ordersRes.data || []) {
        const id = String(o.user_telegram_id);
        if (String(o.order_type || 'purchase') !== 'topup') purchaseMap[id] = (purchaseMap[id] || 0) + 1;
        if (!lastMap[id]) lastMap[id] = o.created_at; // desc tartib — birinchisi eng oxirgi
      }
      const users = (usersRes.data || []).map((u) => {
        const id = String(u.telegram_id);
        return { ...u, balance: balanceMap[id] || 0, purchases: purchaseMap[id] || 0, last_activity: lastMap[id] || u.updated_at || u.created_at };
      });
      return json(200, { ok: true, users });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action, telegram_id } = body;
      if (!telegram_id) return json(400, { ok: false, error: 'telegram_id talab qilinadi' });

      if (action === 'block' || action === 'unblock') {
        await request(db, 'users', {
          method: 'PATCH',
          query: toQuery({ telegram_id: `eq.${telegram_id}` }),
          headers: { Prefer: 'return=representation' },
          body: { is_blocked: action === 'block' },
        });
        return json(200, { ok: true });
      }

      if (action === 'adjust-balance') {
        const amount = Math.round(Math.abs(Number(body.amount || 0)));
        if (!(amount > 0)) return json(400, { ok: false, error: 'Summa noldan katta bo‘lishi kerak' });
        const isAdd = body.direction !== 'subtract';
        const reason = String(body.reason || '').slice(0, 200);
        try {
          const res = await addWalletTransaction(db, {
            user_telegram_id: telegram_id,
            amount,
            type: isAdd ? 'admin_credit' : 'admin_debit',
            description: `Admin ${isAdd ? 'qo‘shdi' : 'ayirdi'}${reason ? ': ' + reason : ''}`,
            admin_id: 'web_admin',
          });
          return json(200, { ok: true, balance: Number(res.wallet?.balance || 0) });
        } catch (e) {
          return json(500, { ok: false, error: `Balans o‘zgartirishda xato (sql/17 migratsiya qo‘llanganmi?): ${e.message}` });
        }
      }

      return json(400, { ok: false, error: 'Unknown action' });
    }
    return json(405, { ok: false });
  } catch (err) {
    console.error('admin-users error', err);
    return json(500, { ok: false, error: 'server_error' });
  }
};
