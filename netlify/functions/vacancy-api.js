const { getAdminClient, request, isAdminTelegramId } = require('../../shared/db');
const { authenticate } = require('../../shared/webapp-auth');
const { sendMessage } = require('../../shared/telegram');
const {
  formatUzs,
  formatDateTime,
  calculateOrderMoney,
  patchOrder,
  openPaymentWindow,
  startWork,
  applyDeadlinePenalty,
  recalculateWorkerRating,
} = require('../../shared/vacancy-order-service');

// Vakansiyalar (freelance marketplace) moduli uchun API.
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
    card_number: row.card_number || '',
    work_schedule: row.work_schedule || {},
    is_busy: Boolean(row.is_busy),
    is_approved: Boolean(row.is_approved),
    is_banned: Boolean(row.is_banned),
    ban_reason: row.ban_reason || null,
    banned_until: row.banned_until || null,
    experience_years: Number(row.experience_years || 0),
    avg_rating: Number(row.avg_rating || 0),
    total_reviews: Number(row.total_reviews || 0),
    completed_orders: Number(row.completed_orders || 0),
    total_earnings: Number(row.total_earnings || 0),
    deadline_violations: Number(row.deadline_violations || 0),
    rules_accepted: Boolean(row.rules_accepted),
    created_at: row.created_at,
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
  const cardNumber = String(body.card_number || '').replace(/\D/g, '').slice(0, 20);
  if (cardNumber.length < 16) return json(400, { ok: false, error: 'invalid_card' });

  const payload = {
    user_id: telegramId,
    phone,
    name,
    bio,
    categories,
    portfolio_urls: portfolio,
    card_number: cardNumber,
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
    `🧑‍💻 <b>Yangi ishchi arizasi</b>\n\n` +
    `👤 ${name}\n📱 ${phone}\n🔑 Kod: <code>${code}</code>\n` +
    `📂 ${categories.join(', ')}\n💼 Tajriba: ${body.experience}\n` +
    `🔗 ${portfolio.join('\n🔗 ')}\n\n` +
    `${bio ? `📝 ${bio}\n\n` : ''}Admin panel → Ishchilar → Kutilmoqda`;
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

  if (body.card_number !== undefined) {
    const card = String(body.card_number || '').replace(/\D/g, '').slice(0, 20);
    if (card.length < 16) return json(400, { ok: false, error: 'invalid_card' });
    patch.card_number = card;
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
      avg_rating: Number(worker.avg_rating || 0),
      total_reviews: Number(worker.total_reviews || 0),
      completed_orders: Number(worker.completed_orders || 0),
      is_busy: Boolean(worker.is_busy),
      categories: worker.categories || [],
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

  const sortMap = {
    rating: 'workers(avg_rating).desc',
    price_asc: 'min_price.asc',
    price_desc: 'min_price.desc',
    online: 'workers(is_busy).asc',
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

  const [listingsRes, reviewsRes] = await Promise.all([
    request(supabase, 'listings', {
      query: `select=*&worker_id=eq.${workerId}&is_published=eq.true&is_hidden=eq.false&order=created_at.desc`,
    }).catch(() => ({ data: [] })),
    request(supabase, 'freelance_reviews', {
      query: `select=rating,comment,created_at&reviewed_id=eq.${encodeURIComponent(worker.user_id)}&reviewer_role=eq.client&is_visible=eq.true&order=created_at.desc&limit=20`,
    }).catch(() => ({ data: [] })),
  ]);

  const shaped = workerShape(worker);
  if (!shaped.show_phone) shaped.phone = null;
  delete shaped.card_number;

  return json(200, {
    ok: true,
    worker: shaped,
    listings: (listingsRes.data || []).map(listingShape),
    reviews: reviewsRes.data || [],
  });
}

/* ---------------- Chat ---------------- */

// Chat media'si yopiq bucket'da saqlanadi — faqat qisqa muddatli imzolangan
// havola beriladi (to'g'ridan-to'g'ri yuklab olinadigan URL berilmaydi).
const MEDIA_BUCKET = process.env.VACANCY_MEDIA_BUCKET || 'vacancy-media';
const SIGNED_URL_TTL = 60 * 30; // 30 daqiqa
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
const MEDIA_TYPES = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/quicktime': { ext: 'mov', kind: 'video' },
};

// Saqlangan yo'l kengaytmasi bo'yicha media turi (imzolangan URL query bilan
// kelgani uchun URL'dan taxmin qilish ishonchsiz).
function mediaKindFromPath(path) {
  if (!path) return null;
  const ext = String(path).split('.').pop().toLowerCase();
  const match = Object.values(MEDIA_TYPES).find((m) => m.ext === ext);
  return match?.kind || null;
}

function storageBase() {
  return process.env.SUPABASE_URL.replace(/\/$/, '');
}

async function uploadMedia(buffer, contentType, path) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${storageBase()}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buffer,
  });
  if (!res.ok) throw new Error(`storage_upload_failed: ${await res.text()}`);
  return path;
}

