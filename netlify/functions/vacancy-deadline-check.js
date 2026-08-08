const { schedule } = require('@netlify/functions');
const { getAdminClient } = require('../../shared/db');
const { warnExpiringPayments, expirePaymentWindows, checkDeadlines } = require('../../shared/vacancy-order-service');

// Har 5 daqiqada: to'lov oynalari va order deadline'lari tekshiriladi.
// Davr 10 → 5 daqiqaga qisqartirildi: ogohlantirish o'z vaqtida ketishi va
// bekor qilish muddatdan keyin kechikmasligi uchun.
// - to'lov muddati tugayapti → mijozga eslatma (bir marta)
// - payment_pending muddati o'tsa → order bekor
// - final_payment_pending (3 kun) muddati o'tsa → bekor, 40% ishchiga
// - deadline'ga 20% qolganda → ishchiga ogohlantirish
// - deadline o'tsa → mijozga tanlov (kutaman / bekor qilish)
module.exports.handler = schedule('*/5 * * * *', async () => {
  const supabase = getAdminClient();

  let warnedPayments = 0;
  let expiredPayments = 0;
  let deadlines = { warned: 0, expired: 0 };

  // Ogohlantirish bekor qilishdan OLDIN ishlaydi — aks holda order
  // eslatma yetib bormasdan yopilib ketishi mumkin.
  try {
    warnedPayments = await warnExpiringPayments(supabase);
  } catch (error) {
    console.error('vacancy warnExpiringPayments error:', error?.message);
  }

  try {
    expiredPayments = await expirePaymentWindows(supabase);
  } catch (error) {
    console.error('vacancy expirePaymentWindows error:', error?.message);
  }

  try {
    deadlines = await checkDeadlines(supabase);
  } catch (error) {
    console.error('vacancy checkDeadlines error:', error?.message);
  }

  console.log(
    `vacancy-deadline-check: ${warnedPayments} to'lov eslatmasi, ` +
      `${expiredPayments} to'lov oynasi yopildi, ` +
      `${deadlines.warned} deadline ogohlantirishi, ${deadlines.expired} deadline o'tdi`,
  );

  return { statusCode: 200 };
});
