const { getAdminClient, request, isAdminTelegramId } = require('../../shared/db');
const { authenticate } = require('../../shared/webapp-auth');
const { sendMessage } = require('../../shared/telegram');

// Vakansiyalar moduli uchun API — bepul e'lonlar doskasi.
// Ishchi telefon raqami bilan ro'yxatdan o'tadi, admin tasdiqlaydi, so'ng e'lon
// joylaydi. Mijoz e'lonni ko'rib, ishchi bilan to'g'ridan-to'g'ri bog'lanadi.
// To'lov, order va chat tizimi yo'q — xizmat butunlay bepul.
//
// Obuna do'koni API'sidan (webapp-api) mustaqil — alohida funksiya, alohida jadvallar.
// Har bir so'rov: POST { action, ...payload }, auth = Telegram initData yoki JWT.

// Tasdiqlash kodi yuboriladigan raqam — ishchi shu raqamga kodni o'zi jo'natadi.
const VERIFY_PHONE = process.env.VACANCY_VERIFY_PHONE || '+998 88 540 07 25';

const CATEGORIES = ['montaj', 'dizayn'];
const EXPERIENCE_LEVELS = { '<1': 0, '1-2': 1, '2-5': 2, '5+': 5 };

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function sanitizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return null;
  return `+${digits}`;
}

function sanitizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (!/^https?:\/\/[^\s]+$/i.test(value)) return null;
  return value.slice(0, 300);
}

function trimText(raw, max) {
  return String(raw || '').trim().slice(0, max);
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function adminChatIds() {
  return [
    ...new Set(
      [process.env.ADMIN_CHAT_ID, process.env.ADMIN_TELEGRAM_ID, ...(process.env.ADMIN_TELEGRAM_IDS || '').split(',')]
        .map((x) => String(x || '').trim())
        .filter(Boolean),
    ),
  ];
}

function workerShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    phone: row.phone,
    bio: row.bio || '',
    categories: row.categories || [],
    portfolio_urls: row.portfolio_urls || [],
    show_phone: Boolean(row.show_phone),
    work_schedule: row.work_schedule || {},
    is_busy: Boolean(row.is_busy),
    is_approved: Boolean(row.is_approved),
    is_banned: Boolean(row.is_banned),
    ban_reason: row.ban_reason || null,
    banned_until: row.banned_until || null,
    experience_years: Number(row.experience_years || 0),
    rules_accepted: Boolean(row.rules_accepted),
    created_at: row.created_at,
    // Reyting/daromad/order ko'rsatkichlari qaytarilmaydi: xizmat bepul,
    // order va baho tizimi yo'q — ular doimo 0 bo'lib qolardi.
  };
}

async function getWorkerByUser(supabase, telegramId) {
  const { data } = await request(supabase, 'workers', {
    query: `select=*&user_id=eq.${encodeURIComponent(telegramId)}&limit=1`,
  });
  return data?.[0] || null;
}

// Ariza holati: ro'yxatdan o'tmagan / kod kutilmoqda / ko'rib chiqilmoqda / tasdiqlangan / rad etilgan
async function handleWorkerStatus(supabase, telegramId) {
  const worker = await getWorkerByUser(supabase, telegramId);
  if (!worker) return json(200, { ok: true, state: 'none', worker: null });

  if (worker.is_banned) {
    return json(200, { ok: true, state: 'banned', worker: workerShape(worker) });
  }
  if (worker.is_approved) {
    return json(200, { ok: true, state: 'approved', worker: workerShape(worker) });
  }

  const { data: verif } = await request(supabase, 'worker_verification', {
    query: `select=*&user_id=eq.${encodeURIComponent(telegramId)}&order=created_at.desc&limit=1`,
  });
  const last = verif?.[0] || null;
  if (last?.status === 'rejected') {
    return json(200, { ok: true, state: 'rejected', reason: worker.ban_reason || null, worker: workerShape(worker) });
  }
  return json(200, {
    ok: true,
    state: 'pending',
    worker: workerShape(worker),
    verification: last ? { code: last.code, phone: VERIFY_PHONE, expires_at: last.expires_at } : null,
  });
}