async function signMedia(path) {
  if (!path) return null;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const res = await fetch(`${storageBase()}/storage/v1/object/sign/${MEDIA_BUCKET}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.signedURL ? `${storageBase()}/storage/v1${data.signedURL}` : null;
  } catch {
    return null;
  }
}

async function messageShape(row) {
  return {
    id: row.id,
    chat_id: row.chat_id,
    sender_id: row.sender_id,
    message_type: row.message_type || 'text',
    content: row.content || '',
    media_url: await signMedia(row.media_url),
    reply_to_id: row.reply_to_id || null,
    is_reported: Boolean(row.is_reported),
    created_at: row.created_at,
  };
}

async function getChatForUser(supabase, chatId, telegramId) {
  const { data } = await request(supabase, 'chats', { query: `select=*&id=eq.${Number(chatId)}&limit=1` });
  const chat = data?.[0];
  if (!chat) return null;
  if (chat.client_id !== telegramId && chat.worker_user_id !== telegramId) return null;
  return chat;
}

// Mavjud chatni topadi yoki e'lon kontekstida yangisini ochadi.
async function handleChatStart(supabase, telegramId, body) {
  const listingId = Number(body.listing_id);
  if (!listingId) return json(400, { ok: false, error: 'invalid_listing' });

  const { data } = await request(supabase, 'listings', {
    query: `select=*,workers!inner(*)&id=eq.${listingId}&limit=1`,
  });
  const listing = data?.[0];
  if (!listing) return json(404, { ok: false, error: 'not_found' });

  const workerUserId = listing.workers.user_id;
  if (workerUserId === telegramId) return json(400, { ok: false, error: 'self_chat' });
  if (listing.workers.is_busy) return json(400, { ok: false, error: 'worker_busy' });
  if (listing.workers.is_banned) return json(403, { ok: false, error: 'worker_banned' });

  const { data: existing } = await request(supabase, 'chats', {
    query: `select=*&client_id=eq.${encodeURIComponent(telegramId)}&worker_user_id=eq.${encodeURIComponent(workerUserId)}&listing_id=eq.${listingId}&limit=1`,
  });
  if (existing?.[0]) return json(200, { ok: true, chat_id: existing[0].id, created: false });

  const { data: created } = await request(supabase, 'chats', {
    method: 'POST',
    body: { listing_id: listingId, client_id: telegramId, worker_user_id: workerUserId },
    headers: { Prefer: 'return=representation' },
  });

  await sendMessage(
    workerUserId,
    `💬 <b>Yangi suhbat</b>\n\n"${listing.title}" e'loni bo'yicha mijoz siz bilan bog'landi.`,
  ).catch(() => null);

  return json(200, { ok: true, chat_id: created[0].id, created: true });
}

// Foydalanuvchi chatlari — oxirgi xabar va faol order bilan.
async function handleChatList(supabase, telegramId) {
  const id = encodeURIComponent(telegramId);
  const { data: chats } = await request(supabase, 'chats', {
    query: `select=*&or=(client_id.eq.${id},worker_user_id.eq.${id})&order=last_message_at.desc&limit=50`,
  });
  if (!chats?.length) return json(200, { ok: true, chats: [] });

  const ids = chats.map((c) => c.id).join(',');
  const [lastRes, workersRes, ordersRes] = await Promise.all([
    request(supabase, 'chat_messages', {
      query: `select=chat_id,content,message_type,created_at&chat_id=in.(${ids})&order=created_at.desc&limit=200`,
    }).catch(() => ({ data: [] })),
    request(supabase, 'workers', {
      query: `select=id,user_id,name,is_busy&user_id=in.(${chats.map((c) => c.worker_user_id).join(',')})`,
    }).catch(() => ({ data: [] })),
    request(supabase, 'freelance_orders', {
      query: `select=id,chat_id,status&chat_id=in.(${ids})&status=not.in.(completed,cancelled)&order=created_at.desc`,
    }).catch(() => ({ data: [] })),
  ]);

  const lastByChat = {};
  for (const m of lastRes.data || []) if (!lastByChat[m.chat_id]) lastByChat[m.chat_id] = m;
  const workerByUser = {};
  for (const w of workersRes.data || []) workerByUser[w.user_id] = w;
  const orderByChat = {};
  for (const o of ordersRes.data || []) if (!orderByChat[o.chat_id]) orderByChat[o.chat_id] = o;

  return json(200, {
    ok: true,
    chats: chats.map((c) => {
      const isClient = c.client_id === telegramId;
      const worker = workerByUser[c.worker_user_id];
      const last = lastByChat[c.id];
      return {
        id: c.id,
        listing_id: c.listing_id,
        role: isClient ? 'client' : 'worker',
        peer_name: isClient ? worker?.name || 'Ishchi' : 'Mijoz',
        peer_id: isClient ? c.worker_user_id : c.client_id,
        last_message: last
          ? last.message_type === 'text'
            ? last.content
            : last.message_type === 'system'
              ? last.content
              : '📎 Media'
          : '',
        last_message_at: last?.created_at || c.last_message_at,
        active_order: orderByChat[c.id] ? { id: orderByChat[c.id].id, status: orderByChat[c.id].status } : null,
      };
    }),
  });
}

async function handleChatMessages(supabase, telegramId, body) {
  const chat = await getChatForUser(supabase, body.chat_id, telegramId);
  if (!chat) return json(404, { ok: false, error: 'not_found' });

  const before = Number(body.before) || 0;
  const filter = before ? `&id=lt.${before}` : '';
  const { data } = await request(supabase, 'chat_messages', {
    query: `select=*&chat_id=eq.${chat.id}${filter}&order=id.desc&limit=40`,
  });

  const rows = (data || []).reverse();
  const messages = [];
  for (const row of rows) messages.push(await messageShape(row));

  const [worker, activeOrder] = await Promise.all([
    request(supabase, 'workers', {
      query: `select=id,user_id,name&user_id=eq.${encodeURIComponent(chat.worker_user_id)}&limit=1`,
    }).catch(() => ({ data: [] })),
    request(supabase, 'freelance_orders', {
      query: `select=*&chat_id=eq.${chat.id}&status=in.(${ACTIVE_ORDER_STATUSES})&order=created_at.desc&limit=1`,
    }).catch(() => ({ data: [] })),
  ]);

  return json(200, {
    ok: true,
    messages,
    has_more: (data || []).length === 40,
    chat: {
      id: chat.id,
      listing_id: chat.listing_id,
      role: chat.client_id === telegramId ? 'client' : 'worker',
      worker: worker.data?.[0] || null,
      active_order: activeOrder.data?.[0] ? orderShape(activeOrder.data[0]) : null,
    },
  });
}

async function insertMessage(supabase, chatId, payload) {
  const { data } = await request(supabase, 'chat_messages', {
    method: 'POST',
    body: { chat_id: chatId, ...payload },
    headers: { Prefer: 'return=representation' },
  });
  await request(supabase, 'chats', {
    method: 'PATCH',
    query: `id=eq.${chatId}`,
    body: { last_message_at: new Date().toISOString() },
  }).catch(() => null);
  return data[0];
}

