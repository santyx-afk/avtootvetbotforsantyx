const { Telegraf, Markup } = require('telegraf');
const express = require('express');

// --- TOKENNI SHU YERGA QO'YING ---
const BOT_TOKEN = '8413484705:AAF9j6Q-swDUgsfObKugeNGdWv0mzFr8fm0'; 
const bot = new Telegraf(BOT_TOKEN);
const app = express();

const PRODUCTS = {
  capcut: { 
    name: '📱 CAPCUT PRO', 
    price: '45.000 so‘m', 
    desc: '📱 *CapCut Pro*\n\n💰 Narxi: 45.000 so‘m\n📆 Obuna muddati: 35 kun\n✅ 30 kun ishlashi kafolatlanadi\n❌ Yillik obuna mavjud emas', 
    rules: '📱 *CapCut Pro qanday ulanadi?*\n\n🔐 Email + parol orqali ulanadi.\n📱 Faqat 1 ta qurilma uchun (telefon, planshet, Mac yoki PC).\n\n⛔️ Boshqa qurilmalardan kirish taqiqlanadi.\n⚠️ Qoida buzilsa kafolat bekor qilinadi.\n\n⏱ To‘lovdan so‘ng akkaunt 10–15 daqiqa ichida beriladi.' 
  },
  canva: { 
    name: '🟢 CANVA PRO', 
    price: '120.000 so‘m', 
    desc: '🟢 *Canva Pro*\n\n💰 Narxi: 120.000 so‘m\n📆 Obuna muddati: 1 yil\n👤 Shaxsiy akkauntingizga ulanadi', 
    rules: '🟢 *Canva Pro qanday ulanadi?*\n\n📧 Canva hisobingizga ulangan EMAIL manzilni taqdim qilasiz.\n\n🎨 1 yillik Canva Pro obunasi aynan shu akkauntingizga ulanadi.\n\n⚠️ EMAIL noto‘g‘ri berilsa qaytarish imkonsiz.' 
  },
  gemini: { 
    name: '⚡️ GEMINI AI ULTRA', 
    price: '290.000 so‘m', 
    desc: '⚡️ *Gemini AI Ultra*\n\n💰 Narxi: 290.000 so‘m\n📆 Obuna muddati: 1 oy\n💳 45.000 kredit (Flow & Whisk)\n🎥 Flow orqali 2000+ video yaratish imkoniyati mavjud', 
    rules: '⚡️ *Gemini AI qanday ulanadi?*\n\n🔐 Login va parol beriladi.\n👥 O‘z qurilmangizdan yoki jamoadoshlaringiz qurilmalaridan ulanish mumkin.\n\n✅ Obuna butun davr davomida kafolatlanadi.\n⏱ To‘lovdan so‘ng 5–35 daqiqa ichida tayyor bo‘ladi.' 
  },
  chatgpt: { 
    name: '⚡️ CHATGPT PLUS', 
    price: '110.000 so‘m', 
    desc: '⚡️ *ChatGPT Plus*\n\n💰 Narxi: 110.000 so‘m\n📆 Obuna muddati: 1 oy\n👤 Hisob raqam shaxsiy bo‘ladi', 
    rules: '⚡️ *ChatGPT Plus qanday ulanadi?*\n\n🔐 Login va parol beriladi yoki o‘zingizning EMAIL’ingizga ulanadi.\n\n👥 Bir nechta qurilmadan foydalanish mumkin.\n\n⏱ To‘lovdan so‘ng:\n— 5–35 daqiqa (tayyor akkaunt)\n— 1–24 soat (EMAIL orqali ulansa)' 
  },
  captions: { 
    name: '⚡️ CAPTIONS PRO', 
    price: '55.000 / 300.000 so‘m', 
    desc: '⚡️ *Captions Pro*\n\n💰 Narxi:\n— 55.000 so‘m (1 oylik)\n— 300.000 so‘m (1 yillik)\n👤 Hisob raqam shaxsiy bo‘ladi', 
    rules: '⚡️ *Captions Pro qanday ulanadi?*\n\n🔐 App Store login va paroli beriladi.\n📱 Faqat 1 ta qurilmadan foydalanish mumkin.\n\n✅ Obuna butun davr davomida kafolatlanadi.\n⏱ To‘lovdan so‘ng 5–15 daqiqa ichida tayyor bo‘ladi.\n\n⚠️ Qoida buzilsa kafolat to‘xtatiladi.' 
  },
  adobe: { 
    name: '🎨 ADOBE CC', 
    price: '155.000 so‘m', 
    desc: '🎨 *Adobe Creative Cloud*\n\n💰 Narxi:\n— 155.000 so‘m (oylik)\n— Yillik obuna: kelishiladi\n📦 20+ ta Adobe ilovalari mavjud', 
    rules: '🎨 *Adobe Creative Cloud qanday ulanadi?*\n\n🔐 To‘liq shaxsiy akkaunt beriladi.\n📧 Xohlasangiz EMAIL’ingizga ulanadi (1–5 soat ichida).\n\n⏱ Tayyor akkaunt: 5–15 daqiqa.\n✅ Obuna butun davr davomida kafolatlanadi.' 
  },
  aepr: { 
    name: '🎬 AE / PR', 
    price: '155.000 so‘m', 
    desc: '🎬 *AE / PR (After Effects & Premiere Pro)*\n\n💰 Narxi:\n— 155.000 so‘m (oylik)\n— Yillik obuna: kelishiladi', 
    rules: '🎬 *AE / PR qanday ulanadi?*\n\n🔐 To‘liq shaxsiy akkaunt beriladi.\n📧 EMAIL’ingizga ulash mumkin.\n\n⏱ 5–15 daqiqa ichida tayyor bo‘ladi.\n✅ Obuna kafolatlanadi.' 
  }
};