// Ishchi arizasi: workers qatorini (tasdiqlanmagan) va 6 xonali kodni yaratadi.
async function handleWorkerRegister(supabase, telegramId, body) {
  const existing = await getWorkerByUser(supabase, telegramId);
  if (existing?.is_approved) return json(400, { ok: false, error: 'already_approved' });
  if (existing?.is_banned) return json(403, { ok: false, error: 'banned' });

  const phone = sanitizePhone(body.phone);
  if (!phone) return json(400, { ok: false, error: 'invalid_phone' });

  const name = trimText(body.name, 80);
  if (name.length < 2) return json(400, { ok: false, error: 'invalid_name' });

  const categories = (Array.isArray(body.categories) ? body.categories : []).filter((c) => CATEGORIES.includes(c));
  if (!categories.length) return json(400, { ok: false, error: 'invalid_categories' });

  const experience = EXPERIENCE_LEVELS[body.experience];
  if (experience === undefined) return json(400, { ok: false, error: 'invalid_experience' });

  const portfolio = (Array.isArray(body.portfolio_urls) ? body.portfolio_urls : [])
    .map(sanitizeUrl)
    .filter(Boolean)
    .slice(0, 2);
  if (!portfolio.length) return json(400, { ok: false, error: 'invalid_portfolio' });

  const bio = trimText(body.bio, 1000);

  const payload = {
    user_id: telegramId,
    phone,
    name,
    bio,
    categories,
    portfolio_urls: portfolio,
    experience_years: experience,
    is_approved: false,
    updated_at: new Date().toISOString(),
  };

  let worker;
  if (existing) {
    const { data } = await request(supabase, 'workers', {
      method: 'PATCH',
      query: `id=eq.${existing.id}`,
      body: payload,
      headers: { Prefer: 'return=representation' },
    });
    worker = data?.[0];
  } else {
    const { data } = await request(supabase, 'workers', {
      method: 'POST',
      body: payload,
      headers: { Prefer: 'return=representation' },
    });
    worker = data?.[0];
  }

  // Eski kutilayotgan kodlarni bekor qilamiz, yangisini yaratamiz.
  await request(supabase, 'worker_verification', {
    method: 'PATCH',
    query: `user_id=eq.${encodeURIComponent(telegramId)}&status=eq.pending`,
    body: { status: 'rejected' },
  }).catch(() => null);

  const code = randomCode();
  await request(supabase, 'worker_verification', {
    method: 'POST',
    body: { phone, code, user_id: telegramId, status: 'pending' },
  });

  const adminText =
    `<b>Yangi ishchi arizasi</b>\n\n` +
    `${name}\n${phone}\nKod: <code>${code}</code>\n` +
    `${categories.join(', ')}\nTajriba: ${body.experience}\n` +
    `${portfolio.join('\n')}\n\n` +
    `${bio ? `${bio}\n\n` : ''}Admin panel → Ishchilar → Kutilmoqda`;
  for (const chatId of adminChatIds()) {
    await sendMessage(chatId, adminText).catch((e) => console.warn('admin notify warn:', e?.message));
  }

  return json(200, {
    ok: true,
    state: 'pending',
    worker: workerShape(worker),
    verification: { code, phone: VERIFY_PHONE },
  });
}

// Qoidalar modali qabul qilindi.
async function handleAcceptRules(supabase, telegramId) {
  const worker = await getWorkerByUser(supabase, telegramId);
  if (!worker) return json(404, { ok: false, error: 'not_worker' });
  await request(supabase, 'workers', {
    method: 'PATCH',
    query: `id=eq.${worker.id}`,
    body: { rules_accepted: true, updated_at: new Date().toISOString() },
  });
  return json(200, { ok: true });
}

/* ---------------- Ishchi profili ---------------- */

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Ish vaqti: {"mon": {"from":"09:00","to":"18:00"}, ...}
// Kun ko'rsatilmasa yoki vaqt noto'g'ri bo'lsa — o'sha kun dam olish deb qabul qilinadi.
// "HH:MM" formatida leksikografik solishtirish vaqt bo'yicha solishtirish bilan bir xil.
function sanitizeSchedule(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const day of DAY_KEYS) {
    const entry = raw[day];
    if (!entry || typeof entry !== 'object') continue;
    const from = String(entry.from || '').trim();
    const to = String(entry.to || '').trim();
    if (!TIME_RE.test(from) || !TIME_RE.test(to) || from >= to) continue;
    out[day] = { from, to };
  }
  return out;
}

