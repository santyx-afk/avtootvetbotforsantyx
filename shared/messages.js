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
  return [
    `<b>${escapeHtml(plan.name)}</b> uchun to‘lov`,
    '',
    `Karta raqami: <code>${escapeHtml(settings?.seller_card_number || 'Kiritilmagan')}</code>`,
    `Qabul qiluvchi: <b>${escapeHtml(settings?.seller_display_name || 'Kiritilmagan')}</b>`,
    '',
    escapeHtml(plan.paymentInstructions || settings?.contact_text || 'To‘lovni amalga oshirib, chek rasmini shu yerga yuboring. Tekshiruvdan so‘ng login ma’lumotlari yoki aktivatsiya yo‘riqnomasi yuboriladi.'),
    '',
    `Yordam: ${escapeHtml(settings?.support_link || '@support')}`,
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
};