async function handleMessageSend(supabase, telegramId, body) {
  const chat = await getChatForUser(supabase, body.chat_id, telegramId);
  if (!chat) return json(404, { ok: false, error: 'not_found' });

  const payload = { sender_id: telegramId, reply_to_id: Number(body.reply_to_id) || null };

  if (body.media) {
    const meta = MEDIA_TYPES[body.media.type];
    if (!meta) return json(400, { ok: false, error: 'invalid_media_type' });
    const buffer = Buffer.from(String(body.media.data || ''), 'base64');
    if (!buffer.length) return json(400, { ok: false, error: 'empty_media' });
    if (buffer.length > MAX_MEDIA_BYTES) return json(400, { ok: false, error: 'media_too_large' });

    const path = `chat/${chat.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${meta.ext}`;
    await uploadMedia(buffer, body.media.type, path);
    payload.message_type = meta.kind;
    payload.media_url = path;
    payload.content = trimText(body.content, 500);
  } else {
    const content = trimText(body.content, 4000);
    if (!content) return json(400, { ok: false, error: 'empty_message' });
    payload.message_type = 'text';
    payload.content = content;
  }

  const row = await insertMessage(supabase, chat.id, payload);
  const peerId = chat.client_id === telegramId ? chat.worker_user_id : chat.client_id;
  await sendMessage(peerId, "💬 Sizga yangi xabar keldi. Mini App → Vakansiyalar → Chatlar").catch(() => null);

  return json(200, { ok: true, message: await messageShape(row) });
}

async function handleMessageReport(supabase, telegramId, body) {
  const chat = await getChatForUser(supabase, body.chat_id, telegramId);
  if (!chat) return json(404, { ok: false, error: 'not_found' });

  const reason = trimText(body.reason, 500);
  if (reason.length < 5) return json(400, { ok: false, error: 'invalid_reason' });

  const messageId = Number(body.message_id) || null;
  let reportedId = chat.client_id === telegramId ? chat.worker_user_id : chat.client_id;
  if (messageId) {
    const { data } = await request(supabase, 'chat_messages', {
      query: `select=id,sender_id,chat_id&id=eq.${messageId}&chat_id=eq.${chat.id}&limit=1`,
    });
    if (!data?.[0]) return json(404, { ok: false, error: 'message_not_found' });
    reportedId = data[0].sender_id;
    await request(supabase, 'chat_messages', {
      method: 'PATCH',
      query: `id=eq.${messageId}`,
      body: { is_reported: true, report_reason: reason },
    }).catch(() => null);
  }

  await request(supabase, 'freelance_reports', {
    method: 'POST',
    body: {
      chat_id: chat.id,
      message_id: messageId,
      reporter_id: telegramId,
      reported_id: reportedId,
      reason,
    },
  });

  for (const chatId of adminChatIds()) {
    await sendMessage(chatId, `🚩 <b>Yangi shikoyat</b>\n\nChat #${chat.id}\nSabab: ${reason}`).catch(() => null);
  }
  return json(200, { ok: true });
}

/* ---------------- Orderlar ---------------- */

const ORDER_FORMATS = ['reels_9_16', 'youtube_16_9', 'story_9_16', 'post_1_1', 'banner', 'logo', 'other'];
const MAX_COUNTER_OFFERS = 3;
const ACTIVE_ORDER_STATUSES =
  'created,accepted,payment_pending,first_paid,materials_pending,in_progress,result_sent,reviewing,revising,final_payment_pending';

