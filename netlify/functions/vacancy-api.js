const { getAdminClient, request, isAdminTelegramId } = require('../../shared/db');
const { authenticate } = require('../../shared/webapp-auth');
const { sendMessage } = require('../../shared/telegram');

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

const ADMIN_ACTIONS = {
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
