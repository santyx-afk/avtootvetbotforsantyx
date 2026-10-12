const { requireAdmin, requireOwner } = require('../../shared/auth');
const { getAdminClient, request, fetchAllRows, toQuery, addWalletTransaction, rpcRequest, isPaidPurchase, orderSaleValue } = require('../../shared/db');
const { sendMessage } = require('../../shared/telegram');
const { SEGMENTS, segmentLabel, resolveSegment } = require('../../shared/broadcast-service');

function json(sc, body) { return { statusCode: sc, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }

// Xabar yuborishga ajratilgan vaqt. Netlify funksiyasi ~10 soniyada uziladi,
// shuning uchun balans o'zgarishi (tez, atomik) bilan xabar yuborish (sekin,
// Telegram tezlik chegarasiga bog'liq) ajratilgan: balans HAMMAGA qo'llanadi,
// xabar esa qancha ulgursa — qolganini admin "Xabar yuborish" bo'limidan
// jo'natishi mumkin. Nechtasi yuborilgani javobda halol ko'rsatiladi.
const NOTIFY_BUDGET_MS = 6000;
const NOTIFY_BATCH = 25;

const money = (v) => Number(v || 0).toLocaleString('uz-UZ');

function creditText(amount, reason, fallback) {
  return [
    `➕ <b>Balansingizga ${money(amount)} UZS qo‘shildi</b>`,
    '',
    reason ? `Sabab: ${reason}` : fallback,
  ].join('\n');
}

// Xabarni vaqt byudjeti tugaguncha guruhlab yuboradi; nechtasiga ketganini qaytaradi.
async function notifyWithinBudget(ids, text) {
  const deadline = Date.now() + NOTIFY_BUDGET_MS;
  let notified = 0;
  for (let i = 0; i < ids.length; i += NOTIFY_BATCH) {
    if (Date.now() > deadline) break;
    const chunk = ids.slice(i, i + NOTIFY_BATCH);
    const results = await Promise.allSettled(chunk.map((id) => sendMessage(id, text)));
    notified += results.filter((r) => r.status === 'fulfilled').length;
  }
  return notified;
}

class BadRequest extends Error {}

// Pul qo'shiladigan guruh: ommaviy xabar segmentlari (xarid qilganlar, balansi
// borlar, 30 kun faol bo'lmaganlar, til...) yoki admin qo'ygan teg. Hammasi
// faqat bloklanmagan foydalanuvchilar. "Hamma" uchun alohida credit-all bor.
async function resolveCreditGroup(db, body) {
  const segment = String(body.segment || '');
  if (segment === 'tag') {
    const tag = String(body.tag || '').trim().toLowerCase().slice(0, 30);
    if (!tag) throw new BadRequest('Teg kiriting');
    if (!/^[\p{L}\p{N} _.-]+$/u.test(tag)) throw new BadRequest('Teg noto‘g‘ri belgilarni o‘z ichiga oladi');
    const rows = await fetchAllRows(db, 'users', `select=telegram_id&is_blocked=eq.false&tags=cs.${encodeURIComponent(`{"${tag}"}`)}&order=telegram_id.asc`);
    return { ids: rows.map((r) => String(r.telegram_id)), label: `Teg: ${tag}` };
  }
  if (!SEGMENTS[segment] || segment === 'all') throw new BadRequest('Guruh noto‘g‘ri tanlangan');
  return { ids: await resolveSegment(db, segment), label: segmentLabel(segment) };
}

// Tanlangan guruhga summa qo'shish. `preview: true` — faqat nechta odam
// ekanini qaytaradi (admin tasdiqlashdan oldin ko'radi). Pul credit_users SQL
// funksiyasida bitta tranzaksiyada qo'shiladi; request_id takroriy bosishda
// pul ikki marta qo'shilishiga yo'l qo'ymaydi.
async function creditSegment(db, body) {
  let group;
  try {
    group = await resolveCreditGroup(db, body);
  } catch (error) {
    if (error instanceof BadRequest) return json(400, { ok: false, error: error.message });
    throw error;
  }
  if (body.preview) return json(200, { ok: true, count: group.ids.length, label: group.label });

  const amount = Math.round(Math.abs(Number(body.amount || 0)));
  if (!(amount > 0)) return json(400, { ok: false, error: 'Summa noldan katta bo‘lishi kerak' });
  if (!group.ids.length) return json(400, { ok: false, error: 'Bu guruhda foydalanuvchi yo‘q' });
  const requestId = String(body.request_id || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(requestId)) return json(400, { ok: false, error: 'request_id noto‘g‘ri' });
  const reason = String(body.reason || '').slice(0, 200);
  const description = `Guruhga qo‘shildi (${group.label})${reason ? ': ' + reason : ''}`;

  let credited = 0;
  try {
    const res = await rpcRequest(db, 'credit_users', {
      p_ids: group.ids, p_amount: amount, p_description: description, p_request_id: requestId, p_segment: group.label,
    });
    credited = Number(Array.isArray(res) ? res[0] : res) || 0;
  } catch (error) {
    const message = String(error?.message || '');
    if (/admin_bulk_credits_pkey|duplicate key/i.test(message)) {
      return json(409, { ok: false, error: 'Bu amal allaqachon bajarilgan — pul ikkinchi marta qo‘shilmadi.' });
    }
    console.error('credit_users RPC error', message);
    return json(500, { ok: false, error: 'Balanslarni to‘ldirib bo‘lmadi (migrations/2026-10-12_credit-users.sql qo‘llanganmi?)' });
  }

  const notified = await notifyWithinBudget(group.ids, creditText(amount, reason || null, 'Sizga sovg‘a!'));
  return json(200, {
    ok: true,
    credited,
    notified,
    total: group.ids.length,
    message: `${group.label}: ${credited} ta foydalanuvchi balansiga ${money(amount)} UZS qo‘shildi (jami ${money(amount * credited)} UZS). Xabar yuborildi: ${notified}/${group.ids.length}.`
      + (notified < group.ids.length ? ' Qolganlariga "Xabar yuborish → Broadcast" orqali xabar bering.' : ''),
  });
}

// Barcha bloklanmagan foydalanuvchilar balansiga summa qo'shish.
// Balans o'zgarishi bitta SQL funksiyada, bitta tranzaksiyada bajariladi —
// ~900 ta REST so'rovi ham, poyga holati ham yo'q.
async function creditAll(db, body) {
  const amount = Math.round(Math.abs(Number(body.amount || 0)));
  if (!(amount > 0)) return json(400, { ok: false, error: 'Summa noldan katta bo‘lishi kerak' });
  const reason = String(body.reason || '').slice(0, 200);
  const description = `Hammaga qo‘shildi${reason ? ': ' + reason : ''}`;

  let credited = 0;
  try {
    const res = await rpcRequest(db, 'credit_all_users', { p_amount: amount, p_description: description });
    credited = Number(Array.isArray(res) ? res[0] : res) || 0;
  } catch (error) {
    console.error('credit_all_users RPC error', error?.message);
    return json(500, {
      ok: false,
      error: 'Balanslarni to‘ldirib bo‘lmadi (migrations/2026-08-24_credit-all-users.sql qo‘llanganmi?)',
    });
  }

  // Xabarlar: vaqt byudjeti tugaguncha guruhlab yuboriladi.
  const { data: users } = await request(db, 'users', {
    query: 'select=telegram_id&is_blocked=eq.false&order=created_at.desc',
  }).catch(() => ({ data: [] }));
  const list = (users || []).map((u) => u.telegram_id);
  const notified = await notifyWithinBudget(list, creditText(amount, reason || null, 'Sovg‘a hammaga!'));

  return json(200, {
    ok: true,
    credited,
    notified,
    total: list.length,
    message: `${credited} ta foydalanuvchi balansiga ${money(amount)} UZS qo‘shildi. Xabar yuborildi: ${notified}/${list.length}.`
      + (notified < list.length ? ' Qolganlariga "Xabar yuborish → Broadcast" orqali xabar bering.' : ''),
  });
}

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const db = getAdminClient();
  try {
    // --- Bitta foydalanuvchi tafsilotlari: balans, xaridlar, balans tarixi ---
    if (event.httpMethod === 'GET' && event.queryStringParameters?.user_id) {
      const uid = String(event.queryStringParameters.user_id).replace(/\D/g, '');
      if (!uid) return json(400, { ok: false, error: 'user_id noto‘g‘ri' });
      const [userRes, walletRes, ordersRes, txRes, plansRes, paidRows] = await Promise.all([
        request(db, 'users', { query: `select=telegram_id,username,full_name,phone,phone_verified_at,is_blocked,language_code,created_at,updated_at,admin_note,tags&telegram_id=eq.${uid}&limit=1` })
          .catch(() => request(db, 'users', { query: `select=telegram_id,username,full_name,phone,phone_verified_at,is_blocked,language_code,created_at,updated_at&telegram_id=eq.${uid}&limit=1` }).catch(() => ({ data: [] }))),
        request(db, 'user_wallets', { query: `select=balance&user_telegram_id=eq.${uid}&limit=1` }).catch(() => ({ data: [] })),
        request(db, 'orders', { query: `select=order_number,created_at,unique_price,amount,status,order_type,promo_code,payment_method,plan_id&user_telegram_id=eq.${uid}&order=created_at.desc&limit=100` }).catch(() => ({ data: [] })),
        request(db, 'wallet_transactions', { query: `select=amount,type,description,created_at&user_telegram_id=eq.${uid}&order=created_at.desc&limit=100` }).catch(() => ({ data: [] })),
        request(db, 'plans', { query: 'select=id,name' }).catch(() => ({ data: [] })),
        fetchAllRows(db, 'orders', `select=order_type,status,base_price,amount,discount_amount&user_telegram_id=eq.${uid}&order=created_at.asc,id.asc`).catch(() => []),
      ]);
      const paidPurchases = paidRows.filter(isPaidPurchase);
      const totalSpent = paidPurchases.reduce((sum, o) => sum + orderSaleValue(o), 0);
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
      const user = userRes.data?.[0] || { telegram_id: uid };
      return json(200, { ok: true, user, balance, total_spent: totalSpent, paid_purchases: paidPurchases.length, purchases, balanceHistory });
    }

    // --- Foydalanuvchilar ro'yxati (balans + xaridlar soni + oxirgi faollik) ---
    if (event.httpMethod === 'GET') {
      // `limit=5000` yetarli emas edi: Supabase (PostgREST max-rows) baribir
      // eng ko'pi 1000 qator qaytaradi — 1000-dan keyingi (eski) foydalanuvchilar
      // panelda ko'rinmas, qidiruvda chiqmas, balans ham 1000-hamyondan keyin
      // 0 ko'rinardi. Endi har uch jadval sahifalab TO'LIQ olinadi.
      // Tartib o'sish bo'yicha: yuklash paytida qo'shilgan yangi qator oxiriga
      // tushadi va sahifalar surilib takror/tushib qolish bo'lmaydi.
      const cols = 'telegram_id,username,full_name,phone,phone_verified_at,language_code,is_blocked,created_at,updated_at,admin_note,tags';
      const usersOrder = 'order=created_at.asc,telegram_id.asc';
      const [userRows, walletRows, orderRows] = await Promise.all([
        fetchAllRows(db, 'users', `select=${cols}&${usersOrder}`)
          .catch(() => fetchAllRows(db, 'users', `select=telegram_id,username,full_name,phone,language_code,created_at&${usersOrder}`)),
        fetchAllRows(db, 'user_wallets', 'select=user_telegram_id,balance&order=user_telegram_id.asc').catch(() => []),
        fetchAllRows(db, 'orders', 'select=user_telegram_id,created_at,order_type,status,base_price,amount,discount_amount&order=created_at.asc,id.asc').catch(() => []),
      ]);
      const balanceMap = {};
      for (const w of walletRows) balanceMap[String(w.user_telegram_id)] = Number(w.balance || 0);
      // Xaridlar soni va "jami sarflagan" — faqat pul tushgan xaridlar (dashboard
      // tushumi bilan bir xil qoida). Ilgari muddati o'tgan/rad etilgan
      // buyurtmalar ham "xarid" sanalardi.
      const purchaseMap = {};
      const spentMap = {};
      const lastMap = {};
      for (const o of orderRows) {
        const id = String(o.user_telegram_id);
        if (isPaidPurchase(o)) {
          purchaseMap[id] = (purchaseMap[id] || 0) + 1;
          spentMap[id] = (spentMap[id] || 0) + orderSaleValue(o);
        }
        lastMap[id] = o.created_at; // o'sish tartibi — oxirgisi eng yangi
      }
      // Panel uchun eng yangilari tepada
      const users = userRows.reverse().map((u) => {
        const id = String(u.telegram_id);
        return {
          ...u,
          tags: Array.isArray(u.tags) ? u.tags : [],
          balance: balanceMap[id] || 0,
          purchases: purchaseMap[id] || 0,
          total_spent: spentMap[id] || 0,
          last_activity: lastMap[id] || u.updated_at || u.created_at,
        };
      });
      // Raqam bermaganlar "foydalanuvchi safida" emas — panel ularni sukut
      // bo'yicha yashiradi; sonlar alohida ko'rsatiladi.
      const withPhone = users.filter((u) => u.phone).length;
      return json(200, { ok: true, users, counts: { with_phone: withPhone, without_phone: users.length - withPhone } });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action, telegram_id } = body;

      // Hammaga birdan pul qo'shish — bitta foydalanuvchiga emas, shuning
      // uchun telegram_id tekshiruvidan OLDIN turadi.
      // Pul amallari — faqat egasi
      if (['credit-all', 'credit-segment', 'adjust-balance'].includes(action) && !requireOwner(event.headers)) return json(403, { ok: false, error: 'Faqat egasi uchun' });
      if (action === 'credit-all') return creditAll(db, body);
      if (action === 'credit-segment') return creditSegment(db, body);

      if (!telegram_id) return json(400, { ok: false, error: 'telegram_id talab qilinadi' });

      // Admin izohi va teglar (faqat panel ko'radi)
      if (action === 'update-note') {
        if (!telegram_id) return json(400, { ok: false, error: 'telegram_id talab qilinadi' });
        const adminNote = String(body.admin_note || '').trim().slice(0, 1000) || null;
        const tags = [...new Set(
          (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(','))
            .map((t) => String(t || '').trim().toLowerCase().slice(0, 30))
            .filter(Boolean),
        )].slice(0, 10);
        const { data } = await request(db, 'users', {
          method: 'PATCH',
          query: `telegram_id=eq.${encodeURIComponent(String(telegram_id))}`,
          headers: { Prefer: 'return=representation' },
          body: { admin_note: adminNote, tags, updated_at: new Date().toISOString() },
        });
        if (!data?.[0]) return json(404, { ok: false, error: 'Foydalanuvchi topilmadi' });
        return json(200, { ok: true, admin_note: adminNote, tags });
      }
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