// Profilni tahrirlash. Faqat yuborilgan maydonlar yangilanadi (qisman yangilash).
// Ism, telefon, kategoriya va tajriba o'zgartirilmaydi — ular admin tasdig'iga bog'liq.
async function handleWorkerProfileUpdate(supabase, telegramId, body) {
  const { worker, error } = await requireWorker(supabase, telegramId);
  if (error) return error;

  const patch = { updated_at: new Date().toISOString() };

  if (body.bio !== undefined) {
    patch.bio = trimText(body.bio, 1000);
  }

  if (body.portfolio_urls !== undefined) {
    const urls = (Array.isArray(body.portfolio_urls) ? body.portfolio_urls : [])
      .map(sanitizeUrl)
      .filter(Boolean)
      .slice(0, 2);
    if (!urls.length) return json(400, { ok: false, error: 'invalid_portfolio' });
    patch.portfolio_urls = urls;
  }

  if (body.show_phone !== undefined) {
    patch.show_phone = Boolean(body.show_phone);
  }

  if (body.work_schedule !== undefined) {
    patch.work_schedule = sanitizeSchedule(body.work_schedule);
  }

  const { data } = await request(supabase, 'workers', {
    method: 'PATCH',
    query: `id=eq.${worker.id}`,
    body: patch,
    headers: { Prefer: 'return=representation' },
  });
  return json(200, { ok: true, worker: workerShape(data[0]) });
}

// "Hozir band" tugmasi — yoqilganda e'lonlarda band ko'rinadi va yangi chat ochilmaydi.
async function handleWorkerBusy(supabase, telegramId, body) {
  const { worker, error } = await requireWorker(supabase, telegramId);
  if (error) return error;

  const { data } = await request(supabase, 'workers', {
    method: 'PATCH',
    query: `id=eq.${worker.id}`,
    body: { is_busy: Boolean(body.is_busy), updated_at: new Date().toISOString() },
    headers: { Prefer: 'return=representation' },
  });
  return json(200, { ok: true, worker: workerShape(data[0]) });
}

/* ---------------- E'lonlar ---------------- */

const MAX_ACTIVE_LISTINGS = 3;

function listingShape(row) {
  return {
    id: row.id,
    worker_id: row.worker_id,
    title: row.title,
    description: row.description,
    category: row.category,
    min_price: Number(row.min_price || 0),
    is_published: Boolean(row.is_published),
    is_hidden: Boolean(row.is_hidden),
    created_at: row.created_at,
  };
}

function catalogShape(row) {
  const worker = row.workers || {};
  return {
    ...listingShape(row),
    worker: {
      id: worker.id,
      user_id: worker.user_id,
      name: worker.name,
      is_busy: Boolean(worker.is_busy),
      categories: worker.categories || [],
      experience_years: Number(worker.experience_years || 0),
    },
  };
}

// Ishchining faol e'lonlari sonini hisoblaydi (limit tekshiruvi uchun).
async function countActiveListings(supabase, workerId) {
  const { data } = await request(supabase, 'listings', {
    query: `select=id&worker_id=eq.${workerId}&is_published=eq.true&is_hidden=eq.false`,
  });
  return (data || []).length;
}

async function requireWorker(supabase, telegramId) {
  const worker = await getWorkerByUser(supabase, telegramId);
  if (!worker) return { error: json(403, { ok: false, error: 'not_worker' }) };
  if (worker.is_banned) return { error: json(403, { ok: false, error: 'banned' }) };
  return { worker };
}

async function handleMyListings(supabase, telegramId) {
  const { worker, error } = await requireWorker(supabase, telegramId);
  if (error) return error;
  const { data } = await request(supabase, 'listings', {
    query: `select=*&worker_id=eq.${worker.id}&order=created_at.desc`,
  });
  return json(200, {
    ok: true,
    listings: (data || []).map(listingShape),
    is_approved: Boolean(worker.is_approved),
    categories: worker.categories || [],
  });
}

async function handleListingCreate(supabase, telegramId, body) {
  const { worker, error } = await requireWorker(supabase, telegramId);
  if (error) return error;

  const title = trimText(body.title, 120);
  const description = trimText(body.description, 2000);
  const category = CATEGORIES.includes(body.category) ? body.category : null;
  const minPrice = Math.round(Number(body.min_price || 0));
  // Tasdiqlanmagan ishchi faqat chernovik saqlay oladi.
  const publish = Boolean(body.publish) && worker.is_approved;

  if (title.length < 3) return json(400, { ok: false, error: 'invalid_title' });
  if (description.length < 10) return json(400, { ok: false, error: 'invalid_description' });
  if (!category || !(worker.categories || []).includes(category)) return json(400, { ok: false, error: 'invalid_category' });
  if (!Number.isFinite(minPrice) || minPrice <= 0) return json(400, { ok: false, error: 'invalid_price' });

  if (publish && (await countActiveListings(supabase, worker.id)) >= MAX_ACTIVE_LISTINGS) {
    return json(400, { ok: false, error: 'listing_limit' });
  }

  const { data } = await request(supabase, 'listings', {
    method: 'POST',
    body: { worker_id: worker.id, title, description, category, min_price: minPrice, is_published: publish },
    headers: { Prefer: 'return=representation' },
  });
  return json(200, { ok: true, listing: listingShape(data[0]) });
}

