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
    if (update.message?.text?.startsWith('/start')) {
      await handleStart({ supabase, message: update.message });
    } else if (update.callback_query) {
      await handleCallback({ supabase, callbackQuery: update.callback_query });
    } else if (update.message) {
      const payment = await handleHumoPaymentNotification({ supabase, message: update.message });
      if (!payment.handled) {
        const commandHandled = update.message.text ? await handleTextCommand({ supabase, message: update.message }) : false;
        if (!commandHandled) await handleReceipt({ supabase, message: update.message });
      }
    }
  } catch (error) {
    console.error('Webhook handler error', error);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
