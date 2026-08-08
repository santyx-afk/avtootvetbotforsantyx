const test = require('node:test');
const assert = require('node:assert/strict');

// Muhit o'zgaruvchilari modul yuklanishidan OLDIN o'rnatilishi kerak —
// oyna uzunligi modul darajasida hisoblanadi.
delete process.env.VACANCY_FIRST_PAYMENT_MINUTES;
delete process.env.PAYMENT_EXPIRES_MINUTES;

const {
  FIRST_PAYMENT_WINDOW_MS,
  FINAL_PAYMENT_WINDOW_MS,
  FIRST_PAYMENT_WARNING_MS,
  FINAL_PAYMENT_WARNING_MS,
} = require('../shared/vacancy-order-service');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

test('REGRESSION: first payment window is 30 minutes, not the old aggressive 10', () => {
  // 10 daqiqa juda qisqa edi — mijoz kartaga o'tkazishga ulgurmasdan
  // order bekor bo'lardi. Do'kondagi standart (30 daq) bilan tenglashtirildi.
  assert.equal(FIRST_PAYMENT_WINDOW_MS, 30 * MINUTE);
  assert.ok(FIRST_PAYMENT_WINDOW_MS > 10 * MINUTE, 'eski 10 daqiqadan uzunroq bo‘lishi kerak');
});

test('final payment window stays at 3 days', () => {
  assert.equal(FINAL_PAYMENT_WINDOW_MS, 72 * HOUR);
});

test('warning fires before the window closes, with room to act', () => {
  // Ogohlantirish oynadan qisqaroq bo'lishi shart, aks holda u hech qachon
  // ishlamaydi (oyna ochilishi bilanoq yuborilib ketardi).
  assert.ok(FIRST_PAYMENT_WARNING_MS < FIRST_PAYMENT_WINDOW_MS, 'birinchi to‘lov ogohlantirishi');
  assert.ok(FINAL_PAYMENT_WARNING_MS < FINAL_PAYMENT_WINDOW_MS, 'yakuniy to‘lov ogohlantirishi');

  // Cron har 5 daqiqada ishlaydi — ogohlantirish oynasi undan kengroq bo'lsin,
  // aks holda tekshiruvlar orasida o'tkazib yuborilishi mumkin.
  const CRON_MS = 5 * MINUTE;
  assert.ok(FIRST_PAYMENT_WARNING_MS >= CRON_MS, 'ogohlantirish oynasi cron davridan kichik bo‘lmasin');
});

test('warning leaves a usable grace period after it is sent', () => {
  const graceAfterWarning = FIRST_PAYMENT_WINDOW_MS - FIRST_PAYMENT_WARNING_MS;
  assert.ok(graceAfterWarning >= 15 * MINUTE, 'ogohlantirishgacha kamida 15 daqiqa o‘tsin');
  assert.equal(FIRST_PAYMENT_WARNING_MS, 10 * MINUTE);
});
