const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canMarkPaid,
  userLink,
  orderNotificationText,
  isAdminChat,
} = require('../shared/admin-notify');

// Intl raqamlarni buzilmas bo'shliq (U+00A0/U+202F) bilan ajratadi — regexlar
// oddiy bo'shliq bilan yozilgani uchun ularni tekislaymiz.
const norm = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ');

// Qo'lda "to'lov keldi" — faqat to'lov kutilayotgan va muddati o'tmagan
// buyurtma. Bot tugmasi ham, panel ham shu qoidaga tayanadi.
test('canMarkPaid: to\'lov kutilayotgan, muddati o\'tmagan buyurtmaga ruxsat', () => {
  const now = Date.parse('2026-09-05T10:00:00Z');
  const order = { status: 'waiting_payment', expires_at: '2026-09-05T10:09:00Z' };
  assert.deepEqual(canMarkPaid(order, now), { ok: true });
  assert.deepEqual(canMarkPaid({ status: 'pending_payment' }, now), { ok: true });
});

test('canMarkPaid: muddati o\'tgan buyurtma rad etiladi', () => {
  const now = Date.parse('2026-09-05T10:11:00Z');
  const order = { status: 'waiting_payment', expires_at: '2026-09-05T10:09:00Z' };
  assert.equal(canMarkPaid(order, now).reason, 'expired');
});

test('canMarkPaid: boshqa holatdagi buyurtma rad etiladi', () => {
  for (const status of ['payment_detected', 'completed', 'expired', 'rejected', 'approved']) {
    assert.equal(canMarkPaid({ status }).reason, 'invalid_status', status);
  }
  assert.equal(canMarkPaid(null).reason, 'not_found');
});

test('userLink: username bo\'lsa t.me, bo\'lmasa tg://user, ism escape qilinadi', () => {
  assert.equal(
    userLink({ telegram_id: '123', username: 'ali', full_name: 'Ali <b>' }),
    '<a href="https://t.me/ali">Ali &lt;b&gt;</a>',
  );
  assert.equal(userLink({ telegram_id: '123', full_name: 'Vali' }), '<a href="tg://user?id=123">Vali</a>');
  assert.equal(userLink({ telegram_id: '123' }), '<a href="tg://user?id=123">123</a>');
  // Telegram initData ko'rinishi (id, first_name) ham ishlaydi
  assert.equal(userLink({ id: 7, first_name: 'Olim', last_name: 'X' }), '<a href="tg://user?id=7">Olim X</a>');
});

test('orderNotificationText: raqam, mijoz havolasi, summa va muddat bor', () => {
  const text = norm(orderNotificationText({
    order: { order_number: '12345', unique_price: 65154, base_price: 65000, expires_at: '2026-09-05T05:09:00Z', promo_code: 'SALE', discount_amount: 0 },
    items: [{ plan: { name: 'Canva Pro' }, quantity: 2 }],
    user: { telegram_id: '99', username: 'mijoz', full_name: 'Mijoz Ism' },
  }));
  assert.match(text, /Yangi buyurtma #12345/);
  assert.match(text, /<a href="https:\/\/t\.me\/mijoz">Mijoz Ism<\/a>/);
  assert.match(text, /Canva Pro × 2/);
  assert.match(text, /65 154 UZS/);
  assert.match(text, /Asl narx: 65 000 UZS/);
  assert.match(text, /Muddat: .*gacha/);
});

test('orderNotificationText: topup va balans turlari', () => {
  const topup = norm(orderNotificationText({ order: { order_number: '1', unique_price: 50123, topup_credit: 55000 }, kind: 'topup', user: { telegram_id: '5' } }));
  assert.match(topup, /Balans to‘ldirish so‘rovi #1/);
  assert.match(topup, /Balansga tushadi: 55 000 UZS/);
  const balance = norm(orderNotificationText({ order: { order_number: '2', balance_used: 20000 }, kind: 'balance', user: { telegram_id: '5' }, extraLines: ['Yetkazildi'] }));
  assert.match(balance, /Balansdan to‘liq to‘landi #2/);
  assert.match(balance, /20 000 UZS/);
  assert.match(balance, /Yetkazildi/);
  assert.doesNotMatch(balance, /Muddat/);
});

test('isAdminChat: sozlamalardagi admin ID tan olinadi', () => {
  assert.equal(isAdminChat({ admin_telegram_id: '777' }, 777), true);
  assert.equal(isAdminChat({ admin_telegram_id: '777' }, '778'), false);
  assert.equal(isAdminChat(null, ''), false);
});
