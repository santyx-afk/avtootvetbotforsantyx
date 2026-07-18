const { setWebhook } = require('../../shared/telegram');

exports.handler = async () => {
  try {
    const url = `${process.env.APP_BASE_URL}/.netlify/functions/telegram-webhook`;
    const result = await setWebhook(url, process.env.TELEGRAM_WEBHOOK_SECRET);
    return { statusCode: 200, body: JSON.stringify({ ok: true, result }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error.message }) };
  }
};
