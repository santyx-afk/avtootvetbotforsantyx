const { createSession, verifyPassword, verifyPasswordHash } = require('../../shared/auth');
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

// Operator: admins jadvalidan login + scrypt parol. Faol bo'lmasa — yo'q.
async function findOperator(supabase, username) {
  const name = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_.-]{2,40}$/.test(name)) return null;
  try {
    const { data } = await request(supabase, 'admins', {
      query: `select=id,username,role,password_hash,is_active&username=ilike.${encodeURIComponent(name)}&limit=1`,
    });
    const row = data?.[0];
    return row && row.is_active !== false && row.password_hash ? row : null;
  } catch {
    return null;
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

  // 2. Parolni tekshirish: login bo'sh — egasi (ADMIN_PASSWORD), login bor — operator (admins jadvali)
  let password = '';
  let username = '';
  try { ({ password = '', username = '' } = JSON.parse(event.body || '{}')); } catch { /* bo'sh */ }

  let session = null; // { role, username }
  if (String(username || '').trim()) {
    const operator = await findOperator(supabase, username);
    if (operator && verifyPasswordHash(password, operator.password_hash)) {
      session = { role: operator.role === 'owner' ? 'owner' : 'operator', username: operator.username };
      await request(supabase, 'admins', { method: 'PATCH', query: `id=eq.${operator.id}`, body: { last_login_at: new Date().toISOString() } }).catch(() => {});
    }
  } else if (verifyPassword(password)) {
    session = { role: 'owner', username: 'owner' };
  }

  if (!session) {
    const attempts = Number(attempt?.attempts || 0) + 1;
    const blockedUntil = attempts >= MAX_ATTEMPTS ? new Date(now + BLOCK_MINUTES * 60000).toISOString() : null;
    await saveAttempt(supabase, ip, { attempts, blocked_until: blockedUntil });
    if (blockedUntil) {
      return json(429, { ok: false, error: `Juda ko'p noto'g'ri urinish. ${BLOCK_MINUTES} daqiqaga bloklandingiz.`, retry_after: BLOCK_MINUTES * 60 }, { 'Retry-After': String(BLOCK_MINUTES * 60) });
    }
    return json(401, { ok: false, error: username ? 'Login yoki parol noto‘g‘ri' : 'Noto‘g‘ri parol', attempts_left: MAX_ATTEMPTS - attempts });
  }

  // 3. Muvaffaqiyat — hisoblagichni reset qilamiz
  await saveAttempt(supabase, ip, { attempts: 0, blocked_until: null });

  // SESSION_SECRET o'rnatilmagan bo'lsa createSession xato tashlaydi —
  // login muvaffaqiyatsiz bo'ladi (ilgari ochiq 'dev-secret' bilan ishlab ketardi).
  let token;
  try {
    token = createSession(session);
  } catch (error) {
    console.error('admin sessiya yaratilmadi:', error.message);
    return json(500, { ok: false, error: 'Server sozlanmagan — administratorga murojaat qiling.' });
  }
  return json(200, { ok: true, role: session.role, username: session.username }, { 'Set-Cookie': `admin_session=${token}; Path=/; HttpOnly; SameSite=Strict; Secure` });
};
