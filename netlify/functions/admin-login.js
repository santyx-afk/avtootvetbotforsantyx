const { createSession, verifyPassword } = require('../../shared/auth');
const { getAdminClient, request } = require('../../shared/db');

const MAX_ATTEMPTS = 5;
const BLOCK_MINUTES = 10;

// Netlify so'rovdan mijoz IP sini oladi.
function clientIp(event) {
  const h = event.headers || {};
  return (
    h['x-nf-client-connection-ip'] ||
    (h['x-forwarded-for'] || '').split(',')[0].trim() ||
    h['client-ip'] ||
    'unknown'
  );
}

function json(statusCode, body, extraHeaders = {}) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) };
}

async function getAttempt(supabase, ip) {
  try {
    const { data } = await request(supabase, 'admin_login_attempts', {
      query: `select=*&ip=eq.${encodeURIComponent(ip)}&limit=1`,
    });
    return data?.[0] || null;
  } catch {
    // Jadval hali yaratilmagan bo'lsa — rate limiting o'chiq, lekin parol tekshiruvi ishlaydi.
    return null;
  }
}

async function saveAttempt(supabase, ip, patch) {
  try {
    await request(supabase, 'admin_login_attempts', {
      method: 'POST',
      query: 'on_conflict=ip',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: { ip, last_attempt: new Date().toISOString(), ...patch },
    });
  } catch {
    /* jadval yo'q — e'tiborsiz */
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const supabase = getAdminClient();
  const ip = clientIp(event);
  const now = Date.now();

  // 1. IP bloklangan bo'lsa — darrov 429
  const attempt = await getAttempt(supabase, ip);
  if (attempt?.blocked_until && new Date(attempt.blocked_until).getTime() > now) {
    const retryAfter = Math.ceil((new Date(attempt.blocked_until).getTime() - now) / 1000);
    const mins = Math.ceil(retryAfter / 60);
    return json(429, { ok: false, error: `Juda ko'p urinish. ${mins} daqiqadan keyin qayta urinib ko'ring.`, retry_after: retryAfter }, { 'Retry-After': String(retryAfter) });
  }

  // 2. Parolni tekshirish
  let password = '';
  try { ({ password } = JSON.parse(event.body || '{}')); } catch { /* bo'sh */ }

  if (!verifyPassword(password)) {
    const attempts = Number(attempt?.attempts || 0) + 1;
    const blockedUntil = attempts >= MAX_ATTEMPTS ? new Date(now + BLOCK_MINUTES * 60000).toISOString() : null;
    await saveAttempt(supabase, ip, { attempts, blocked_until: blockedUntil });
    if (blockedUntil) {
      return json(429, { ok: false, error: `Juda ko'p noto'g'ri urinish. ${BLOCK_MINUTES} daqiqaga bloklandingiz.`, retry_after: BLOCK_MINUTES * 60 }, { 'Retry-After': String(BLOCK_MINUTES * 60) });
    }
    return json(401, { ok: false, error: 'Noto‘g‘ri parol', attempts_left: MAX_ATTEMPTS - attempts });
  }

  // 3. Muvaffaqiyat — hisoblagichni reset qilamiz
  await saveAttempt(supabase, ip, { attempts: 0, blocked_until: null });

  const session = createSession();
  return json(200, { ok: true }, { 'Set-Cookie': `admin_session=${session}; Path=/; HttpOnly; SameSite=Strict; Secure` });
};
