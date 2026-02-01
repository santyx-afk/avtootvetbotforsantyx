const { Telegraf, Markup } = require('telegraf');
const express = require('express');

// --- TOKENNI SHU YERGA QO'YING ---
const BOT_TOKEN = '8413484705:AAF9j6Q-swDUgsfObKugeNGdWv0mzFr8fm0'; // <--- O'zingiznikini qo'ying
const bot = new Telegraf(BOT_TOKEN);
const app = express();

const PRODUCTS = {
  capcut: { name: 'CapCut Pro', price: '120,000 so\'m', desc: 'Professional video montaj imkoniyatlari.', rules: 'Login va parol beriladi.' },
  canva: { name: 'Canva Pro', price: '50,000 so\'m', desc: 'Premium dizayn va shablonlar.', rules: 'Emailingizga taklifnoma yuboriladi.' },
  gemini: { name: 'Gemini AI Ultra', price: '200,000 so\'m', desc: 'Google-ning eng kuchli AI modeli.', rules: 'Akkountga kirish ruxsati beriladi.' },
  chatgpt: { name: 'ChatGPT Plus', price: '250,000 so\'m', desc: 'GPT-4o va DALL-E imkoniyatlari.', rules: 'Tayyor akkount beriladi.' },
  captions: { name: 'Captions Pro', price: '100,000 so\'m', desc: 'AI orqali subtitrlar yaratish.', rules: 'Maxsus havola orqali ulanadi.' },
  adobe: { name: 'Adobe Creative Cloud', price: '400,000 so\'m', desc: 'Photoshop, Premiere Pro va boshqalar.', rules: 'Sizning shaxsiy Adobe ID-ingizga ulanadi.' },
  aepr: { name: 'AE / PR', price: '300,000 so\'m', desc: 'After Effects va Premiere Pro paketi.', rules: 'Adobe CC litsenziyasi.' }
};

const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('CapCut', 'prod:capcut'), Markup.button.callback('Canva Pro', 'prod:canva')],
  [Markup.button.callback('Gemini AI', 'prod:gemini'), Markup.button.callback('ChatGPT', 'prod:chatgpt')],
  [Markup.button.callback('Captions', 'prod:captions'), Markup.button.callback('Adobe CC', 'prod:adobe')],
  [Markup.button.callback('AE / PR', 'prod:aepr')]
], { columns: 2 });

// --- BOT LOGIKASI ---
bot.start((ctx) => {
  const text = "👋 Xush kelibsiz! Kerakli xizmatni tanlang:";
  return ctx.reply(text, mainMenu);
});

bot.action('start', (ctx) => {
  return ctx.editMessageText("👋 Xizmatni tanlang:", mainMenu).catch(() => {});
});

bot.action(/^prod:(.+)$/, (ctx) => {
  const p = PRODUCTS[ctx.match[1]];
  const text = `🛒 *${p.name}*\n\n📝 ${p.desc}\n💰 Narxi: ${p.price}`;
  ctx.editMessageText(text, { 
    parse_mode: 'Markdown', 
    ...Markup.inlineKeyboard([
      [Markup.button.callback('❓ Qanday ulanadi?', `info:${ctx.match[1]}`)],
      [Markup.button.callback('💳 To\'lov qilish', `pay:${ctx.match[1]}`)],
      [Markup.button.callback('⬅️ Orqaga', 'start')]
    ])
  }).catch(() => {});
});

bot.action(/^info:(.+)$/, (ctx) => {
  const p = PRODUCTS[ctx.match[1]];
  ctx.editMessageText(`❓ *Ma'lumot:* ${p.rules}`, { 
    parse_mode: 'Markdown', 
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', `prod:${ctx.match[1]}`)]])
  }).catch(() => {});
});

bot.action(/^pay:(.+)$/, (ctx) => {
  const p = PRODUCTS[ctx.match[1]];
  const text = `💳 *To'lov ma'lumotlari*\n\nKarta: \`4067 0700 0282 0160\`\nEga: Toirov R\n\nTo'lovdan so'ng chekni @santyx ga yuboring va "${p.name}" deb yozing.`;
  ctx.editMessageText(text, { 
    parse_mode: 'Markdown', 
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', `prod:${ctx.match[1]}`)]])
  }).catch(() => {});
});

// --- RAILWAY UCHUN DOIMIY ISHLASH ---
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot ishlamoqda...'));
app.listen(PORT, () => {
    console.log(`Server ${PORT}-portda yondi`);
    bot.launch(); // Polling rejimida ishga tushirish
});

// Xatoliklarni ushlash (Crashed bo'lmasligi uchun)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
