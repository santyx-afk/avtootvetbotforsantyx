const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// Referal payout pul harakati — tartib va idempotentlik alohida tekshiriladi:
// 2026-08-23 da jarayon o'rtada uzilib pul to'langan-u hisob yozuvlari
// qolmagan edi (takror to'lov xavfi). Yangi tartibda avval da'vo (claim),
// keyin pul, Telegram xabari esa eng oxirida.

function makeRef(extra = {}) {
  return {
    referrer_telegram_id: '100',
    referred_telegram_id: '200',
    status: 'registered',
    total_earned: 0,
    purchase_count: 0,
    first_order_id: null,
    ...extra,
  };
}

const ORDER = { id: 'o1', user_telegram_id: '200', base_price: 64990, amount: 43005 };

function loadService({ percent = 10, fixedBonus = 5000, claimTaken = false, refRow = makeRef() } = {}) {
  const seq = [];
  const wallet = [];
  const patches = [];
  const audits = [];
  const messages = [];
  const state = { signupClaimUsed: false };

  const fakeDb = {
    async request(_client, table, { method = 'GET', query = '', body } = {}) {
      if (table === 'referrals' && method === 'GET') {
        return { data: refRow ? [refRow] : [] };
      }
      if (table === 'referral_payouts' && method === 'POST') {
        seq.push('claim');
        // ignore-duplicates: band bo'lsa bo'sh massiv qaytadi
        return { data: claimTaken ? [] : [{ ...body }] };
      }
      if (table === 'referrals' && method === 'PATCH') {
        // signup bonus da'vosi: NULL bo'yicha atomik PATCH — bir marta o'tadi
        if (query.includes('signup_bonus_at=is.null')) {
          seq.push('signup-claim');
          if (state.signupClaimUsed || !refRow || refRow.status === 'cancelled') return { data: [] };
          state.signupClaimUsed = true;
          return { data: [{ ...refRow }] };
        }
        seq.push('patch');
        patches.push(body);
        return { data: null };
      }
      throw new Error(`kutilmagan so'rov: ${table} ${method}`);
    },
    async fetchSettings() {
      return { referral_percent: percent, referral_fixed_bonus: fixedBonus };
    },
    async addWalletTransaction(_client, item) {
      seq.push('wallet');
      wallet.push(item);
      return { wallet: { balance: 0 } };
    },
    async createAuditLog(_client, item) {
      seq.push('audit');
      audits.push(item);
      return null;
    },
  };
  const fakeTelegram = {
    async sendMessage(chatId, text) {
      seq.push('msg');
      messages.push({ chatId, text });
    },
  };

  const originalLoad = Module._load;
  Module._load = function (request) {
    if (request === './db') return fakeDb;
    if (request === './telegram') return fakeTelegram;
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve('../shared/referral-service')];
  const mod = require('../shared/referral-service');
  Module._load = originalLoad;
  return { mod, seq, wallet, patches, audits, messages };
}

test('to\'liq oqim: da\'vo → pul → hisob → audit → xabar (aynan shu tartibda)', async () => {
  const { mod, seq, wallet, patches, audits, messages } = loadService();
  await mod.processReferralPayout(null, ORDER);

  assert.deepStrictEqual(seq, ['claim', 'wallet', 'patch', 'audit', 'msg']);

  // Bonus base_price dan hisoblanadi (amount emas): floor(64990 * 10%) = 6499
  assert.strictEqual(wallet.length, 1);
  assert.strictEqual(wallet[0].amount, 6499);
  assert.strictEqual(wallet[0].type, 'referral');
  assert.strictEqual(wallet[0].user_telegram_id, '100');
  // Umumiy "balans o'zgardi" xabari o'chiq — maxsus xabar o'zimizniki
  assert.strictEqual(wallet[0].notify, false);

  assert.strictEqual(patches[0].status, 'rewarded');
  assert.strictEqual(patches[0].total_earned, 6499);
  assert.strictEqual(patches[0].purchase_count, 1);
  assert.strictEqual(patches[0].first_order_id, 'o1');

  assert.strictEqual(audits[0].action, 'referral_payout');
  assert.strictEqual(messages[0].chatId, '100');
  assert.ok(messages[0].text.includes('6'), 'xabarda summa bo\'lishi kerak');
});

