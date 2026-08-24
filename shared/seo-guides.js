// Qo'llanma maqolalari — /qollanma/<slug>.
//
// Bu sahifalarning maqsadi: qidiruvda va AI javoblarida chiqish. Buning uchun
// matn HAQIQATAN foydali bo'lishi kerak — faqat reklama bo'lsa na Google
// yuqoriga chiqaradi, na AI keltiradi. Shu sabab muqobil yo'llar ham halol
// yozilgan, o'z xizmatimiz esa ular qatoridagi variantlardan biri sifatida
// ko'rsatilgan.
//
// Matn shu yerda saqlanadi (bazada emas): maqola kamdan-kam o'zgaradi va
// git tarixida ko'rinib turgani ma'qul.

const GUIDES = {
  'ozbekistondan-tolash': {
    title: "O'zbekistondan xalqaro obunalarga qanday to'lash mumkin",
    metaTitle: "O'zbekistondan xalqaro obunaga qanday to'lash — barcha yo'llar | santyx",
    description:
      "Humo va Uzcard xalqaro to'lovlarni qabul qilmaydi. Canva, Adobe, CapCut kabi "
      + "obunalarga O'zbekistondan to'lashning barcha yo'llari, narxi va xavfsizlik qoidalari.",
    updated: '2026-08-24',
    lede:
      "Canva Pro, Adobe yoki CapCut Pro obunasini olmoqchi bo'lgan har bir o'zbekistonlik "
      + "bir xil devorga uriladi: karta to'lovni rad etadi. Quyida nima uchun shunday "
      + "bo'lishi va qanday yo'llar borligi — har birining haqiqiy kamchiligi bilan.",

    sections: [
      {
        h: "Nega Humo va Uzcard ishlamaydi",
        p: [
          "Humo va Uzcard — ichki to'lov tizimlari. Ular O'zbekiston ichida ishlaydi, "
          + "lekin xalqaro savdo tarmog'iga ulanmagan. Canva yoki Adobe to'lovni Visa yoki "
          + "Mastercard tarmog'i orqali qabul qiladi, shuning uchun Humo karta raqamini "
          + "kiritganda to'lov shunchaki o'tmaydi.",
          "Ba'zan Visa/Mastercard logotipi bor o'zbek kartasi ham rad etiladi. Sabablari "
          + "har xil: kartada xalqaro to'lov yoqilmagan, valyuta hisobi yo'q, yoki xizmat "
          + "o'sha mamlakatda rasman ishlamaydi. Shuning uchun \"kartam bor-ku\" degan "
          + "fikr har doim ham to'g'ri chiqmaydi.",
        ],
      },
      {
        h: "1-yo'l · Bankdan xalqaro karta ochish",
        p: [
          "Eng to'g'ri yo'l — bankdan xalqaro to'lovga ochiq Visa yoki Mastercard olish. "
          + "Ko'p o'zbek banklari buni taklif qiladi.",
          "Kamchiliklari: kartani ochish va valyuta hisobini to'ldirish vaqt oladi, "
          + "konvertatsiya kursi va komissiya qo'shiladi, ba'zi banklarda oylik xalqaro "
          + "to'lov limiti bor. Bundan tashqari ayrim xizmatlar mintaqa bo'yicha to'lovni "
          + "baribir rad etishi mumkin.",
          "Kimga to'g'ri keladi: doimiy va ko'p obunalarga to'laydiganlarga.",
        ],
      },
      {
        h: "2-yo'l · Virtual karta xizmatlari",
        p: [
          "Internetda xalqaro to'lovlar uchun virtual karta beruvchi xizmatlar bor. "
          + "Ular karta raqamini beradi, siz uni to'ldirasiz va onlayn to'laysiz.",
          "Kamchiliklari: har to'ldirishda komissiya, kurs farqi, hisobni tasdiqlash "
          + "talablari. Eng muhimi — bunday xizmatlarning bir qismi ishonchsiz. Pulingiz "
          + "muzlatib qo'yilsa, murojaat qiladigan joy bo'lmaydi.",
          "Kimga to'g'ri keladi: texnik jihatdan tayyor va xatarni tushunadiganlarga.",
        ],
      },
      {
        h: "3-yo'l · Chet eldagi tanish orqali",
        p: [
          "Chet elda yashovchi tanishingiz o'z kartasi bilan to'laydi, siz unga pulni "
          + "beryapsiz. Bepul va tez.",
          "Kamchiliklari: har safar odamni bezovta qilish kerak, obuna uzaytirilganda "
          + "yana o'sha muammo, va akkaunt boshqa odam kartasiga bog'lanib qoladi.",
        ],
      },
      {
        h: "4-yo'l · Tayyor obuna sotib olish",
        p: [
          "O'zbekistonda raqamli obuna sotadigan do'konlar bor. Siz mahalliy karta bilan "
          + "so'mda to'laysiz, ular obunani sizga ulab beradi. Xalqaro karta, "
          + "konvertatsiya va limitlar bilan ishingiz bo'lmaydi.",
          "Kamchiligi: sotuvchiga ishonish kerak. Bozorda kafolatsiz sotuvchilar ham bor — "
          + "obuna bir hafta ishlab, keyin o'chib qoladi va pul qaytmaydi.",
          "Kimga to'g'ri keladi: bir-ikki obuna kerak bo'lgan va ortiqcha ovoragarchilik "
          + "istamaganlarga.",
        ],
      },
      {
        h: "Sotuvchini qanday tekshirish kerak",
        bullets: [
          "<strong>Kafolat muddati yozilganmi.</strong> \"Kafolat bor\" degan gap emas, "
          + "aniq muddat: 30 kun, 1 yil. Yozilmagan bo'lsa — kafolat yo'q.",
          "<strong>Obuna qanday ulanadi.</strong> Sizning emailingizga ulanadimi yoki "
          + "tayyor akkaunt beriladimi. Ikkalasi ham bo'ladi, lekin oldindan aytilishi kerak.",
          "<strong>Narx haddan tashqari arzonmi.</strong> Rasmiy narxdan 20 barobar arzon "
          + "obuna odatda o'g'irlangan yoki tez o'chadigan akkaunt bo'ladi.",
          "<strong>Aloqa kanali borligi.</strong> Muammo chiqqanda yozadigan joy — "
          + "Telegram akkaunti, kanal, sayt. Faqat bitta shaxsiy akkaunt bo'lsa ehtiyot bo'ling.",
          "<strong>Oldindan to'liq to'lov so'ralsa</strong>, avval kichikroq obunadan "
          + "boshlab sinab ko'ring.",
        ],
      },
    ],

    faq: [
      {
        q: "Humo karta bilan Canva Pro sotib olsa bo'ladimi?",
        a: "To'g'ridan-to'g'ri Canva saytida — yo'q, chunki Humo xalqaro tarmoqqa ulanmagan. "
          + "Lekin O'zbekistondagi sotuvchi orqali so'mda to'lab, obunani olish mumkin: "
          + "bu holda siz mahalliy o'tkazma qilasiz, xalqaro to'lovni sotuvchi bajaradi.",
      },
      {
        q: "Xalqaro kartam yo'q. Adobe obunasini qanday olaman?",
        a: "Ikki yo'l bor: bankdan xalqaro to'lovga ochiq Visa/Mastercard olish, yoki "
          + "O'zbekistondagi do'kondan tayyor obuna sotib olish. Ikkinchisi tezroq — "
          + "so'mda to'lanadi va odatda bir necha daqiqada ulanadi.",
      },
      {
        q: "Bunday obunalar qonuniymi?",
        a: "Bu sotuvchiga bog'liq. Rasmiy obunalar asosida ishlaydigan (masalan jamoa "
          + "litsenziyasi yoki ta'lim rejasi orqali) sotuvchilar bor, o'g'irlangan akkaunt "
          + "sotadiganlar ham bor. Kafolat va ulanish usuli so'ralganda aniq javob "
          + "beradigan sotuvchini tanlang.",
      },
      {
        q: "Obuna o'chib qolsa nima bo'ladi?",
        a: "Yaxshi sotuvchi kafolat muddati ichida almashtiradi yoki pulni qaytaradi. "
          + "Shuning uchun sotib olishdan oldin kafolat shartlarini yozma ko'rinishda "
          + "olib qo'ying.",
      },
      {
        q: "Qancha vaqtda ulanadi?",
        a: "Tayyor akkaunt beriladigan obunalar odatda bir necha daqiqada keladi. "
          + "Sizning emailingizga ulanadigan obunalar (Canva jamoa, Adobe) biroz ko'proq "
          + "vaqt olishi mumkin — odatda 10–15 daqiqa.",
      },
    ],

    // Maqola oxiridagi halol taklif — reklama emas, variantlardan biri.
    closing: {
      h: "Bizda qanday",
      p: [
        "santyx — yuqoridagi 4-yo'l bo'yicha ishlaydigan do'kon. So'mda, Humo yoki Uzcard "
        + "bilan to'laysiz; obuna Telegram bot orqali avtomatik yetkaziladi. Har bir "
        + "obunaning kafolat muddati va ulanish usuli mahsulot sahifasida yozilgan — "
        + "sotib olishdan oldin o'qib chiqishingiz mumkin.",
      ],
    },
  },
};

module.exports = { GUIDES };
