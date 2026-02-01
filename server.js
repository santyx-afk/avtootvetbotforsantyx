const { Telegraf, Markup } = require('telegraf');
const express = require('express');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// --- STATIC DATA ---
const PRODUCTS = {
  capcut: { name: 'CapCut Pro', price: '$10/mo', desc: 'Professional video editing with all pro features unlocked.', rules: 'Login via account credentials provided after payment.' },
  canva: { name: 'Canva Pro', price: '$8/mo', desc: 'Unlock premium templates, brand kits, and magic resize.', rules: 'Added to a Pro team via your email address.' },
  gemini: { name: 'Gemini AI Ultra', price: '$20/mo', desc: 'Google\'s most capable AI model for complex tasks.', rules: 'Shared or private account options available.' },
  chatgpt: { name: 'ChatGPT Plus', price: '$20/mo', desc: 'Access to GPT-4o, DALL-E, and priority access.', rules: 'Direct login to premium account.' },
  captions: { name: 'Captions Pro', price: '$12/mo', desc: 'AI-powered talking videos with automated captions.', rules: 'Invite link or login provided.' },
  adobe: { name: 'Adobe Creative Cloud', price: '$35/mo', desc: '20+ apps including Photoshop, Illustrator, and more.', rules: 'Subscription applied to your personal Adobe ID.' },
  aepr: { name: 'AE / PR', price: '$25/mo', desc: 'After Effects & Premiere Pro bundle for pro editors.', rules: 'Individual app licenses via Creative Cloud.' }
};

// --- KEYBOARDS ---
const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('CapCut', 'prod:capcut'), Markup.button.callback('Canva Pro', 'prod:canva')],
  [Markup.button.callback('Gemini AI', 'prod:gemini'), Markup.button.callback('ChatGPT', 'prod:chatgpt')],
  [Markup.button.callback('Captions', 'prod:captions'), Markup.button.callback('Adobe Creative Cloud', 'prod:adobe')],
  [Markup.button.callback('AE / PR', 'prod:aepr')]
]);

const getProductMenu = (id) => Markup.inlineKeyboard([
  [Markup.button.callback('How does it work?', `info:${id}`)],
  [Markup.button.callback('💳 Pay with Card', `pay:${id}`)],
  [Markup.button.callback('⬅️ Back', 'start')]
]);

const backButton = (target) => Markup.inlineKeyboard([
  [Markup.button.callback('⬅️ Back', target)]
]);

// --- BOT LOGIC ---
bot.start((ctx) => {
  const text = "👋 Welcome to our Subscription Store!\n\nPlease select a service below to see pricing and details:";
  if (ctx.updateType === 'callback_query') {
    return ctx.editMessageText(text, mainMenu);
  }
  return ctx.reply(text, mainMenu);
});

// Handle Product Selection
bot.action(/^prod:(.+)$/, (ctx) => {
  const productId = ctx.match[1];
  const product = PRODUCTS[productId];
  const text = `🛒 *${product.name}*\n\n📝 *Description:* ${product.desc}\n💰 *Price:* ${product.price}`;
  ctx.editMessageText(text, { parse_mode: 'Markdown', ...getProductMenu(productId) });
});

// Handle "How does it work?"
bot.action(/^info:(.+)$/, (ctx) => {
  const productId = ctx.match[1];
  const product = PRODUCTS[productId];
  const text = `❓ *How to connect ${product.name}*\n\n${product.rules}\n\n✅ 100% Secure & Official access.`;
  ctx.editMessageText(text, { parse_mode: 'Markdown', ...backButton(`prod:${productId}`) });
});

// Handle "Card" Payment
bot.action(/^pay:(.+)$/, (ctx) => {
  const productId = ctx.match[1];
  const product = PRODUCTS[productId];
  const text = `💳 *Payment Details*\n\n*Card number:* \`4067 0700 0282 0160\`\n*Owner:* Toirov R\n\n⚠️ *Action Required:*\n1. Send the payment receipt to @santyx\n2. Mention that you want: *${product.name}*`;
  ctx.editMessageText(text, { parse_mode: 'Markdown', ...backButton(`prod:${productId}`) });
});

// Back to Start handler
bot.action('start', (ctx) => ctx.editMessageText("👋 Welcome back! Select a service:", mainMenu));

// --- WEBHOOK SETUP ---
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RAILWAY_STATIC_URL || process.env.URL; // Railway provides this

app.use(express.json());
app.use(bot.webhookCallback('/webhook'));

app.get('/', (req, res) => res.send('Bot is running!'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);
});
