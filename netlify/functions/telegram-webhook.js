const { getAdminClient, request } = require('../../shared/db');
const { handleStart, handleCallback, handleReceipt, handleTextCommand } = require('../../shared/bot-service');
const { handleHumoPaymentNotification } = require('../../shared/humo-payment-service');
const { handleVacancyFileRelay } = require('../../shared/vacancy-bot-service');

async function isUserBlocked(supabase, telegramUserId) {
  if (!telegramUserId) return false;
  try {
    const { data } = await request(supabase, 'users', {
      query: `select=is_blocked&telegram_id=eq.${telegramUserId}&limit=1`,
    });
    return Boolean(data?.[0]?.is_blocked);
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const headerSecret = event.headers['x-telegram-bot-api-secret-token'] || event.headers['X-Telegram-Bot-Api-Secret-Token'];

  if (secret && headerSecret !== secret) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignored: 'invalid-secret' }) };
  }

  let update;
  try {
    update = JSON.parse(event.body || '{}');
  } catch (error) {
    console.error('Invalid JSON', error);
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignored: 'invalid-json' }) };
  }

  const supabase = getAdminClient();

  try {
    if (update.business_message) {
      const msg = update.business_message;
      
      // LOG TO AUDIT_LOGS for debugging
      const { createAuditLog } = require('../../shared/db');
      await createAuditLog(supabase, {
        order_id: null,
        user_telegram_id: String(msg.from?.id || 'unknown'),
        action: 'business_message_received',
        status: 'debug',
        metadata: { payload: msg }
      });

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
    } else if (update.message?.contact) {
      // Mini App requestContact orqali ulashilgan telefon raqamini saqlaymiz.
      // (Kontakt xabari matnsiz, shuning uchun uni chek deb qabul qilmaslik kerak.)
      const contact = update.message.contact;
      const fromId = String(update.message.from?.id || '');
      const isOwnContact = !contact.user_id || String(contact.user_id) === fromId;
      const digits = String(contact.phone_number || '').replace(/\D/g, '');
      if (fromId && digits && isOwnContact) {
        const { request, upsertUser } = require('../../shared/db');
        try {
          await upsertUser(supabase, update.message.from);
          await request(supabase, 'users', {
            method: 'PATCH',
            query: `telegram_id=eq.${fromId}`,
            body: { phone: `+${digits}`, updated_at: new Date().toISOString() },
          });
        } catch (e) {
          console.warn('save contact phone warn:', e?.message);
        }
      }
    } else if (update.message?.text?.startsWith('/start')) {
      const blocked = await isUserBlocked(supabase, update.message.from?.id);
      if (blocked) return { statusCode: 200, body: 'blocked' };
      await handleStart({ supabase, message: update.message });
    } else if (update.message) {
      const blocked = await isUserBlocked(supabase, update.message.from?.id);
      if (blocked) return { statusCode: 200, body: 'blocked' };
      const payment = await handleHumoPaymentNotification({ supabase, message: update.message });
      if (!payment.handled) {
        // Vakansiya fayl almashinuvi (isxodnik materiallar / tayyor ish).
        // Faqat shu oqimdagi foydalanuvchilarda `true` qaytaradi — aks holda
        // xabar pastdagi do'kon mantiqiga o'zgarishsiz o'tadi. Bu tekshiruv
        // handleReceipt'dan OLDIN turishi shart: aks holda montajorga yuborilgan
        // material chek (to'lov kvitansiyasi) deb qabul qilinardi.
        const relayed = await handleVacancyFileRelay({ supabase, message: update.message }).catch((e) => {
          console.warn('vacancy relay warn:', e?.message);
          return false;
        });
        if (!relayed) {
          const commandHandled = update.message.text ? await handleTextCommand({ supabase, message: update.message }) : false;
          if (!commandHandled) await handleReceipt({ supabase, message: update.message });
        }
      }
    } else if (update.callback_query) {
      const blocked = await isUserBlocked(supabase, update.callback_query.from?.id);
      if (blocked) return { statusCode: 200, body: 'blocked' };
      await handleCallback({ supabase, callbackQuery: update.callback_query });
    }
  } catch (error) {
    console.error('Webhook handler error', error);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};