const { requireAdmin, requireOwner } = require('../../shared/auth');
const { getAdminClient, request, createInventoryItem, listInventoryByPlan, getInventoryCountsByPlan, getInventoryItemById, updateRow } = require('../../shared/db');
const { encryptText, decryptText } = require('../../shared/encryption');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Ko'p qatorli import: har qator bitta akkaunt yoki kalit.
//   auto_account: "login:parol", "login parol", "login;parol", "login | parol", "login<TAB>parol"
//   license_key:  qatorning o'zi kalit
// Bo'sh qatorlar o'tkazib yuboriladi; buzuq qatorlar xato ro'yxatiga tushadi.
function parseInventoryLines(text, type) {
  const items = [];
  const errors = [];
  String(text || '').split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    if (type === 'license_key') {
      items.push({ license_key: line });
      return;
    }
    const idx = line.search(/[:;|\t ]/);
    if (idx <= 0) {
      errors.push(`${index + 1}-qator: login va parol ajratilmagan`);
      return;
    }
    const login = line.slice(0, idx).trim();
    const password = line.slice(idx + 1).replace(/^[:;|\t ]+/, '').trim();
    if (!login || !password) {
      errors.push(`${index + 1}-qator: login yoki parol bo‘sh`);
      return;
    }
    items.push({ login, password });
  });
  return { items, errors };
}
exports._parseInventoryLines = parseInventoryLines;

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const supabase = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      const planId = event.queryStringParameters?.plan_id;
      if (!planId) return json(400, { ok: false, error: 'plan_id talab qilinadi' });
      const [items, counts] = await Promise.all([listInventoryByPlan(supabase, planId), getInventoryCountsByPlan(supabase, planId)]);
      return json(200, { ok: true, items, counts });
    }

    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      if (payload.action === 'bulk') {
        const type = payload.type === 'account' ? 'auto_account' : payload.type;
        if (!['auto_account', 'license_key'].includes(type)) return json(400, { ok: false, error: 'type noto‘g‘ri' });
        if (!payload.plan_id) return json(400, { ok: false, error: 'plan_id talab qilinadi' });
        const { items, errors } = parseInventoryLines(payload.lines, type);
        if (!items.length) return json(400, { ok: false, error: errors[0] || 'Qatorlar bo‘sh', errors });
        if (items.length > 500) return json(400, { ok: false, error: 'Bir martada 500 tagacha qator' });
        const notes = payload.notes ? String(payload.notes).slice(0, 500) : null;
        const rows = items.map((it) => ({
          plan_id: payload.plan_id,
          type,
          login: it.login || null,
          password_encrypted: it.password ? encryptText(it.password) : null,
          license_key_encrypted: it.license_key ? encryptText(it.license_key) : null,
          status: 'available',
          notes,
        }));
        // Bitta so'rovda (PostgREST massivni qabul qiladi)
        const { data } = await request(supabase, 'inventory_items', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: rows,
        });
        const inserted = Array.isArray(data) ? data.length : rows.length;
        // Zaxira kelganini kutayotganlarga xabar (waitlist) — best-effort
        try {
          const { notifyWaitlist } = require('../../shared/stock-waitlist');
          await notifyWaitlist(supabase, payload.plan_id);
        } catch {
          /* waitlist moduli yo'q yoki xato — import muvaffaqiyatli qoladi */
        }
        return json(200, { ok: true, inserted, skipped: errors.length, errors });
      }
      if (payload.action === 'disable') {
        const item = await updateRow(supabase, 'inventory_items', payload.id, { status: 'disabled' });
        return json(200, { ok: true, item });
      }
      // Batafsil: akkaunt kimga, qachon va qaysi buyurtma orqali ketgan.
      // Kredensiallar bu yerda QAYTARILMAYDI — ular faqat "reveal" orqali.
      if (payload.action === 'detail') {
        const item = await getInventoryItemById(supabase, payload.id);
        if (!item) return json(404, { ok: false, error: 'Topilmadi' });

        const [orderRes, userRes, planRes] = await Promise.all([
          item.assigned_order_id
            ? request(supabase, 'orders', {
              query: `select=order_number,status,amount,unique_price,created_at,delivered_at,promo_code,discount_amount&id=eq.${encodeURIComponent(item.assigned_order_id)}&limit=1`,
            }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          item.assigned_user_telegram_id
            ? request(supabase, 'users', {
              query: `select=telegram_id,username,full_name&telegram_id=eq.${encodeURIComponent(item.assigned_user_telegram_id)}&limit=1`,
            }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          item.plan_id
            ? request(supabase, 'plans', {
              query: `select=name&id=eq.${encodeURIComponent(item.plan_id)}&limit=1`,
            }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        ]);
        const order = orderRes.data?.[0] || null;
        const user = userRes.data?.[0] || null;

        return json(200, {
          ok: true,
          detail: {
            id: item.id,
            type: item.type,
            status: item.status,
            plan_name: planRes.data?.[0]?.name || null,
            login_masked: item.login ? `${String(item.login).slice(0, 2)}***` : null,
            notes: item.notes || null,
            created_at: item.created_at,
            reserved_at: item.reserved_at,
            delivered_at: item.delivered_at,
            sold_at: item.sold_at,
            user: item.assigned_user_telegram_id
              ? {
                telegram_id: item.assigned_user_telegram_id,
                username: user?.username || null,
                full_name: user?.full_name || null,
              }
              : null,
            order: order
              ? {
                order_number: order.order_number,
                status: order.status,
                amount: Number(order.unique_price ?? order.amount ?? 0),
                promo_code: order.promo_code || null,
                discount_amount: Number(order.discount_amount || 0),
                created_at: order.created_at,
                delivered_at: order.delivered_at,
              }
              : null,
          },
        });
      }

      // Ichidagini ko'rish: ro'yxatda login/parol maskalanadi, admin so'raganda
      // shu action haqiqiy qiymatlarni qaytaradi (sessiya cookie bilan himoyalangan).
      // Bitta maydon ochilmasa qolganlari baribir ko'rsatiladi (delivery-service
      // dagi tryDecrypt bilan bir xil yondashuv).
      if (payload.action === 'reveal' && !requireOwner(event.headers)) return json(403, { ok: false, error: 'Kredensiallarni faqat egasi ochadi' });
      if (payload.action === 'reveal') {
        const item = await getInventoryItemById(supabase, payload.id);
        if (!item) return json(404, { ok: false, error: 'Topilmadi' });
        const safeDecrypt = (value) => {
          if (!value) return null;
          try {
            return decryptText(value);
          } catch {
            return '(ochib bo‘lmadi — encryption key mos emas)';
          }
        };
        return json(200, {
          ok: true,
          item: {
            id: item.id,
            login: item.login || null,
            password: safeDecrypt(item.password_encrypted),
            license_key: safeDecrypt(item.license_key_encrypted),
            extra_data: safeDecrypt(item.extra_data_encrypted),
            notes: item.notes || null,
          },
        });
      }
      const type = payload.type === 'account' ? 'auto_account' : payload.type;
      if (!['auto_account', 'license_key'].includes(type)) return json(400, { ok: false, error: 'type noto‘g‘ri' });
      if (!payload.plan_id) return json(400, { ok: false, error: 'plan_id talab qilinadi' });
      if (type === 'auto_account' && (!payload.login || !payload.password)) return json(400, { ok: false, error: 'account uchun login va parol talab qilinadi' });
      if (type === 'license_key' && !payload.license_key) return json(400, { ok: false, error: 'license_key talab qilinadi' });
      const row = await createInventoryItem(supabase, {
        plan_id: payload.plan_id,
        type,
        title: payload.title || null,
        login: payload.login || null,
        password_encrypted: payload.password ? encryptText(payload.password) : null,
        license_key_encrypted: payload.license_key ? encryptText(payload.license_key) : null,
        extra_data_encrypted: payload.extra_data ? encryptText(payload.extra_data) : null,
        notes: payload.notes || null,
        status: 'available',
      });
      // Zaxira kelganini kutayotganlarga xabar (waitlist) — best-effort
      try {
        const { notifyWaitlist } = require('../../shared/stock-waitlist');
        await notifyWaitlist(supabase, payload.plan_id);
      } catch {
        /* xabar ketmasa ham akkaunt qo'shilgan */
      }
      return json(200, { ok: true, item: row ? { ...row, password_encrypted: row.password_encrypted ? '***' : null, license_key_encrypted: row.license_key_encrypted ? '***' : null } : null });
    }
    return json(405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('admin-inventory error', error);
    return json(500, { ok: false, error: 'Server xatosi yoki encryption key sozlanmagan' });
  }
};
