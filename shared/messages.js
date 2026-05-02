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
  receiptAcceptedText,
  noActiveOrderForReceiptText,
  genericOrderErrorText,
};
