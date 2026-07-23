const { getAdminClient } = require('../../shared/db');
const { handleStart, handleCallback, handleReceipt, handleTextCommand } = require('../../shared/bot-service');
const { handleHumoPaymentNotification } = require('../../shared/humo-payment-service');

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
    // 1. Agar foydalanuvchi /start bossa
    if (update.message?.text?.startsWith('/start')) {
      await handleStart({ supabase, message: update.message });
    } 
    // 2. Agar menyudagi tugmalar bosilsa
    else if (update.callback_query) {
      await handleCallback({ supabase, callbackQuery: update.callback_query });
    } 
    // 3. Oddiy xabar, Humo cheklari yoki Business xabar kelsa
    else {
      let incomingMessage = update.message || update.business_message || update.channel_post;
      
      if (incomingMessage) {
        // MUAMMO HAL QILINDI: Eski "checks" bloki o'chirildi. 
        // Endi to'g'ridan-to'g'ri "orders" jadvali bilan ishlovchi funksiya ishga tushadi:
        const payment = await handleHumoPaymentNotification({ supabase, message: incomingMessage });
        
        if (!payment.handled) {
          const commandHandled = incomingMessage.text ? await handleTextCommand({ supabase, message: incomingMessage }) : false;
          if (!commandHandled) await handleReceipt({ supabase, message: incomingMessage });
        }
      }
    }
  } catch (error) {
    console.error('Webhook handler error', error);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
