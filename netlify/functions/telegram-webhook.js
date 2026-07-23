const { handleHumoPaymentNotification } = require('../../shared/humo-payment-service');
const { handleReceipt, handleTextCommand } = require('../../shared/telegram');
const { getAdminClient } = require('../../shared/db');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'OK' };

  try {
    const update = JSON.parse(event.body);
    const supabase = getAdminClient();

    if (update.business_message) {
      const msg = update.business_message;
      
      // Try standard auto-payment handler first (handles "Пополнение" format)
      const payment = await handleHumoPaymentNotification({ supabase, message: msg });
      if (payment.handled) {
        return { statusCode: 200, body: 'OK' };
      }

      // Legacy fallback for explicit "Summa" messages
      if (String(msg.from?.id) === '856254490' && msg.text) {
        const match = msg.text.match(/Summa\s*([\d\s\.,]+)/i);
        if (match) {
          // Parse amount (remove spaces, replace comma with dot)
          const amountStr = match[1].replace(/\s/g, '').replace(',', '.');
          const parsedAmount = Number(amountStr);

          // Instantiate official supabase client for checks table
          const { createClient } = require('@supabase/supabase-js');
          const sbClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

          const timeLimit = new Date(Date.now() - 900 * 1000).toISOString();

          // Find active check matching the exact randomized amount
          const { data: checks, error: checkErr } = await sbClient
            .from('checks')
            .select('*')
            .eq('status', 'active')
            .eq('amount', parsedAmount)
            .gte('created_at', timeLimit)
            .limit(1);

          if (!checkErr && checks && checks.length > 0) {
            const check = checks[0];

            // Update check to 'tolandi'
            await sbClient
              .from('checks')
              .update({ status: 'tolandi' })
              .eq('id', check.id);

            // Trigger the callback URL
            const fetch = require('node-fetch');
            let postBody = check.post;
            try {
              if (typeof postBody === 'string') postBody = JSON.parse(postBody);
            } catch(e){}

            try {
              await fetch(check.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(postBody || {})
              });
            } catch (fetchErr) {
              console.error('Failed to call webhook URL', fetchErr);
            }

            // Send notification to CHANNEL_ID
            const channelId = process.env.CHANNEL_ID;
            if (channelId) {
              const textMsg = `✅ Yangi to'lov qabul qilindi!\nSumma: ${parsedAmount} UZS\nBuyurtma ID: ${check.order_id}\nCheck Code: ${check.check_code}`;
              await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: channelId, text: textMsg })
              });
            }
          } else {
            // NEW LOGIC: If no check found, it might be an order from the Web App!
            const { confirmPaymentNotification } = require('../../shared/db');
            const { processApprovedOrderDelivery } = require('../../shared/delivery-service');
            const { sendMessage } = require('../../shared/telegram');

            const confirmation = await confirmPaymentNotification(supabase, { 
              amount: parsedAmount, 
              source: 'business_message', 
              messageKey: String(msg.message_id || Date.now()) 
            });

            if (confirmation && confirmation.status === 'matched' && confirmation.order) {
               const paidOrder = confirmation.order;
               const delivery = await processApprovedOrderDelivery({ supabase, order: paidOrder, adminTelegramId: String(msg.from?.id) });
               
               // Notify Admin
               const adminChat = process.env.ADMIN_CHAT_ID || process.env.ADMIN_TELEGRAM_ID || '856254490';
               await sendMessage(adminChat, `✅ Avtomat to'lov (Business Message)!\nFoydalanuvchi: ${paidOrder.user_telegram_id}\nSumma: ${parsedAmount} UZS\nHolat: ${delivery.ok ? 'Yetkazildi ✅' : 'Xatolik ❌ - ' + delivery.message}`);
            }
          }
        }
      }
    } else if (update.message?.text?.startsWith('/start')) {
      const { sendMessage, sendMainMenu } = require('../../shared/telegram');
      const text = `Salom!\nAvto-javob botiga xush kelibsiz. Quyidagi menyudan foydalaning:`;
      await sendMessage(update.message.chat.id, text, null);
      await sendMainMenu(update.message.chat.id);
    } else if (update.message) {
      const payment = await handleHumoPaymentNotification({ supabase, message: update.message });
      if (!payment.handled) {
        const commandHandled = update.message.text ? await handleTextCommand({ supabase, message: update.message }) : false;
        if (!commandHandled) await handleReceipt({ supabase, message: update.message });
      }
    } else if (update.callback_query) {
      const { handleCallbackQuery } = require('../../shared/telegram');
      await handleCallbackQuery({ supabase, callbackQuery: update.callback_query });
    }

    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Webhook error:', error);
    return { statusCode: 200, body: 'OK' }; // Always 200 to prevent retries
  }
};