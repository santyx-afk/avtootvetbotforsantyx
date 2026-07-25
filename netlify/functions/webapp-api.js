const { getAdminClient, request, upsertUser } = require('../../shared/db');
const { validateInitData } = require('../../shared/webapp-auth');

// Mini App (React) uchun asosiy API.
// Har bir so'rov Telegram initData (X-Telegram-Init-Data header) bilan tasdiqlanadi.

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// Telefon raqamni tozalaydi va oddiy tekshiruvdan o'tkazadi.
function sanitizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return `+${digits}`;
}

function extractPhoneFromRaw(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return (
    raw?.responseUnsafe?.contact?.contact?.phone_number ||
    raw?.response?.contact?.phone_number ||
    raw?.contact?.phone_number ||
    null
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  const initData =
    event.headers['x-telegram-init-data'] ||
    event.headers['X-Telegram-Init-Data'] ||
    body.initData ||
    '';

  const auth = validateInitData(initData);
  if (!auth.ok) return json(401, { ok: false, error: 'unauthorized', reason: auth.reason });

  const supabase = getAdminClient();
  const tgUser = auth.user;
  const telegramId = String(tgUser.id);

  try {
    // Foydalanuvchini har doim ro'yxatga olamiz/yangilaymiz (phone ga tegmaydi)
    await upsertUser(supabase, tgUser).catch((e) => console.warn('upsertUser warn:', e?.message));

    if (body.action === 'init') {
      let hasPhone = false;
      try {
        const { data } = await request(supabase, 'users', {
          query: `select=phone&telegram_id=eq.${telegramId}&limit=1`,
        });
        hasPhone = Boolean(data?.[0]?.phone);
      } catch (e) {
        // phone ustuni hali yo'q bo'lsa (migratsiya qo'llanmagan) — bloklamaymiz
        console.warn('phone column read warn:', e?.message);
      }
      return json(200, {
        ok: true,
        hasPhone,
        user: {
          id: telegramId,
          first_name: tgUser.first_name || null,
          last_name: tgUser.last_name || null,
          username: tgUser.username || null,
          language_code: tgUser.language_code || null,
        },
      });
    }

    if (body.action === 'save-contact') {
      const raw = body.phone || extractPhoneFromRaw(body.raw);
      const phone = sanitizePhone(raw);
      let saved = false;
      if (phone) {
        try {
          await request(supabase, 'users', {
            method: 'PATCH',
            query: `telegram_id=eq.${telegramId}`,
            body: { phone, updated_at: new Date().toISOString() },
          });
          saved = true;
        } catch (e) {
          console.warn('save phone warn:', e?.message);
        }
      }
      // Telefon topilmasa ham xato bermaymiz: requestContact kontaktni botga ham
      // yuboradi va webhook uni ushlab qoladi.
      return json(200, { ok: true, saved });
    }

    return json(400, { ok: false, error: 'unknown_action' });
  } catch (error) {
    console.error('webapp-api error', error);
    return json(500, { ok: false, error: 'server_error' });
  }
};
