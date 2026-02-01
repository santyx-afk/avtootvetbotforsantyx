const { Telegraf, Markup } = require('telegraf');
const express = require('express');

// --- SOZLAMALAR ---
const BOT_TOKEN = 'TOKENNI_SHU_YERGA_YOZING'; // <--- Tokenni shu yerga qo'ying
const bot = new Telegraf(BOT_TOKEN);
const app = express();

const PRODUCTS = {
  capcut: { name: 'CapCut Pro', price: '$10/mo', desc: 'Professional video editing.', rules: 'Login credentials provided.' },
  canva: { name: 'Canva Pro', price: '$8/mo', desc: 'Premium templates & brand kits.', rules: 'Added via email team invite.' },
  gemini: { name: 'Gemini AI Ultra', price: '$20/mo', desc: 'Google\'s most capable AI.', rules: 'Shared/Private account.' },
  chatgpt: { name: 'ChatGPT Plus', price: '$20/mo', desc: 'Access to GPT-4o & DALL-E.', rules: 'Direct account login.' },
  captions: { name: 'Captions Pro', price: '$12/mo', desc: 'AI talking video captions.', rules: 'Invite link provided.' },
  adobe: { name: 'Adobe Creative Cloud', price: '$35/mo', desc: 'All 20+ Adobe apps.', rules: 'Applied to your Adobe ID.' },
  aepr: { name: 'AE / PR', price: '$25/mo', desc: 'After Effects & Premiere Pro.', rules: 'Creative Cloud licenses.' }
};

const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('CapCut', 'prod:capcut'), Markup.button.callback('Canva Pro', 'prod:canva')],
  [Markup.button.callback('Gemini AI', 'prod:gemini'), Markup.button.callback('ChatGPT', 'prod:chatgpt')],
  [Markup.button.callback('Captions', 'prod:captions'), Markup.button.callback('Adobe CC', 'prod:adobe')],
  [Markup.button.callback('AE / PR', 'prod:aepr')]
]);

// --- BOT LOGIC ---
bot.start((ctx) => {
  const msg = "👋 Xush kelibsiz! Kerakli xizmatni tanlang:";
  return ctx.updateType === 'callback_query' ? ctx.editMessageText(msg, mainMenu) : ctx.reply(msg, mainMenu);
});

bot.action(/^prod:(.+)$/, (ctx) => {
  const p = PRODUCTS[ctx.match[1]];
  const text = `🛒 *${p.name}*\n\n📝 ${p.desc}\n💰 Narxi: ${p.price}`;
  ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
    [Markup.button.callback('Qanday ulanadi?', `info:${ctx.match[1]}`)],
    [Markup.button.callback('💳 To\'lov qilish', `pay:${ctx.match[1]}`)],
    [Markup.button.callback('⬅️ Orqaga', 'start')]
  ])});
});

bot.action(/^info:(.+)$/, (ctx) => {
  const p = PRODUCTS[ctx.match[1]];
  ctx.editMessageText(`❓ *Ma'lumot:* ${p.rules}`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', `prod:${ctx.match[1]}`)]])});
});

bot.action(/^pay:(.+)$/, (ctx) => {
  const p = PRODUCTS[ctx.match[1]];
  const text = `💳 *To'lov ma'lumotlari*\n\nKarta: \`4067 0700 0282 0160\`\nEga: Toirov R\n\nTo'lovdan so'ng chekni @santyx ga yuboring va "${p.name}" deb yozing.`;
  ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', `prod:${ctx.match[1]}`)]])});
});

bot.action('start', (ctx) => ctx.editMessageText("👋 Xizmatni tanlang:", mainMenu));

// --- RAILWAY UCHUN SERVER ---
const PORT = process.env.PORT || 3000;
app.use(express.json());
// Webhook ishlamasa, pollingga o'tish uchun:
bot.launch(); 
app.get('/', (req, res) => res.send('Bot is online!'));
app.listen(PORT, () => console.log(`Server port: ${PORT}`));