test('da\'vo band bo\'lsa (allaqachon to\'langan) — pul qayta to\'lanmaydi', async () => {
  const { mod, seq, wallet, patches, messages } = loadService({ claimTaken: true });
  await mod.processReferralPayout(null, ORDER);
  assert.deepStrictEqual(seq, ['claim']);
  assert.strictEqual(wallet.length, 0);
  assert.strictEqual(patches.length, 0);
  assert.strictEqual(messages.length, 0);
});

test('foiz 0 bo\'lsa hech narsa qilinmaydi (da\'vo ham yozilmaydi)', async () => {
  const { mod, seq } = loadService({ percent: 0 });
  await mod.processReferralPayout(null, ORDER);
  assert.deepStrictEqual(seq, []);
});

test('bekor qilingan (cancelled) referalga bonus to\'lanmaydi', async () => {
  const { mod, seq } = loadService({ refRow: makeRef({ status: 'cancelled' }) });
  await mod.processReferralPayout(null, ORDER);
  assert.deepStrictEqual(seq, []);
});

test('referal yozuvi bo\'lmasa jim chiqib ketadi', async () => {
  const { mod, seq } = loadService({ refRow: null });
  await mod.processReferralPayout(null, ORDER);
  assert.deepStrictEqual(seq, []);
});

test('oldingi hisob ustiga qo\'shiladi (ikkinchi xarid)', async () => {
  const { mod, patches } = loadService({
    refRow: makeRef({ status: 'rewarded', total_earned: 5000, purchase_count: 2, first_order_id: 'old' }),
  });
  await mod.processReferralPayout(null, ORDER);
  assert.strictEqual(patches[0].total_earned, 11499);
  assert.strictEqual(patches[0].purchase_count, 3);
  assert.strictEqual(patches[0].first_order_id, 'old', 'birinchi buyurtma o\'zgarmasligi kerak');
});

// --- Signup bonus: faqat raqam tasdiqlangach (2026-08-27 nakrutkasidan keyin) ---

test('signup bonus: da\'vo bir marta o\'tadi, ikkinchi chaqiriq to\'lamaydi', async () => {
  const { mod, wallet, patches, messages } = loadService();
  const paid = await mod.payReferralSignupBonus(null, '200');
  assert.strictEqual(paid, 5000);
  assert.strictEqual(wallet.length, 1);
  assert.strictEqual(wallet[0].user_telegram_id, '100', 'bonus referrerga tushishi kerak');
  assert.strictEqual(wallet[0].amount, 5000);
  assert.strictEqual(wallet[0].type, 'referral');
  assert.strictEqual(wallet[0].notify, false);
  assert.strictEqual(patches[0].total_earned, 5000);
  assert.strictEqual(messages.length, 1);

  // Poyga/takror: da'vo band — hech narsa to'lanmaydi
  const second = await mod.payReferralSignupBonus(null, '200');
  assert.strictEqual(second, null);
  assert.strictEqual(wallet.length, 1);
});

test('signup bonus: sozlamada 0 bo\'lsa da\'vo ham yozilmaydi', async () => {
  const { mod, seq, wallet } = loadService({ fixedBonus: 0 });
  const paid = await mod.payReferralSignupBonus(null, '200');
  assert.strictEqual(paid, null);
  assert.deepStrictEqual(seq, []);
  assert.strictEqual(wallet.length, 0);
});

test('signup bonus: bekor qilingan yoki mavjud bo\'lmagan referalga to\'lanmaydi', async () => {
  const cancelled = loadService({ refRow: makeRef({ status: 'cancelled' }) });
  assert.strictEqual(await cancelled.mod.payReferralSignupBonus(null, '200'), null);
  assert.strictEqual(cancelled.wallet.length, 0);

  const missing = loadService({ refRow: null });
  assert.strictEqual(await missing.mod.payReferralSignupBonus(null, '200'), null);
  assert.strictEqual(missing.wallet.length, 0);
});