const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('📱 CapCut Pro', 'prod:capcut'), Markup.button.callback('🟢 Canva Pro', 'prod:canva')],
  [Markup.button.callback('⚡️ Gemini AI', 'prod:gemini'), Markup.button.callback('⚡️ ChatGPT Plus', 'prod:chatgpt')],
  [Markup.button.callback('⚡️ Captions Pro', 'prod:captions'), Markup.button.callback('🎨 Adobe CC', 'prod:adobe')],
  [Markup.button.callback('🎬 AE / PR', 'prod:aepr')]
]);

bot.start((ctx) => {
  const welcomeText = "Assalomu alaykum 👋😊\n\nBu bot sizga narxlar va batafsil ma’lumot berish uchun yaratilgan.\n\nKerakli obunani quyidagi ro‘yxatdan tanlashingiz mumkin 👇";
  return ctx.reply(welcomeText, mainMenu);
});

bot.action('start', (ctx) => {
  return ctx.editMessageText("Kerakli obunani quyidagi ro‘yxatdan tanlashingiz mumkin 👇", mainMenu).catch(() => {});
});

bot.action(/^prod:(.+)$/, (ctx) => {
  const p = PRODUCTS[ctx.match[1]];
  ctx.editMessageText(p.desc, { 
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
  ctx.editMessageText(p.rules, { 
    parse_mode: 'Markdown', 
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', `prod:${ctx.match[1]}`)]])
  }).catch(() => {});
});

bot.action(/^pay:(.+)$/, (ctx) => {
  const p = PRODUCTS[ctx.match[1]];
  const payText = `💳 *To‘lov uchun karta ma’lumotlari:*\n\n\`4067 0700 0282 0160\`\n👤 *Egasi:* Toirov R\n\n⚠️ Iltimos, to‘lovdan so‘ng *CHEKNI* tashlashni unutmang.\n\n📩 Chekni botga emas, @santyx ga yuborasiz.\n✍️ Chek bilan birga qaysi obuna kerakligini yozing (*${p.name}*).`;
  ctx.editMessageText(payText, { 
    parse_mode: 'Markdown', 
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', `prod:${ctx.match[1]}`)]])
  }).catch(() => {});
});

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(PORT, () => {
    console.log(`Working on ${PORT}`);
    bot.launch();
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
