const { schedule } = require('@netlify/functions');
const { getAdminClient, request, releaseInventoryForOrder } = require('../../shared/db');
const { sendMessage, inlineKeyboard } = require('../../shared/telegram');

module.exports.handler = schedule('0 9 * * *', async (event) => {
  console.log('Running scheduled daily reminder task...');
  try {
    const supabase = getAdminClient();
    // 1. Get subscriptions ending in 3 days
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0];

    try {
      const { data: expiring3d } = await request(supabase, 'subscriptions', {
        query: `select=*&status=eq.active&end_date=eq.${threeDaysStr}&reminder_3d_sent=eq.false`
      }).catch(() => ({ data: [] }));

      for (const sub of (expiring3d || [])) {
        try {
          const text3d = `⚡️ Obunangiz 3 kunda tugaydi!\n\n` +
            `📦 ${sub.plan_name || 'Obuna'}\n` +
            `📅 Tugash sanasi: ${sub.end_date}\n\n` +
            `Hozir uzaytirsangiz hisobingizga 10% keshbek beriladi! 🎁`;

          const keyboard = inlineKeyboard([
            [{ text: '🚀 Obunani uzaytirish', callback_data: 'start' }]
          ]);

          await sendMessage(String(sub.user_telegram_id), text3d, keyboard);

          await request(supabase, 'subscriptions', {
            query: `id=eq.${sub.id}`,
            method: 'PATCH',
            body: { reminder_3d_sent: true }
          });
        } catch (e) {
          console.error(`Error processing 3d reminder for sub ${sub.id}:`, e);
        }
      }
    } catch (e) {
      console.error('Error fetching 3d expiring subs:', e);
    }

    // 2. Get subscriptions ending in 1 day
    const oneDayFromNow = new Date();
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);
    const oneDayStr = oneDayFromNow.toISOString().split('T')[0];

    try {
      const { data: expiring1d } = await request(supabase, 'subscriptions', {
        query: `select=*&status=eq.active&end_date=eq.${oneDayStr}&reminder_1d_sent=eq.false`
      }).catch(() => ({ data: [] }));

      for (const sub of (expiring1d || [])) {
        try {
          const text1d = `⏰ Diqqat! Obunangiz ERTAGA tugaydi!\n\n` +
            `📦 ${sub.plan_name || 'Obuna'}\n` +
            `📅 Tugash sanasi: ${sub.end_date}\n\n` +
            `Hozir uzaytirsangiz hisobingizga 10% keshbek beriladi! 🎁`;

          const keyboard = inlineKeyboard([
            [{ text: '🚀 Obunani uzaytirish', callback_data: 'start' }]
          ]);

          await sendMessage(String(sub.user_telegram_id), text1d, keyboard);

          await request(supabase, 'subscriptions', {
            query: `id=eq.${sub.id}`,
            method: 'PATCH',
            body: { reminder_1d_sent: true }
          });
        } catch (e) {
          console.error(`Error processing 1d reminder for sub ${sub.id}:`, e);
        }
      }
    } catch (e) {
      console.error('Error fetching 1d expiring subs:', e);
    }

    // 3. Expire today's subscriptions
    const today = new Date().toISOString().split('T')[0];
    try {
      const { data: expiredToday } = await request(supabase, 'subscriptions', {
        query: `select=*&status=eq.active&end_date=eq.${today}&expired_notified=eq.false`
      }).catch(() => ({ data: [] }));

      for (const sub of (expiredToday || [])) {
        try {
          const textExpired = `❌ Obunangiz tugadi!\n\n` +
            `📦 ${sub.plan_name || 'Obuna'}\n\n` +
            `Arxivdan 1-bosishda qayta sotib olishingiz mumkin 👇`;

          const keyboard = inlineKeyboard([
            [{ text: '🔄 Qayta sotib olish', callback_data: 'start' }]
          ]);

          await sendMessage(String(sub.user_telegram_id), textExpired, keyboard);

          await request(supabase, 'subscriptions', {
            query: `id=eq.${sub.id}`,
            method: 'PATCH',
            body: { status: 'expired', expired_notified: true }
          });
        } catch (e) {
          console.error(`Error processing expired sub ${sub.id}:`, e);
        }
      }
    } catch (e) {
      console.error('Error fetching expired subs:', e);
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Daily reminder processed' }) };
  } catch (error) {
    console.error('Scheduled task error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
});