async function getOwnListing(supabase, workerId, listingId) {
  const { data } = await request(supabase, 'listings', {
    query: `select=*&id=eq.${Number(listingId)}&worker_id=eq.${workerId}&limit=1`,
  });
  return data?.[0] || null;
}

async function handleListingUpdate(supabase, telegramId, body) {
  const { worker, error } = await requireWorker(supabase, telegramId);
  if (error) return error;
  const listing = await getOwnListing(supabase, worker.id, body.listing_id);
  if (!listing) return json(404, { ok: false, error: 'not_found' });

  const patch = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) {
    const title = trimText(body.title, 120);
    if (title.length < 3) return json(400, { ok: false, error: 'invalid_title' });
    patch.title = title;
  }
  if (body.description !== undefined) {
    const description = trimText(body.description, 2000);
    if (description.length < 10) return json(400, { ok: false, error: 'invalid_description' });
    patch.description = description;
  }
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category) || !(worker.categories || []).includes(body.category)) {
      return json(400, { ok: false, error: 'invalid_category' });
    }
    patch.category = body.category;
  }
  if (body.min_price !== undefined) {
    const minPrice = Math.round(Number(body.min_price));
    if (!Number.isFinite(minPrice) || minPrice <= 0) return json(400, { ok: false, error: 'invalid_price' });
    patch.min_price = minPrice;
  }
  if (body.publish !== undefined) {
    if (body.publish && !worker.is_approved) return json(403, { ok: false, error: 'not_approved' });
    if (body.publish && !listing.is_published && (await countActiveListings(supabase, worker.id)) >= MAX_ACTIVE_LISTINGS) {
      return json(400, { ok: false, error: 'listing_limit' });
    }
    patch.is_published = Boolean(body.publish);
  }
  if (body.hidden !== undefined) {
    if (!body.hidden && listing.is_hidden && listing.is_published) {
      if ((await countActiveListings(supabase, worker.id)) >= MAX_ACTIVE_LISTINGS) {
        return json(400, { ok: false, error: 'listing_limit' });
      }
    }
    patch.is_hidden = Boolean(body.hidden);
  }

  const { data } = await request(supabase, 'listings', {
    method: 'PATCH',
    query: `id=eq.${listing.id}`,
    body: patch,
    headers: { Prefer: 'return=representation' },
  });
  return json(200, { ok: true, listing: listingShape(data[0]) });
}

async function handleListingDelete(supabase, telegramId, body) {
  const { worker, error } = await requireWorker(supabase, telegramId);
  if (error) return error;
  const listing = await getOwnListing(supabase, worker.id, body.listing_id);
  if (!listing) return json(404, { ok: false, error: 'not_found' });
  await request(supabase, 'listings', { method: 'DELETE', query: `id=eq.${listing.id}` });
  return json(200, { ok: true });
}

