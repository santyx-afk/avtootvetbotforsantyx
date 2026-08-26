function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(price, currency) {
  const amount = new Intl.NumberFormat('uz-UZ').format(Number(price || 0));
  return `${amount} ${currency || 'UZS'}`.trim();
}

function welcomeText(settings) {
  return settings?.welcome_text || 'Assalomu alaykum! Kerakli obunani tanlang 👇';
}

function categoriesText() {
  return 'Quyidagi obunalardan birini tanlang:';
}

function planListText(category) {
  return `<b>${escapeHtml(category.name)}</b> bo‘limi uchun rejalardan birini tanlang:`;
}

function planDetailText(plan) {
  return [
    `<b>${escapeHtml(plan.name)}</b>`,
    `Narx: <b>${escapeHtml(formatPrice(plan.price, plan.currency))}</b>`,
    `Muddat: ${escapeHtml(plan.duration || 'Admin tomonidan belgilanadi')}`,
    `Kafolat: ${escapeHtml(plan.warrantyText || 'Obuna qoidalari buzilmasa amal qiladi')}`,
    '',
    escapeHtml(plan.description || 'Ushbu tarif bo‘yicha batafsil ma’lumot admin tomonidan to‘ldiriladi.'),
  ].join('\n');
}

function howItWorksText(plan) {
  return [
    `<b>${escapeHtml(plan.name)}</b>`,
    '',
    escapeHtml(plan.howItWorksText || 'To‘lov tasdiqlangach login va parol yuboriladi. Bir qurilmada ishlatish tavsiya etiladi. Qoidalar buzilsa kafolat bekor bo‘lishi mumkin.'),
  ].join('\n');
}

function paymentText(plan, settings) {
  const envCardNumber = process.env.PAYMENT_CARD_NUMBER;
  const envCardOwner = process.env.PAYMENT_CARD_OWNER;
  const envInstructions = process.env.PAYMENT_INSTRUCTIONS;
  const envSupport = process.env.SUPPORT_USERNAME;
  return [
    `<b>${escapeHtml(plan.name)}</b> uchun to‘lov`,
    '',
    `Karta raqami: <code>${escapeHtml(settings?.seller_card_number || envCardNumber || 'Kiritilmagan')}</code>`,
    `Qabul qiluvchi: <b>${escapeHtml(settings?.seller_display_name || envCardOwner || 'Kiritilmagan')}</b>`,
    '',
    escapeHtml(plan.paymentInstructions || settings?.contact_text || envInstructions || 'To‘lovni amalga oshirib, chek rasmini shu yerga yuboring. Tekshiruvdan so‘ng login ma’lumotlari yoki aktivatsiya yo‘riqnomasi yuboriladi.'),
    '',
    `Yordam: ${escapeHtml(settings?.support_link || envSupport || '@support')}`,
  ].join('\n');
}

function receiptForwardCaption(ctx) {
  return [
    '<b>Yangi to‘lov cheki</b>',
    `Mijoz: ${escapeHtml(ctx.fullName || 'Noma’lum')}`,
    `Username: ${escapeHtml(ctx.username || '-')}`,
    `User ID: <code>${escapeHtml(ctx.telegramId)}</code>`,
    `Kategoriya: ${escapeHtml(ctx.categoryName || '-')}`,
    `Reja: ${escapeHtml(ctx.planName || '-')}`,
    `Vaqt: ${escapeHtml(ctx.timestamp)}`,
  ].join('\n');
}

function orderCreatedText(order) {
  return [
    '✅ Buyurtma yaratildi.',
    `Buyurtma raqami: <code>${escapeHtml(order?.orderNumber || '-')}</code>`,
    'To‘lovni amalga oshirib, chekni shu chatga yuboring.',
  ].join('\n');
}

function paymentInstructionsWithOrderText({ order, plan, settings, fallback = {} }) {
  const cardNumber = settings?.seller_card_number || fallback.cardNumber || 'Kiritilmagan';
  const cardOwner = settings?.seller_display_name || fallback.cardOwner || 'Kiritilmagan';
  const instructions = plan?.paymentInstructions || settings?.contact_text || fallback.instructions || 'To‘lov qilib, chekni yuboring.';
  const support = settings?.support_link || fallback.support || '@support';
  return [
    'Buyurtmangiz yaratildi.',
    '',
    `Buyurtma raqami: <code>${escapeHtml(order?.orderNumber || '-')}</code>`,
    `<b>${escapeHtml(plan?.name || 'Obuna')}</b>`,
    `To‘lov summasi: <b>${escapeHtml(formatPrice(plan?.price, plan?.currency || 'UZS'))}</b>`,
    '',
    `Karta: <code>${escapeHtml(cardNumber)}</code>`,
    `Karta egasi: <b>${escapeHtml(cardOwner)}</b>`,
    '',
    escapeHtml(instructions),
    '',
    `Yordam: ${escapeHtml(support)}`,
    'To‘lov qilgandan so‘ng chek rasmini yoki PDF faylni shu chatga yuboring.',
  ].join('\n');
}


