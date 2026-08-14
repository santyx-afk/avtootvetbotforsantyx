const { setWebhook, setMyCommands } = require('../../shared/telegram');

// Foydalanuvchi "/" bosganda chiqadigan menyu. Admin buyruqlari (/admin,
// /addpromo, /promos) ataylab ro'yxatga kiritilmagan — ular ochiq menyuda
// ko'rinmasligi kerak.
const PUBLIC_COMMANDS = [
  { command: 'start', description: 'Bosh menyu va katalog' },
  { command: 'balance', description: 'Balansim va keshbek' },
  { command: 'ref', description: "Referal havolam — do'st taklif qilish" },
  { command: 'help', description: 'Yordam va buyruqlar' },
];

exports.handler = async () => {
  try {
    const url = `${process.env.APP_BASE_URL}/.netlify/functions/telegram-webhook`;
    const result = await setWebhook(url, process.env.TELEGRAM_WEBHOOK_SECRET);
    const commands = await setMyCommands(PUBLIC_COMMANDS);
    return { statusCode: 200, body: JSON.stringify({ ok: true, result, commands }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error.message }) };
  }
};
