const { setWebhook, setMyCommands } = require('../../shared/telegram');
const { requireAdmin } = require('../../shared/auth');

// Foydalanuvchi "/" bosganda chiqadigan menyu. Admin buyruqlari (/admin,
// /addpromo, /promos) ataylab ro'yxatga kiritilmagan — ular ochiq menyuda
// ko'rinmasligi kerak.
const PUBLIC_COMMANDS = [
  { command: 'start', description: 'Bosh menyu va katalog' },
  { command: 'balance', description: 'Balansim va keshbek' },
  { command: 'ref', description: "Referal havolam — do'st taklif qilish" },
  { command: 'help', description: 'Yordam va buyruqlar' },
];

// Faqat admin chaqira oladi: ilgari bu manzil hamma uchun ochiq edi va istalgan
// odam Telegram API kvotasini sarflab, xato matnidan sozlama ma'lumotini
// ko'ra olardi.
exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
  }
  try {
    const url = `${process.env.APP_BASE_URL}/.netlify/functions/telegram-webhook`;
    const result = await setWebhook(url, process.env.TELEGRAM_WEBHOOK_SECRET);
    const commands = await setMyCommands(PUBLIC_COMMANDS);
    return { statusCode: 200, body: JSON.stringify({ ok: true, result, commands }) };
  } catch (error) {
    console.error('set-webhook error', error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'server_error' }) };
  }
};
