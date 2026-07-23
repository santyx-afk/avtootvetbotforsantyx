const { schedule } = require('@netlify/functions');
const { getAdminClient, request, releaseInventoryForOrder } = require('../../shared/db');
const { sendMessage, inlineKeyboard } = require('../../shared/telegram');

module.exports.handler = schedule('0 9 * * *', async (event) => {
  console.log('Running scheduled daily reminder task...');
  try {
    const supabase = getAdminClient();
    const webAppUrl = (process.env.URL || 'https://oxrgsi.netlify.app') + '/webapp/';

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
            [{ text: '🚀 Obunani uzaytirish', web_app: { url: webAppUrl } }]
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
            [{ text: '🚀 Obunani uzaytirish', web_app: { url: webAppUrl } }]
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

    // 3. Get subscriptions that expired today
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
            [{ text: '♻️ Qayta sotib olish', web_app: { url: webAppUrl } }]
          ]);

          await sendMessage(String(sub.user_telegram_id), textExpired, keyboard);

          await request(supabase, 'subscriptions', {
            query: `id=eq.${sub.id}`,
            method: 'PATCH',
            body: { status: 'expired', expired_notified: true }
          });
        } catch (e) {
          console.error(`Error processing expired notification for sub ${sub.id}:`, e);
        }
      }
    } catch (e) {
      console.error('Error fetching expired subs:', e);
    }

    // 4. Check 1-year loyalty bonus
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const oneYearStr = oneYearAgo.toISOString().split('T')[0];

      const { data: loyalUsers } = await request(supabase, 'users', {
        query: `select=*&created_at=gte.${oneYearStr}T00:00:00&created_at=lt.${oneYearStr}T23:59:59&loyalty_bonus_sent=eq.false`
      }).catch(() => ({ data: [] }));

      for (const user of (loyalUsers || [])) {
        try {
          await request(supabase, 'wallet_transactions', {
            method: 'POST',
            body: {
              user_telegram_id: String(user.telegram_id),
              amount: 10000,
              type: 'loyalty_bonus',
              description: '1 yillik sodiqlik bonusi'
            }
          });
          
          const { data: wallets } = await request(supabase, 'user_wallets', {
            query: `select=*&user_telegram_id=eq.${user.telegram_id}`
          }).catch(() => ({ data: [] }));
          
          const currentBalance = wallets?.[0]?.balance || 0;
          if (wallets?.[0]) {
            await request(supabase, 'user_wallets', {
              query: `user_telegram_id=eq.${user.telegram_id}`,
              method: 'PATCH',
              body: { balance: currentBalance + 10000 }
            });
          }
          
          await request(supabase, 'users', {
            query: `id=eq.${user.id}`,
            method: 'PATCH',
            body: { loyalty_bonus_sent: true }
          });
          
          const loyaltyText = `🎉 Tabriklaymiz! Siz 1 yildan beri bizning sodiq foydalanuvchimiz!\n\n` +
            `🎁 Sizga 10,000 so'm bonus balansingizga tushirildi!\n` +
            `💰 Yangi balansingiz: ${(currentBalance + 10000).toLocaleString()} UZS`;
          await sendMessage(String(user.telegram_id), loyaltyText);
        } catch (e) {
          console.error(`Error processing loyalty bonus for user ${user.id}:`, e);
        }
      }
    } catch (e) {
      console.error('Error fetching loyal users:', e);
    }

    // 5. Expire old pending orders (15-min cleanup)
    try {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: expiredOrders } = await request(supabase, 'orders', {
        query: `select=*&status=eq.waiting_payment&created_at=lt.${fifteenMinAgo}`
      }).catch(() => ({ data: [] }));

      for (const order of (expiredOrders || [])) {
        try {
          await request(supabase, 'orders', {
            query: `id=eq.${order.id}`,
            method: 'PATCH',
            body: { status: 'expired' }
          });
          
          if (typeof releaseInventoryForOrder === 'function') {
            await releaseInventoryForOrder(supabase, order.id).catch(() => {});
          }
          
          await sendMessage(String(order.user_telegram_id), 
            `⏰ Buyurtma #${order.order_number || order.id.slice(0,8)} muddati tugadi. To'lov summasi va zaxira bo'shatildi.`
          ).catch(() => {});
        } catch (e) {
          console.error(`Error expiring order ${order.id}:`, e);
        }
      }
    } catch (e) {
      console.error('Error fetching expired orders:', e);
    }

    console.log('Scheduled task completed successfully.');
    return { statusCode: 200 };
  } catch (error) {
    console.error('Critical error in scheduled task:', error);
    return { statusCode: 500 };
  }
});