function orderShape(row) {
  return {
    id: row.id,
    chat_id: row.chat_id,
    created_by: row.created_by,
    client_id: row.client_id,
    worker_user_id: row.worker_user_id,
    listing_id: row.listing_id,
    title: row.title,
    description: row.description,
    format: row.format,
    reference_urls: row.reference_urls || [],
    notes: row.notes || '',
    amount: Number(row.amount || 0),
    commission: Number(row.commission || 0),
    worker_amount: Number(row.worker_amount || 0),
    deadline_hours: Number(row.deadline_hours || 0),
    deadline_at: row.deadline_at,
    first_payment: Number(row.first_payment || 0),
    second_payment: Number(row.second_payment || 0),
    first_payment_status: row.first_payment_status,
    second_payment_status: row.second_payment_status,
    has_source_materials: Boolean(row.has_source_materials),
    source_materials_sent: Boolean(row.source_materials_sent),
    counter_offer_count: Number(row.counter_offer_count || 0),
    parent_order_id: row.parent_order_id || null,
    status: row.status,
    // Order flow maydonlari — to'lov oynasi va deadline holati (frontend shularga qarab
    // to'lov sahifasi / "muddat o'tdi" tanlovini ko'rsatadi).
    payment_stage: row.payment_stage || null,
    payment_expires_at: row.payment_expires_at || null,
    deadline_expired: Boolean(row.deadline_expired),
    deadline_warning_sent: Boolean(row.deadline_warning_sent),
    deadline_extended_count: Number(row.deadline_extended_count || 0),
    revision_count: Number(row.revision_count || 0),
    cancel_reason: row.cancel_reason || null,
    refund_amount: Number(row.refund_amount || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateOrderFields(body) {
  const title = trimText(body.title, 120);
  if (title.length < 3) return { error: 'invalid_title' };

  const description = trimText(body.description, 2000);
  if (description.length < 10) return { error: 'invalid_description' };

  const format = ORDER_FORMATS.includes(body.format) ? body.format : null;
  if (!format) return { error: 'invalid_format' };

  const referenceUrls = (Array.isArray(body.reference_urls) ? body.reference_urls : [])
    .map(sanitizeUrl)
    .filter(Boolean)
    .slice(0, 3);

  const notes = trimText(body.notes, 500);

  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'invalid_amount' };

  const deadlineHours = Number(body.deadline_hours);
  if (!Number.isFinite(deadlineHours) || deadlineHours < 1 || deadlineHours > 240) {
    return { error: 'invalid_deadline' };
  }

  return {
    fields: {
      title,
      description,
      format,
      reference_urls: referenceUrls,
      notes,
      deadline_hours: deadlineHours,
      has_source_materials: Boolean(body.has_source_materials),
      ...calculateOrderMoney(amount),
    },
  };
}

async function getActiveOrderForChat(supabase, chatId) {
  const { data } = await request(supabase, 'freelance_orders', {
    query: `select=id&chat_id=eq.${chatId}&status=in.(${ACTIVE_ORDER_STATUSES})&limit=1`,
  });
  return data?.[0] || null;
}

async function getOrderForUser(supabase, orderId, telegramId) {
  const { data } = await request(supabase, 'freelance_orders', {
    query: `select=*&id=eq.${Number(orderId)}&limit=1`,
  });
  const order = data?.[0];
  if (!order) return null;
  if (order.client_id !== telegramId && order.worker_user_id !== telegramId) return null;
  return order;
}

async function notifyOrderPeer(order, telegramId, text) {
  const peerId = order.client_id === telegramId ? order.worker_user_id : order.client_id;
  await sendMessage(peerId, text).catch(() => null);
}

async function handleOrderCreate(supabase, telegramId, body) {
  const chat = await getChatForUser(supabase, body.chat_id, telegramId);
  if (!chat) return json(404, { ok: false, error: 'not_found' });

  if (await getActiveOrderForChat(supabase, chat.id)) {
    return json(400, { ok: false, error: 'active_order_exists' });
  }

  const { fields, error } = validateOrderFields(body);
  if (error) return json(400, { ok: false, error });

  const { data } = await request(supabase, 'freelance_orders', {
    method: 'POST',
    body: {
      chat_id: chat.id,
      created_by: telegramId,
      client_id: chat.client_id,
      worker_user_id: chat.worker_user_id,
      listing_id: chat.listing_id,
      ...fields,
    },
    headers: { Prefer: 'return=representation' },
  });
  const order = data[0];

  await insertMessage(supabase, chat.id, {
    sender_id: telegramId,
    message_type: 'system',
    content: `📋 Order #${order.id} yaratildi: "${order.title}"`,
  });
  await notifyOrderPeer(order, telegramId, `📋 Yangi order #${order.id}\n📝 ${order.title}\n💰 ${order.amount} UZS`);

  return json(200, { ok: true, order: orderShape(order) });
}

async function handleOrderCounter(supabase, telegramId, body) {
  const original = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!original) return json(404, { ok: false, error: 'not_found' });
  if (original.status !== 'created') return json(400, { ok: false, error: 'not_counterable' });
  if (original.counter_offer_count >= MAX_COUNTER_OFFERS) return json(400, { ok: false, error: 'counter_limit' });

  const { fields, error } = validateOrderFields(body);
  if (error) return json(400, { ok: false, error });

  await request(supabase, 'freelance_orders', {
    method: 'PATCH',
    query: `id=eq.${original.id}`,
    body: { status: 'cancelled', updated_at: new Date().toISOString() },
  });

  const { data } = await request(supabase, 'freelance_orders', {
    method: 'POST',
    body: {
      chat_id: original.chat_id,
      created_by: telegramId,
      client_id: original.client_id,
      worker_user_id: original.worker_user_id,
      listing_id: original.listing_id,
      parent_order_id: original.id,
      counter_offer_count: original.counter_offer_count + 1,
      ...fields,
    },
    headers: { Prefer: 'return=representation' },
  });
  const order = data[0];

  await insertMessage(supabase, original.chat_id, {
    sender_id: telegramId,
    message_type: 'system',
    content: `🔄 Order #${original.id} o'rniga yangi taklif #${order.id}: "${order.title}", ${order.amount} UZS`,
  });
  await notifyOrderPeer(order, telegramId, `🔄 Order #${original.id} bo'yicha yangi taklif keldi: ${order.amount} UZS`);

  return json(200, { ok: true, order: orderShape(order) });
}

async function handleOrderAccept(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  if (order.status !== 'created') return json(400, { ok: false, error: 'not_acceptable' });
  if (order.created_by === telegramId) return json(400, { ok: false, error: 'cannot_accept_own' });

  const { data } = await request(supabase, 'freelance_orders', {
    method: 'PATCH',
    query: `id=eq.${order.id}`,
    body: { status: 'accepted', updated_at: new Date().toISOString() },
    headers: { Prefer: 'return=representation' },
  });
  const updated = data[0];

  await insertMessage(supabase, order.chat_id, {
    sender_id: telegramId,
    message_type: 'system',
    content: `✅ Order #${order.id} qabul qilindi`,
  });
  await notifyOrderPeer(updated, telegramId, `✅ Order #${order.id} qabul qilindi!`);

  return json(200, { ok: true, order: orderShape(updated) });
}

async function handleOrderCancel(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  if (!['created', 'accepted'].includes(order.status)) return json(400, { ok: false, error: 'not_cancellable' });

  const { data } = await request(supabase, 'freelance_orders', {
    method: 'PATCH',
    query: `id=eq.${order.id}`,
    body: { status: 'cancelled', updated_at: new Date().toISOString() },
    headers: { Prefer: 'return=representation' },
  });
  const updated = data[0];

  await insertMessage(supabase, order.chat_id, {
    sender_id: telegramId,
    message_type: 'system',
    content: `❌ Order #${order.id} bekor qilindi`,
  });
  await notifyOrderPeer(updated, telegramId, `❌ Order #${order.id} bekor qilindi.`);

  return json(200, { ok: true, order: orderShape(updated) });
}

/* ---------------- Order flow: to'lov, materiallar, deadline ---------------- */

async function paymentCardNumber(supabase) {
  const { data } = await request(supabase, 'settings', { query: 'select=seller_card_number&id=eq.1' }).catch(() => ({
    data: [],
  }));
  return data?.[0]?.seller_card_number || process.env.PAYMENT_CARD_NUMBER || '';
}

// 50% oldindan to'lov — faqat mijoz boshlaydi, order qabul qilingandan keyin.
async function handleOrderPaymentStart(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  if (order.client_id !== telegramId) return json(403, { ok: false, error: 'only_client_pays' });
  if (!['accepted', 'payment_pending'].includes(order.status)) {
    return json(400, { ok: false, error: 'not_payable' });
  }

  // Oyna hali ochiq bo'lsa — o'sha summani qaytaramiz (yangi summa bermaymiz).
  let current = order;
  const stillValid =
    order.status === 'payment_pending' &&
    order.unique_price &&
    order.payment_expires_at &&
    new Date(order.payment_expires_at).getTime() > Date.now();

  if (!stillValid) {
    current = await openPaymentWindow(supabase, order, 'first');
    if (!current) return json(503, { ok: false, error: 'no_price_slot' });

    await insertMessage(supabase, order.chat_id, {
      sender_id: telegramId,
      message_type: 'system',
      content: `💳 Order #${order.id} — 50% to'lov kutilmoqda (${formatUzs(current.unique_price)})`,
    });
  }

  return json(200, {
    ok: true,
    payment: {
      order_id: current.id,
      stage: 'first',
      amount: Number(current.unique_price),
      card_number: await paymentCardNumber(supabase),
      expires_at: current.payment_expires_at,
    },
    order: orderShape(current),
  });
}

// Qolgan 50% — mijoz natijani qabul qilgandan keyin ochiladi (3 kunlik oyna).
async function handleFinalPaymentStart(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  if (order.client_id !== telegramId) return json(403, { ok: false, error: 'only_client_pays' });
  if (order.status !== 'final_payment_pending') return json(400, { ok: false, error: 'not_payable' });

  let current = order;
  const stillValid =
    order.unique_price &&
    order.payment_stage === 'second' &&
    order.payment_expires_at &&
    new Date(order.payment_expires_at).getTime() > Date.now();

  if (!stillValid) {
    current = await openPaymentWindow(supabase, order, 'second');
    if (!current) return json(503, { ok: false, error: 'no_price_slot' });
  }

  return json(200, {
    ok: true,
    payment: {
      order_id: current.id,
      stage: 'second',
      amount: Number(current.unique_price),
      card_number: await paymentCardNumber(supabase),
      expires_at: current.payment_expires_at,
    },
    order: orderShape(current),
  });
}

// Mijoz isxodnik materiallarni botga yuborib bo'lgach bosadi — ish boshlanadi.
async function handleMaterialsSent(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  if (order.client_id !== telegramId) return json(403, { ok: false, error: 'only_client' });
  if (order.status !== 'materials_pending') return json(400, { ok: false, error: 'not_materials_stage' });

  const updated = await startWork(supabase, order, { source_materials_sent: true });

  await insertMessage(supabase, order.chat_id, {
    sender_id: telegramId,
    message_type: 'system',
    content: `📦 Materiallar yuborildi — ish boshlandi. Deadline: ${formatDateTime(updated.deadline_at)}`,
  });
  await sendMessage(
    order.worker_user_id,
    `📦 <b>Materiallar keldi</b>\n\nOrder #${order.id} bo'yicha ish boshlandi.\n⏰ Deadline: ${formatDateTime(updated.deadline_at)}`,
  ).catch(() => null);

  return json(200, { ok: true, order: orderShape(updated) });
}

// Deadline o'tganda mijozning tanlovi: kutish (yangi muddat) yoki bekor qilish.
async function handleDeadlineRespond(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  if (order.client_id !== telegramId) return json(403, { ok: false, error: 'only_client' });
  if (!order.deadline_expired) return json(400, { ok: false, error: 'deadline_not_expired' });

  if (body.choice === 'wait') {
    const hours = Number(body.extra_hours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 24) return json(400, { ok: false, error: 'invalid_extra_hours' });

    const updated = await patchOrder(supabase, order.id, {
      deadline_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
      deadline_expired: false,
      deadline_warning_sent: false,
      deadline_extended_count: Number(order.deadline_extended_count || 0) + 1,
    });
    await insertMessage(supabase, order.chat_id, {
      sender_id: telegramId,
      message_type: 'system',
      content: `⏳ Mijoz ${hours} soat qo'shimcha vaqt berdi`,
    });
    await sendMessage(
      order.worker_user_id,
      `⏳ Order #${order.id}: mijoz ${hours} soat qo'shimcha vaqt berdi. Ulgurishga harakat qiling.`,
    ).catch(() => null);
    return json(200, { ok: true, order: orderShape(updated) });
  }

  if (body.choice === 'cancel') {
    // Deadline buzilgani uchun bekor qilindi — 50% mijozga qaytariladi, ishchiga shtraf.
    const updated = await patchOrder(supabase, order.id, {
      status: 'cancelled',
      cancel_reason: 'deadline_violation',
      refund_amount: Number(order.first_payment || 0),
      second_payment_status: 'refunded',
    });
    await applyDeadlinePenalty(supabase, order);
    await insertMessage(supabase, order.chat_id, {
      sender_id: telegramId,
      message_type: 'system',
      content: `❌ Order #${order.id} deadline buzilgani uchun bekor qilindi`,
    });
    await sendMessage(
      order.worker_user_id,
      `❌ Order #${order.id} bekor qilindi — deadline buzildi.\n\nMijozga ${formatUzs(order.first_payment)} qaytariladi.`,
    ).catch(() => null);
    for (const chatId of adminChatIds()) {
      await sendMessage(
        chatId,
        `↩️ <b>Qaytarish kerak</b>\n\nOrder #${order.id}\nMijoz: <code>${order.client_id}</code>\nSumma: ${formatUzs(order.first_payment)}`,
      ).catch(() => null);
    }
    return json(200, { ok: true, order: orderShape(updated) });
  }

  return json(400, { ok: false, error: 'invalid_choice' });
}

/* ---------------- Natija yetkazish ---------------- */

const MAX_REVISIONS = 3;

// Montajor natijani yuboradi — chatda himoyalangan ko'rinishda (yuklab bo'lmaydi).
// Yakuniy, yuklab olinadigan fayl faqat to'liq to'lovdan keyin bot orqali beriladi.
async function handleResultSend(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  if (order.worker_user_id !== telegramId) return json(403, { ok: false, error: 'only_worker' });
  if (!['in_progress', 'revising'].includes(order.status)) {
    return json(400, { ok: false, error: 'not_result_stage' });
  }

  const media = body.media;
  if (!media) return json(400, { ok: false, error: 'media_required' });
  const meta = MEDIA_TYPES[media.type];
  if (!meta) return json(400, { ok: false, error: 'invalid_media_type' });

  const buffer = Buffer.from(String(media.data || ''), 'base64');
  if (!buffer.length) return json(400, { ok: false, error: 'empty_media' });
  if (buffer.length > MAX_MEDIA_BYTES) return json(400, { ok: false, error: 'media_too_large' });

  const path = `result/${order.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${meta.ext}`;
  await uploadMedia(buffer, media.type, path);

  const updated = await patchOrder(supabase, order.id, { status: 'result_sent', result_media_url: path });

  // Natija chatda ham ko'rinadi — himoyalangan media sifatida.
  await insertMessage(supabase, order.chat_id, {
    sender_id: telegramId,
    message_type: meta.kind,
    media_url: path,
    content: trimText(body.content, 500) || `Order #${order.id} — natija`,
  });
  await insertMessage(supabase, order.chat_id, {
    sender_id: telegramId,
    message_type: 'system',
    content: `📤 Order #${order.id} bo'yicha natija yuborildi`,
  });

  await sendMessage(
    order.client_id,
    `📤 <b>Natija tayyor!</b>\n\nOrder #${order.id} bo'yicha montajor natijani yubordi.\n\nMini App → Orderlar bo'limidan ko'ring va qaror qabul qiling.`,
  ).catch(() => null);

  return json(200, { ok: true, order: orderShape(updated) });
}

// Montajor "Qolgan to'lovni so'rash" — bu faqat mijozga eslatma yuboradi.
// Pul holati o'zgarmaydi: yakuniy to'lov oynasi mijoz natijani qabul qilgandagina ochiladi.
async function handleRequestPayment(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  if (order.worker_user_id !== telegramId) return json(403, { ok: false, error: 'only_worker' });
  if (order.status !== 'result_sent') return json(400, { ok: false, error: 'not_result_stage' });

  const updated = await patchOrder(supabase, order.id, { status: 'reviewing' });

  await insertMessage(supabase, order.chat_id, {
    sender_id: telegramId,
    message_type: 'system',
    content: `❓ Montajor natijani qabul qilishingizni so'rayapti`,
  });
  await sendMessage(
    order.client_id,
    `❓ <b>Natijani qabul qilasizmi?</b>\n\nOrder #${order.id}\n\nQabul qilsangiz, qolgan ${formatUzs(order.second_payment)} to'lovga o'tasiz.\nAgar kamchilik bo'lsa — "O'zgartirish kerak" tugmasini bosing.`,
  ).catch(() => null);

  return json(200, { ok: true, order: orderShape(updated) });
}

// Mijoz natijani qabul qildi → qolgan 50% uchun 3 kunlik to'lov oynasi ochiladi.
async function handleApproveResult(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  if (order.client_id !== telegramId) return json(403, { ok: false, error: 'only_client' });
  if (!['result_sent', 'reviewing'].includes(order.status)) {
    return json(400, { ok: false, error: 'not_reviewable' });
  }

  const updated = await openPaymentWindow(supabase, order, 'second');
  if (!updated) return json(503, { ok: false, error: 'no_price_slot' });

  await insertMessage(supabase, order.chat_id, {
    sender_id: telegramId,
    message_type: 'system',
    content: `✅ Mijoz natijani qabul qildi — qolgan to'lov kutilmoqda`,
  });
  await sendMessage(
    order.client_id,
    `✅ <b>Natijani qabul qildingiz</b>\n\nOrder #${order.id}\nQolgan ${formatUzs(order.second_payment)} ni 3 kun ichida to'lang.\n\n⚠️ To'lanmasa order bekor qilinadi.`,
  ).catch(() => null);
  await sendMessage(
    order.worker_user_id,
    `🎉 <b>Mijoz natijani qabul qildi!</b>\n\nOrder #${order.id}\nQolgan to'lov kutilmoqda (3 kun muddat).`,
  ).catch(() => null);

  return json(200, { ok: true, order: orderShape(updated) });
}

// Mijoz o'zgartirish so'raydi. Limit — 3 marta; undan keyingi so'rov
// avtomatik nizoga aylanadi (aks holda cheksiz aylanib qolardi).
async function handleRequestRevision(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  if (order.client_id !== telegramId) return json(403, { ok: false, error: 'only_client' });
  if (!['result_sent', 'reviewing'].includes(order.status)) {
    return json(400, { ok: false, error: 'not_reviewable' });
  }

  const comment = trimText(body.comment, 1000);
  if (comment.length < 5) return json(400, { ok: false, error: 'invalid_comment' });

  const used = Number(order.revision_count || 0);

  // Limit tugagan: yangi so'rov o'rniga nizo ochiladi va admin aralashadi.
  if (used >= MAX_REVISIONS) {
    const updated = await patchOrder(supabase, order.id, { status: 'disputed' });
    await request(supabase, 'freelance_reports', {
      method: 'POST',
      body: {
        order_id: order.id,
        chat_id: order.chat_id,
        reporter_id: telegramId,
        reported_id: order.worker_user_id,
        reason: `O'zgartirish limiti (${MAX_REVISIONS}) tugadi, tomonlar kelisha olmadi. So'nggi izoh: ${comment}`,
      },
    }).catch(() => null);

    await insertMessage(supabase, order.chat_id, {
      sender_id: telegramId,
      message_type: 'system',
      content: `🚩 O'zgartirish limiti tugadi — nizo ochildi, admin ko'rib chiqadi`,
    });
    for (const chatId of adminChatIds()) {
      await sendMessage(
        chatId,
        `🚩 <b>Avtomatik nizo</b>\n\nOrder #${order.id} — ${MAX_REVISIONS} ta o'zgartirishdan keyin kelishilmadi.\nMijoz: <code>${order.client_id}</code>\nMontajor: <code>${order.worker_user_id}</code>`,
      ).catch(() => null);
    }
    await sendMessage(order.worker_user_id, `🚩 Order #${order.id} bo'yicha nizo ochildi. Admin ko'rib chiqadi.`).catch(
      () => null,
    );
    return json(200, { ok: true, order: orderShape(updated), disputed: true });
  }

  const count = used + 1;
  const updated = await patchOrder(supabase, order.id, { status: 'revising', revision_count: count });

  await insertMessage(supabase, order.chat_id, { sender_id: telegramId, message_type: 'text', content: comment });
  await insertMessage(supabase, order.chat_id, {
    sender_id: telegramId,
    message_type: 'system',
    content: `✏️ O'zgartirish so'raldi (${count}/${MAX_REVISIONS})`,
  });

  const left = MAX_REVISIONS - count;
  await sendMessage(
    order.worker_user_id,
    `✏️ <b>O'zgartirish so'raldi</b> (${count}/${MAX_REVISIONS})\n\nOrder #${order.id}\n💬 ${comment}`,
  ).catch(() => null);

  // Limit tugaganda ikkala tomon ham ogohlantiriladi.
  if (left === 0) {
    const warning = `⚠️ Order #${order.id}: ${MAX_REVISIONS} ta o'zgartirish limiti tugadi. Kelisha olmasangiz, istalgan tomon shikoyat yuborishi mumkin.`;
    await sendMessage(order.client_id, warning).catch(() => null);
    await sendMessage(order.worker_user_id, warning).catch(() => null);
  }

  return json(200, { ok: true, order: orderShape(updated) });
}

/* ---------------- Baholar (ikki tomonlama) ---------------- */

async function getOrderReviews(supabase, orderId) {
  const { data } = await request(supabase, 'freelance_reviews', {
    query: `select=*&order_id=eq.${Number(orderId)}`,
  }).catch(() => ({ data: [] }));
  return data || [];
}

// Order yakunlangandan keyin ikkala tomon bir martadan baho qoldiradi.
// Jadvaldagi UNIQUE(order_id, reviewer_role) takroriy bahoni bloklaydi.
async function handleOrderReview(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  if (order.status !== 'completed') return json(400, { ok: false, error: 'not_completed' });

  const rating = Math.round(Number(body.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return json(400, { ok: false, error: 'invalid_rating' });
  }
  const comment = trimText(body.comment, 1000);

  const isClient = order.client_id === telegramId;
  const reviewerRole = isClient ? 'client' : 'worker';
  const reviewedId = isClient ? order.worker_user_id : order.client_id;

  const existing = await getOrderReviews(supabase, order.id);
  if (existing.some((r) => r.reviewer_role === reviewerRole)) {
    return json(400, { ok: false, error: 'already_reviewed' });
  }

  const { data } = await request(supabase, 'freelance_reviews', {
    method: 'POST',
    body: {
      order_id: order.id,
      reviewer_id: telegramId,
      reviewed_id: reviewedId,
      reviewer_role: reviewerRole,
      rating,
      comment,
    },
    headers: { Prefer: 'return=representation' },
  });

  // Ishchi reytingi saqlanadigan agregat — mijoz baho qo'yganda qayta hisoblanadi.
  // Mijoz reytingi esa o'qiyotganda hisoblanadi (alohida jadval yo'q).
  if (reviewerRole === 'client') {
    await recalculateWorkerRating(supabase, order.worker_user_id).catch((e) =>
      console.warn('rating recalc warn:', e?.message),
    );
  }

  await sendMessage(
    reviewedId,
    `⭐ <b>Yangi baho</b>\n\nOrder #${order.id} bo'yicha sizga ${'⭐'.repeat(rating)} (${rating}/5) qo'yildi.${
      comment ? `\n\n💬 ${comment}` : ''
    }`,
  ).catch(() => null);

  return json(200, { ok: true, review: data?.[0] || null });
}

// Foydalanuvchining o'z reytingi (mijoz sifatida olgan baholari).
async function handleMyRating(supabase, telegramId) {
  const { data } = await request(supabase, 'freelance_reviews', {
    query: `select=rating,comment,created_at&reviewed_id=eq.${encodeURIComponent(telegramId)}&reviewer_role=eq.worker&is_visible=eq.true&order=created_at.desc&limit=20`,
  }).catch(() => ({ data: [] }));

  const list = data || [];
  const average = list.length ? list.reduce((sum, r) => sum + Number(r.rating || 0), 0) / list.length : 0;
  return json(200, {
    ok: true,
    avg_rating: Number(average.toFixed(2)),
    total_reviews: list.length,
    reviews: list,
  });
}

async function handleOrderList(supabase, telegramId) {
  const id = encodeURIComponent(telegramId);
  const { data } = await request(supabase, 'freelance_orders', {
    query: `select=*&or=(client_id.eq.${id},worker_user_id.eq.${id})&order=created_at.desc&limit=100`,
  });
  return json(200, {
    ok: true,
    orders: (data || []).map((row) => ({ ...orderShape(row), role: row.client_id === telegramId ? 'client' : 'worker' })),
  });
}

async function handleOrderDetail(supabase, telegramId, body) {
  const order = await getOrderForUser(supabase, body.order_id, telegramId);
  if (!order) return json(404, { ok: false, error: 'not_found' });
  const shaped = orderShape(order);
  // Natija faqat qisqa muddatli imzolangan havola orqali ko'rsatiladi —
  // to'g'ridan-to'g'ri yuklab olinadigan URL berilmaydi.
  // Turini imzolangan URL'dan taxmin qilmaymiz — saqlangan yo'l kengaytmasidan aniqlaymiz.
  shaped.result_media_url = await signMedia(order.result_media_url);
  shaped.result_media_kind = mediaKindFromPath(order.result_media_url);

  const role = order.client_id === telegramId ? 'client' : 'worker';
  // Baho so'rovini ko'rsatish/yashirish uchun: shu tomon allaqachon baho berganmi.
  const reviews = order.status === 'completed' ? await getOrderReviews(supabase, order.id) : [];
  const myReview = reviews.find((r) => r.reviewer_role === role) || null;

  return json(200, {
    ok: true,
    order: shaped,
    role,
    my_review: myReview ? { rating: myReview.rating, comment: myReview.comment || '' } : null,
    can_review: order.status === 'completed' && !myReview,
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
    '🎉 <b>Tabriklaymiz!</b>\n\nSiz montajor/dizayner sifatida tasdiqlandingiz. Endi e\'lon joylashingiz mumkin.',
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
  await sendMessage(worker.user_id, `❌ <b>Arizangiz rad etildi</b>\n\nSabab: ${reason}`).catch((e) =>
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
  await sendMessage(worker.user_id, `🚫 <b>Hisobingiz to'xtatildi</b>\n\nSabab: ${reason}`).catch(() => null);
  return json(200, { ok: true, worker: workerShape(worker) });
}

async function handleAdminUnban(supabase, body) {
  const worker = await updateWorker(supabase, body.worker_id, {
    is_banned: false,
    ban_reason: null,
    banned_until: null,
  });
  if (!worker) return json(404, { ok: false, error: 'not_found' });
  await sendMessage(worker.user_id, '✅ Hisobingiz tiklandi. Ishni davom ettirishingiz mumkin.').catch(() => null);
  return json(200, { ok: true, worker: workerShape(worker) });
}

// Admin: barcha baholar (yashirilganlari bilan) — sokinish/noqonuniy izohlarni topish uchun.
async function handleAdminReviews(supabase, body) {
  const filters = ['select=*'];
  if (body.only_visible) filters.push('is_visible=eq.true');
  if (body.reviewed_id) filters.push(`reviewed_id=eq.${encodeURIComponent(body.reviewed_id)}`);
  filters.push('order=created_at.desc', 'limit=100');

  const { data } = await request(supabase, 'freelance_reviews', { query: filters.join('&') }).catch(() => ({
    data: [],
  }));
  return json(200, { ok: true, reviews: data || [] });
}

// Baho o'chirilmaydi, yashiriladi (is_visible=false) — qaytarish mumkin bo'lsin
// va reyting tarixini yo'qotmaylik. Yashirilgach reyting qayta hisoblanadi.
async function handleAdminReviewVisibility(supabase, body) {
  const reviewId = Number(body.review_id);
  if (!reviewId) return json(400, { ok: false, error: 'invalid_review' });

  const { data } = await request(supabase, 'freelance_reviews', {
    method: 'PATCH',
    query: `id=eq.${reviewId}`,
    body: { is_visible: body.is_visible === undefined ? false : Boolean(body.is_visible) },
    headers: { Prefer: 'return=representation' },
  });
  const review = data?.[0];
  if (!review) return json(404, { ok: false, error: 'not_found' });

  if (review.reviewer_role === 'client') {
    await recalculateWorkerRating(supabase, review.reviewed_id).catch((e) =>
      console.warn('rating recalc warn:', e?.message),
    );
  }
  return json(200, { ok: true, review });
}

const ADMIN_ACTIONS = {
  'admin/reviews': handleAdminReviews,
  'admin/review-visibility': handleAdminReviewVisibility,
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
      return await adminHandler(supabase, body);
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
      case 'chat-start':
        return await handleChatStart(supabase, telegramId, body);
      case 'chat-list':
        return await handleChatList(supabase, telegramId);
      case 'chat-messages':
        return await handleChatMessages(supabase, telegramId, body);
      case 'message-send':
        return await handleMessageSend(supabase, telegramId, body);
      case 'message-report':
        return await handleMessageReport(supabase, telegramId, body);
      case 'order-create':
        return await handleOrderCreate(supabase, telegramId, body);
      case 'order-counter':
        return await handleOrderCounter(supabase, telegramId, body);
      case 'order-accept':
        return await handleOrderAccept(supabase, telegramId, body);
      case 'order-cancel':
        return await handleOrderCancel(supabase, telegramId, body);
      case 'orders':
        return await handleOrderList(supabase, telegramId);
      case 'order-detail':
        return await handleOrderDetail(supabase, telegramId, body);
      case 'order-payment-start':
        return await handleOrderPaymentStart(supabase, telegramId, body);
      case 'order-final-payment-start':
        return await handleFinalPaymentStart(supabase, telegramId, body);
      case 'order-materials-sent':
        return await handleMaterialsSent(supabase, telegramId, body);
      case 'order-deadline-respond':
        return await handleDeadlineRespond(supabase, telegramId, body);
      case 'order-result-send':
        return await handleResultSend(supabase, telegramId, body);
      case 'order-request-payment':
        return await handleRequestPayment(supabase, telegramId, body);
      case 'order-approve-result':
        return await handleApproveResult(supabase, telegramId, body);
      case 'order-request-revision':
        return await handleRequestRevision(supabase, telegramId, body);
      case 'order-review':
        return await handleOrderReview(supabase, telegramId, body);
      case 'my-rating':
        return await handleMyRating(supabase, telegramId);
      default:
        return json(400, { ok: false, error: 'unknown_action' });
    }
  } catch (error) {
    console.error('vacancy-api error', body.action, error);
    return json(500, { ok: false, error: 'server_error' });
  }
};
