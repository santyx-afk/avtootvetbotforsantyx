const fetch = require('node-fetch');

exports.handler = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await res.json();
    return { statusCode: 200, body: JSON.stringify(data, null, 2) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};