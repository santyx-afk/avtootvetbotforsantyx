const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, request, createInventoryItem, listInventoryByPlan, getInventoryCountsByPlan, getInventoryItemById, updateRow } = require('../../shared/db');
const { encryptText, decryptText } = require('../../shared/encryption');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

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
      return json(200, { ok: true, item: row ? { ...row, password_encrypted: row.password_encrypted ? '***' : null, license_key_encrypted: row.license_key_encrypted ? '***' : null } : null });
    }
    return json(405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('admin-inventory error', error);
    return json(500, { ok: false, error: 'Server xatosi yoki encryption key sozlanmagan' });
  }
};
