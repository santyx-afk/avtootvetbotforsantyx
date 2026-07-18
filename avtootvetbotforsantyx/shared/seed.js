const { request } = require('./db');

async function seedDemoData(client) {
  const { data: categories } = await request(client, 'categories', {
    method: 'POST',
    query: 'on_conflict=slug',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: [
      { slug: 'capcut', name: 'CapCut', button_label: 'CapCut', description: 'CapCut obunalari', sort_order: 1, is_active: true },
      { slug: 'canva', name: 'Canva', button_label: 'Canva', description: 'Canva Pro obunalari', sort_order: 2, is_active: true },
      { slug: 'other-subscriptions', name: 'Boshqa obunalar', button_label: 'Other subscriptions', description: 'Turli digital obunalar', sort_order: 3, is_active: true },
    ],
  });

  const capcut = categories.find((item) => item.slug === 'capcut');
  if (!capcut) return;

  const { data: parentPlans } = await request(client, 'plans', {
    method: 'POST',
    query: 'on_conflict=category_id,name,parent_plan_id',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: [
      {
        category_id: capcut.id,
        name: 'CapCut Keen',
        button_label: 'CapCut Keen',
        price: 35000,
        currency: 'UZS',
        duration: '1 oy',
        warranty_text: 'Qoidalar buzilmasa obuna davomida amal qiladi',
        description: 'CapCut Keen tarifi. Tez aktivatsiya va sodda foydalanish.',
        how_it_works_text: 'To‘lov tasdiqlangach login va parol beriladi. Asosan bitta qurilmada ishlating.',
        payment_instructions: 'Karta raqamiga to‘lov qiling va chekni yuboring.',
        sort_order: 1,
        is_active: true,
      },
      {
        category_id: capcut.id,
        name: 'CapCut Pro',
        button_label: 'CapCut Pro',
        price: 45000,
        currency: 'UZS',
        duration: 'Variantga qarab',
        warranty_text: 'Obuna muddati davomida qoidalar buzilmasa amal qiladi',
        description: 'CapCut Pro uchun variantlardan birini tanlang.',
        how_it_works_text: 'Quyidagi variantlardan birini tanlab to‘lov qiling. Tasdiqdan so‘ng kirish ma’lumoti yuboriladi.',
        payment_instructions: 'Mos variantni tanlab, to‘lovni amalga oshiring va chek yuboring.',
        sort_order: 2,
        is_active: true,
      },
    ],
  });

  const capcutPro = parentPlans.find((item) => item.name === 'CapCut Pro');
  if (!capcutPro) return;

  await request(client, 'plans', {
    method: 'POST',
    query: 'on_conflict=category_id,name,parent_plan_id',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: [
      {
        category_id: capcut.id,
        parent_plan_id: capcutPro.id,
        name: 'Browser-based CapCut Pro',
        button_label: 'Browser-based CapCut Pro',
        price: 45000,
        currency: 'UZS',
        duration: 'Admin sozlamasiga ko‘ra',
        warranty_text: 'Foydalanish qoidalari buzilmasa obuna davomida amal qiladi',
        description: 'Brauzer orqali ishlatiladigan CapCut Pro varianti.',
        how_it_works_text: 'To‘lov tasdiqlangach login va parol beriladi. Bir qurilmada ishlatish tavsiya qilinadi. Qoidalar buzilsa kafolat bekor bo‘lishi mumkin.',
        payment_instructions: 'Karta raqamiga 45 000 UZS to‘lang va chekni shu chatga yuboring.',
        sort_order: 1,
        is_active: true,
      },
      {
        category_id: capcut.id,
        parent_plan_id: capcutPro.id,
        name: '6-month CapCut Pro',
        button_label: '6 oylik CapCut Pro',
        price: 120000,
        currency: 'UZS',
        duration: '6 oy',
        warranty_text: 'Muddati davomida qoidalar buzilmasa amal qiladi',
        description: '6 oylik foydalanish uchun kengaytirilgan variant.',
        how_it_works_text: 'To‘lov tasdiqlangach aktivatsiya yo‘riqnomasi yuboriladi. Hisobni boshqalar bilan ulashmang.',
        payment_instructions: 'Karta raqamiga to‘lov qiling va chekni adminga yuboring.',
        sort_order: 2,
        is_active: true,
      },
    ],
  });

  await request(client, 'settings', {
    method: 'POST',
    query: 'on_conflict=id',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: {
      id: 1,
      seller_card_number: '8600 0000 0000 0000',
      seller_display_name: 'Demo Seller',
      admin_telegram_id: process.env.ADMIN_TELEGRAM_ID || '123456789',
      welcome_text: 'Assalomu alaykum! Obuna turini tanlang va kerakli rejani ko‘ring 👇',
      contact_text: 'To‘lovdan keyin chekni shu chatga yuboring.',
      support_link: '@demo_support',
    },
  });
}

module.exports = { seedDemoData };
