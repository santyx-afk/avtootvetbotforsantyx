const { Telegraf, Markup } = require('telegraf');
const express = require('express');

// --- SOZLAMALAR ---
const ADMIN_ID = 1286053845; // O'zingizning ID raqamingizni yozing
const BOT_TOKEN = '8413484705:AAF9j6Q-swDUgsfObKugeNGdWv0mzFr8fm0'; 

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// --- ANALITIKA UCHUN XOTIRA ---
let users = new Map(); // {id: name} ko'rinishida saqlaydi
let clickStats = {
  capcut: 0,
  canva: 0,
  gemini: 0,
  chatgpt: 0,
  captions: 0,
  adobe: 0,
  aepr: 0
};

const PRODUCTS = {
  capcut: { name: '📱 CAPCUT PRO', desc: '📱 *CapCut Pro*...', rules: 'Email + parol...' },
  canva: { name: '🟢 CANVA PRO', desc: '🟢 *Canva Pro*...', rules: 'Email beriladi...' },
  gemini: { name: '⚡️ GEMINI AI ULTRA', desc: '⚡️ *Gemini AI*...', rules: 'Login va parol...' },
  chatgpt: { name: '⚡️ CHATGPT PLUS', desc: '⚡️ *ChatGPT Plus*...', rules: 'Login yoki Email...' },
  captions: { name: '⚡️ CAPTIONS PRO', desc: '⚡️ *Captions Pro*...', rules: 'App Store akkaunt...' },
  adobe: { name: '🎨 ADOBE CC', desc: '🎨 *Adobe CC*...', rules: 'Shaxsiy akkaunt...' },
  aepr: { name: '🎬 AE / PR', desc: '🎬 *AE / PR*...', rules: 'Shaxsiy akkaunt...' }
};

const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('📱 CapCut Pro', 'prod:capcut'), Markup.button.callback('🟢 Canva Pro', 'prod:canva')],
  [Markup.button.callback('⚡️ Gemini AI', 'prod:gemini'), Markup.button.callback('⚡️ ChatGPT Plus', 'prod:chatgpt')],
  [Markup.button.callback('⚡️ Captions Pro', 'prod:captions'), Markup.button.callback('🎨 Adobe CC', 'prod:adobe')],
  [Markup.button.callback('🎬 AE / PR', 'prod:aepr')]
]);

// --- FOYDALANUVCHI QISMI ---
bot.start((ctx) => {
  // Userni ism-sharifi bilan eslab qolish
  users.set(ctx.from.id, ctx.from.first_name || 'User');
  
  const welcomeText = "Assalomu alaykum 👋😊\n\nKerakli obunani tanlang 👇";
  return ctx.reply(welcomeText, mainMenu);
});

bot.action('start', (ctx) => {
  return ctx.editMessageText("Kerakli obunani tanlang 👇", mainMenu).catch(() => {});
});

bot.action(/^prod:(.+)$/, (ctx) => {
  const productKey = ctx.match[1];
  
  // Analitika: Qaysi tugma bosilganini hisoblash
  if (clickStats.hasOwnProperty(productKey)) {
    clickStats[productKey]++;
  }

  const p = PRODUCTS[productKey];
  ctx.editMessageText(p.desc, { 
    parse_mode: 'Markdown', 
    ...Markup.inlineKeyboard([
      [Markup.button.callback('❓ Qanday ulanadi?', `info:${productKey}`)],
      [Markup.button.callback('💳 To\'lov qilish', `pay:${productKey}`)],
      [Markup.button.callback('⬅️ Orqaga', 'start')]
    ])
  }).catch(() => {});
});

// --- ADMIN PANELI ---
bot.command('admin', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  
  ctx.reply("🛠 *Admin Paneli*:", {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📊 Statistika va Userlar', 'admin_full_stats')],
      [Markup.button.callback('📢 Rassilka', 'admin_broadcast')]
    ])
  });
});

bot.action('admin_full_stats', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.answerCbQuery();

  // 1. Click Statistika matni
  let statMsg = "📈 *Tugmalar bosilishi bo'yicha qiziqish:*\n\n";
  for (const [key, val] of Object.entries(clickStats)) {
    statMsg += `• ${key.toUpperCase()}: ${val} marta\n`;
  }

  // 2. Userlar ro'yxati (Clickable linklar bilan)
  statMsg += `\n👤 *Foydalanuvchilar (jami: ${users.size}):*\n`;
  users.forEach((name, id) => {
    statMsg += `• [${name}](tg://user?id=${id}) (ID: ${id})\n`;
  });

  statMsg += `\n_(Eslatma: Bot o'chib yonsa, bu ma'lumotlar tozalanadi)_`;

  ctx.reply(statMsg, { parse_mode: 'Markdown' });
});

// --- RASSILKA VA BOSHQALAR (Oldingi kod kabi) ---
let isBroadcasting = false;
bot.action('admin_broadcast', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  isBroadcasting = true;
  ctx.reply("📢 Rassilka matnini yuboring...");
});

bot.on('text', (ctx) => {
  if (ctx.from.id === ADMIN_ID && isBroadcasting) {
    let count = 0;
    users.forEach((name, userId) => {
      bot.telegram.sendMessage(userId, ctx.message.text).catch(() => {});
      count++;
    });
    isBroadcasting = false;
    ctx.reply(`✅ ${count} kishiga yuborildi.`);
  }
});

// Pay va Info actionlari (Oldingi kodingizdan o'zgarmaydi)
bot.action(/^info:(.+)$/, (ctx) => {
  const p = PRODUCTS[ctx.match[1]];
  ctx.editMessageText(p.rules, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', `prod:${ctx.match[1]}`)]]) }).catch(() => {});
});

bot.action(/^pay:(.+)$/, (ctx) => {
  const p = PRODUCTS[ctx.match[1]];
  const payText = `💳 *To‘lov:* \`4067 0700 0282 0160\`\nTo'lovdan so'ng @santyx ga yozing.`;
  ctx.editMessageText(payText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', `prod:${ctx.match[1]}`)]]) }).catch(() => {});
});

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Admin panel active.'));
app.listen(PORT, () => { bot.launch(); });
