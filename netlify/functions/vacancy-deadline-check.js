const { schedule } = require('@netlify/functions');
const { getAdminClient } = require('../../shared/db');
const { expirePaymentWindows, checkDeadlines } = require('../../shared/vacancy-order-service');

// Har 10 daqiqada: to'lov oynalari muddati va order deadline'lari tekshiriladi.
// - payment_pending (10 daq) muddati o'tsa → order bekor
// - final_payment_pending (3 kun) muddati o'tsa → bekor, 40% ishchiga
// - deadline'ga 20% qolganda → ishchiga ogohlantirish
// - deadline o'tsa → mijozga tanlov (kutaman / bekor qilish)
module.exports.handler = schedule('*/10 * * * *', async () => {
  const supabase = getAdminClient();

  let expiredPayments = 0;
  let deadlines = { warned: 0, expired: 0 };

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
    `vacancy-deadline-check: ${expiredPayments} to'lov oynasi yopildi, ` +
      `${deadlines.warned} ogohlantirish, ${deadlines.expired} deadline o'tdi`,
  );

  return { statusCode: 200 };
});