// Katalog — faqat tasdiqlangan, banlanmagan ishchilarning faol e'lonlari.
async function handleCatalog(supabase, body) {
  const params = ['select=*,workers!inner(*)', 'is_published=eq.true', 'is_hidden=eq.false',
    'workers.is_approved=eq.true', 'workers.is_banned=eq.false'];

  if (CATEGORIES.includes(body.category)) params.push(`category=eq.${body.category}`);
  // PostgREST filtr sintaksisiga ta'sir qiladigan belgilarni olib tashlaymiz.
  const search = trimText(body.search, 60).replace(/[,()*."\\]/g, ' ').trim();
  if (search) params.push(`title=ilike.*${encodeURIComponent(search)}*`);

  // "Online" — saralash emas, mustaqil filtr: band bo'lmagan ishchilarni qoldiradi.
  // Ilgari u sortMap ichida edi, shuning uchun saralash bilan birga ishlatib
  // bo'lmasdi (birini tanlash ikkinchisini bekor qilardi).
  if (body.only_online) params.push('workers.is_busy=eq.false');

  // Reyting bo'yicha saralash yo'q — baho tizimi olib tashlangan.
  const sortMap = {
    price_asc: 'min_price.asc',
    price_desc: 'min_price.desc',
    newest: 'created_at.desc',
  };
  params.push(`order=${sortMap[body.sort] || 'created_at.desc'}`);
  params.push('limit=60');

  const { data } = await request(supabase, 'listings', { query: params.join('&') });
  return json(200, { ok: true, listings: (data || []).map(catalogShape) });
}

// Ishchining ochiq profili — e'lonlari va sharhlari bilan.
async function handleWorkerPublic(supabase, body) {
  const workerId = Number(body.worker_id);
  if (!workerId) return json(400, { ok: false, error: 'invalid_worker' });

  const { data } = await request(supabase, 'workers', {
    query: `select=*&id=eq.${workerId}&is_approved=eq.true&is_banned=eq.false&limit=1`,
  });
  const worker = data?.[0];
  if (!worker) return json(404, { ok: false, error: 'not_found' });

  const { data: listings } = await request(supabase, 'listings', {
    query: `select=*&worker_id=eq.${workerId}&is_published=eq.true&is_hidden=eq.false&order=created_at.desc`,
  }).catch(() => ({ data: [] }));

  const shaped = workerShape(worker);
  // Telefon faqat ishchi ruxsat bergan bo'lsa ko'rsatiladi — mijoz shu orqali
  // bog'lanadi (chat tizimi yo'q).
  if (!shaped.show_phone) shaped.phone = null;

  return json(200, {
    ok: true,
    worker: shaped,
    listings: (listings || []).map(listingShape),
  });
}

/* ---------------- Admin ---------------- */

async function handleAdminWorkers(supabase, body) {
  const tab = body.tab === 'approved' || body.tab === 'banned' ? body.tab : 'pending';
  const filter =
    tab === 'approved'
      ? 'is_approved=eq.true&is_banned=eq.false'
      : tab === 'banned'
        ? 'is_banned=eq.true'
        : 'is_approved=eq.false&is_banned=eq.false';
  const { data } = await request(supabase, 'workers', {
    query: `select=*&${filter}&order=created_at.desc&limit=100`,
  });
  return json(200, { ok: true, workers: (data || []).map(workerShape) });
}

async function updateWorker(supabase, id, patch) {
  const { data } = await request(supabase, 'workers', {
    method: 'PATCH',
    query: `id=eq.${Number(id)}`,
    body: { ...patch, updated_at: new Date().toISOString() },
    headers: { Prefer: 'return=representation' },
  });
  return data?.[0] || null;
}

async function handleAdminApprove(supabase, body) {
  const worker = await updateWorker(supabase, body.worker_id, { is_approved: true, ban_reason: null });
  if (!worker) return json(404, { ok: false, error: 'not_found' });
  await request(supabase, 'worker_verification', {
    method: 'PATCH',
    query: `user_id=eq.${encodeURIComponent(worker.user_id)}&status=eq.pending`,
    body: { status: 'approved' },
  }).catch(() => null);
  await sendMessage(
    worker.user_id,
    '<b>Tabriklaymiz!</b>\n\nSiz montajor/dizayner sifatida tasdiqlandingiz. Endi e\'lon joylashingiz mumkin.',
  ).catch((e) => console.warn('worker notify warn:', e?.message));
  return json(200, { ok: true, worker: workerShape(worker) });
}

async function handleAdminReject(supabase, body) {
  const reason = trimText(body.reason, 300) || 'Ariza talablarga javob bermadi';
  const worker = await updateWorker(supabase, body.worker_id, { is_approved: false, ban_reason: reason });
  if (!worker) return json(404, { ok: false, error: 'not_found' });
  await request(supabase, 'worker_verification', {
    method: 'PATCH',
    query: `user_id=eq.${encodeURIComponent(worker.user_id)}&status=eq.pending`,
    body: { status: 'rejected' },
  }).catch(() => null);
  await sendMessage(worker.user_id, `<b>Arizangiz rad etildi</b>\n\nSabab: ${reason}`).catch((e) =>
    console.warn('worker notify warn:', e?.message),
  );
  return json(200, { ok: true, worker: workerShape(worker) });
}

async function handleAdminBan(supabase, body) {
  const reason = trimText(body.reason, 300) || 'Qoidalar buzilishi';
  const worker = await updateWorker(supabase, body.worker_id, {
    is_banned: true,
    ban_reason: reason,
    banned_until: body.until || null,
  });
  if (!worker) return json(404, { ok: false, error: 'not_found' });
  await sendMessage(worker.user_id, `<b>Hisobingiz to'xtatildi</b>\n\nSabab: ${reason}`).catch(() => null);
  return json(200, { ok: true, worker: workerShape(worker) });
}

async function handleAdminUnban(supabase, body) {
  const worker = await updateWorker(supabase, body.worker_id, {
    is_banned: false,
    ban_reason: null,
    banned_until: null,
  });
  if (!worker) return json(404, { ok: false, error: 'not_found' });
  await sendMessage(worker.user_id, 'Hisobingiz tiklandi. Ishni davom ettirishingiz mumkin.').catch(() => null);
  return json(200, { ok: true, worker: workerShape(worker) });
}

// Admin: bo'lim statistikasi. Xizmat bepul — pul/order ko'rsatkichlari yo'q.
async function handleAdminStats(supabase) {
  const [workersRes, listingsRes] = await Promise.all([
    request(supabase, 'workers', { query: 'select=is_approved,is_banned' }).catch(() => ({ data: [] })),
    request(supabase, 'listings', { query: 'select=is_published,is_hidden,created_at' }).catch(() => ({ data: [] })),
  ]);

  const workers = workersRes.data || [];
  const listings = listingsRes.data || [];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  return json(200, {
    ok: true,
    stats: {
      active_workers: workers.filter((w) => w.is_approved && !w.is_banned).length,
      pending_workers: workers.filter((w) => !w.is_approved && !w.is_banned).length,
      banned_workers: workers.filter((w) => w.is_banned).length,
      listings_total: listings.length,
      listings_active: listings.filter((l) => l.is_published && !l.is_hidden).length,
      listings_draft: listings.filter((l) => !l.is_published).length,
      listings_week: listings.filter((l) => l.created_at >= weekAgo).length,
    },
  });
}

const ADMIN_ACTIONS = {
  'admin/stats': handleAdminStats,
  'admin/workers': handleAdminWorkers,
  'admin/worker-approve': handleAdminApprove,
  'admin/worker-reject': handleAdminReject,
  'admin/worker-ban': handleAdminBan,
  'admin/worker-unban': handleAdminUnban,
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  const auth = authenticate(event.headers, body);
  if (!auth.ok) return json(401, { ok: false, error: 'unauthorized', reason: auth.reason });

  const telegramId = String(auth.user.id);
  const supabase = getAdminClient();

  try {
    const adminHandler = ADMIN_ACTIONS[body.action];
    if (adminHandler) {
      if (!isAdminTelegramId(telegramId)) return json(403, { ok: false, error: 'forbidden' });
      // telegramId — audit uchun (kim hal qildi); eski handlerlar buni e'tiborsiz qoldiradi.
      return await adminHandler(supabase, body, telegramId);
    }

    switch (body.action) {
      case 'worker-status':
        return await handleWorkerStatus(supabase, telegramId);
      case 'worker-register':
        return await handleWorkerRegister(supabase, telegramId, body);
      case 'worker-accept-rules':
        return await handleAcceptRules(supabase, telegramId);
      case 'worker-profile-update':
        return await handleWorkerProfileUpdate(supabase, telegramId, body);
      case 'worker-busy':
        return await handleWorkerBusy(supabase, telegramId, body);
      case 'worker-public':
        return await handleWorkerPublic(supabase, body);
      case 'catalog':
        return await handleCatalog(supabase, body);
      case 'my-listings':
        return await handleMyListings(supabase, telegramId);
      case 'listing-create':
        return await handleListingCreate(supabase, telegramId, body);
      case 'listing-update':
        return await handleListingUpdate(supabase, telegramId, body);
      case 'listing-delete':
        return await handleListingDelete(supabase, telegramId, body);
      default:
        return json(400, { ok: false, error: 'unknown_action' });
    }
  } catch (error) {
    console.error('vacancy-api error', body.action, error);
    return json(500, { ok: false, error: 'server_error' });
  }
};

// Admin amallari alohida ham ishlatiladi: vacancy-admin.js (admin panel, cookie
// sessiyasi bilan) shu xaritani qayta ishlatadi — mantiq bir joyda qoladi.
exports.ADMIN_ACTIONS = ADMIN_ACTIONS;
exports.json = json;