function cartText(items = []) {
  if (!items.length) return '🛒 Savatchangiz bo‘sh.';
  const lines = ['🛒 <b>Savatchangiz</b>', ''];
  let total = 0;
  for (const item of items) {
    const qty = Number(item.quantity || 1);
    const price = Number(item.plan?.price || item.unit_price || 0) * qty;
    total += price;
    lines.push(`<b>${escapeHtml(item.plan?.name || 'Mahsulot')}</b>${qty > 1 ? ` x ${qty}` : ''}`);
    lines.push(escapeHtml(formatPrice(price, item.plan?.currency || 'UZS')));
    lines.push('');
  }
  lines.push('----------------');
  lines.push('');
  lines.push(`Jami: <b>${escapeHtml(formatPrice(total, 'UZS'))}</b>`);
  return lines.join('\n');
}

function autoPaymentInstructionsText({ order, items = [], settings, fallback = {} }) {
  const cardNumber = settings?.seller_card_number || fallback.cardNumber || 'Kiritilmagan';
  const cardOwner = settings?.seller_display_name || fallback.cardOwner || 'Kiritilmagan';
  const support = settings?.support_link || fallback.support || '@support';
  const expires = order?.expires_at ? new Date(order.expires_at).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }) : '-';
  return [
    'Buyurtmangiz yaratildi.',
    '',
    `Buyurtma raqami: <code>${escapeHtml(order?.order_number || order?.orderNumber || '-')}</code>`,
    ...items.map((item) => `• ${escapeHtml(item.plan?.name || 'Mahsulot')} x ${Number(item.quantity || 1)}`),
    '',
    'To‘lov summasi:',
    `<b>${escapeHtml(formatPrice(order?.unique_price || order?.amount || 0, 'UZS'))}</b>`,
    '',
    '⚠️ <b>Muhim!</b>',
    'Faqat aynan shu summani yuboring.',
    `${escapeHtml(formatPrice(order?.base_price || 0, 'UZS'))} yuborsangiz tizim to‘lovni avtomatik aniqlay olmaydi.`,
    'Bunday holatda akkaunt avtomatik berilmaydi.',
    'Admin bilan bog‘lanishingiz kerak bo‘ladi.',
    '',
    `Karta: <code>${escapeHtml(cardNumber)}</code>`,
    `Karta egasi: <b>${escapeHtml(cardOwner)}</b>`,
    `Muddat: ${escapeHtml(expires)}`,
    `Yordam: ${escapeHtml(support)}`,
  ].join('\n');
}


function balanceText(wallet = {}) {
  return [`💰 <b>Balansingiz</b>`, '', `Mavjud balans: <b>${escapeHtml(formatPrice(wallet.balance || 0, 'UZS'))}</b>`, '', 'Balansdan checkout paytida foydalanish, refund va bonuslar uchun wallet tarixi saqlanadi.'].join('\n');
}

// Shartlar sozlamalardan keladi (referral_fixed_bonus / referral_percent) —
// qiymatlar berilmasa umumiy matn chiqadi, eski chaqiruvlar buzilmaydi.
function referralText({ telegramId, botUsername, fixedBonus = 0, percent = 0 }) {
  const username = String(botUsername || 'santyxnarxbot').replace('@', '');
  const perks = [];
  if (Number(fixedBonus) > 0) perks.push(`har bir yangi do‘st uchun +${Number(fixedBonus).toLocaleString('uz-UZ')} UZS`);
  if (Number(percent) > 0) perks.push(`uning har bir xaridi uchun ${Number(percent)}% bonus`);
  return [
    '🤝 <b>Referral havolangiz</b>',
    '',
    `https://t.me/${escapeHtml(username)}?start=ref_${escapeHtml(telegramId)}`,
    '',
    perks.length
      ? `Havolani do‘stlaringizga ulashing: ${perks.join(', ')} balansingizga tushadi.`
      : 'Do‘stlaringizni taklif qiling va bonuslarga ega bo‘ling.',
  ].join('\n');
}

function receiptAcceptedText(order) {
  return [
    'Chekingiz qabul qilindi ✅',
    `Buyurtma: <code>${escapeHtml(order?.orderNumber || '-')}</code>`,
    'Admin tekshiruvdan so‘ng sizga javob beradi.',
  ].join('\n');
}

function noActiveOrderForReceiptText() {
  return 'Faol buyurtma topilmadi. Avval obunani tanlab, to‘lov bo‘limiga o‘ting.';
}

function genericOrderErrorText() {
  return 'Buyurtma jarayonida xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko‘ring.';
}

function helpText(settings) {
  const envSupport = process.env.SUPPORT_USERNAME;
  const support = settings?.support_link || envSupport || '@support';
  return [
    'ℹ️ <b>Yordam</b>',
    '',
    'Mavjud buyruqlar:',
    '/start — bosh menyu va katalog',
    '/balance — balansingiz va keshbek',
    '/ref — referal havolangiz (do‘st taklif qilib bonus oling)',
    '/help — shu yordam xabari',
    '',
    `Savol yoki muammo bo‘lsa: ${escapeHtml(support)}`,
  ].join('\n');
}

module.exports = {
  escapeHtml,
  formatPrice,
  welcomeText,
  categoriesText,
  planListText,
  planDetailText,
  howItWorksText,
  paymentText,
  receiptForwardCaption,
  orderCreatedText,
  paymentInstructionsWithOrderText,
  cartText,
  autoPaymentInstructionsText,
  balanceText,
  referralText,
  receiptAcceptedText,
  noActiveOrderForReceiptText,
  genericOrderErrorText,
  helpText,
};
