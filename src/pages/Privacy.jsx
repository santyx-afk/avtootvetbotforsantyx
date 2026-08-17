import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from './Privacy.module.css';

const SUPPORT = (import.meta.env.VITE_SUPPORT_USERNAME || 'santyx').replace(/^@/, '');
const BOT = (import.meta.env.VITE_BOT_USERNAME || 'santyxnarxbot').replace(/^@/, '');

// Oxirgi tahrir sanasi — hujjat mazmuni o'zgarganda qo'lda yangilanadi.
const UPDATED = '13.08.2026';

// Maxfiylik siyosati. Til — o'zbekcha (landing bilan bir xil).
// Mazmun kodda haqiqatda yig'iladigan ma'lumotlarga asoslangan; yangi maydon
// yoki yangi uchinchi tomon xizmati qo'shilsa, shu sahifa ham yangilanishi shart.
export default function Privacy() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Maxfiylik siyosati — santyx';
    window.scrollTo(0, 0);
    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} to="/">
          ← Bosh sahifa
        </Link>
      </header>

      <main className={styles.doc}>
        <h1 className={styles.title}>Maxfiylik siyosati</h1>
        <p className={styles.updated}>Oxirgi yangilanish: {UPDATED}</p>

        <p className={styles.lead}>
          Ushbu hujjat SANTYX PRO xizmati (santyx.uz sayti, <b>@{BOT}</b> Telegram boti va uning
          ichidagi ilova) foydalanuvchilarning qanday ma&apos;lumotlarini yig&apos;ishini, nima
          uchun ishlatishini va ularni qanday himoya qilishini tushuntiradi.
        </p>

        <section className={styles.section}>
          <h2 className={styles.h2}>1. Qanday ma&apos;lumotlar yig&apos;iladi</h2>

          <h3 className={styles.h3}>1.1. Telegram hisobingizdan</h3>
          <p>
            Botni yoki ilovani ochganingizda Telegram bizga hisobingizning ochiq
            ma&apos;lumotlarini uzatadi: Telegram ID raqami, foydalanuvchi nomi (username), ism va
            interfeys tili. Bu ma&apos;lumotlarsiz sizni tanib, buyurtmangizni yetkazib bo&apos;lmaydi.
          </p>

          <h3 className={styles.h3}>1.2. Siz o&apos;zingiz kiritadigan ma&apos;lumotlar</h3>
          <ul className={styles.list}>
            <li>
              <b>Telefon raqami</b> — buyurtma va qo&apos;llab-quvvatlash uchun. Telegram orqali
              ulashasiz yoki qo&apos;lda kiritasiz.
            </li>
            <li>
              <b>Vakansiya bo&apos;limi (ishchi sifatida)</b> — ism, telefon raqami, kategoriya
              (montaj/dizayn), tajriba, portfolio havolalari, o&apos;zingiz haqingizdagi matn, ish
              vaqti va e&apos;lonlaringiz matni.
            </li>
            <li>
              <b>Sharh va murojaatlar</b> — mahsulotga qoldirgan bahoyingiz va yozgan matningiz.
            </li>
          </ul>

          <h3 className={styles.h3}>1.3. Xizmatdan foydalanish jarayonida</h3>
          <ul className={styles.list}>
            <li>Buyurtmalar tarixi: tanlangan xizmat, summa, holat va sana.</li>
            <li>Balans, promokod va referal bonuslari bo&apos;yicha yozuvlar.</li>
            <li>
              To&apos;lov bildirishnomasi ma&apos;lumotlari: summa va vaqt. <b>Karta raqamingiz
              bizga kelib tushmaydi va saqlanmaydi</b> — to&apos;lov har bir buyurtmaga beriladigan
              noyob summa orqali aniqlanadi.
            </li>
          </ul>

          <h3 className={styles.h3}>1.4. Texnik ma&apos;lumotlar</h3>
          <p>
            Server so&apos;rovlari va xatoliklar texnik jurnallarda qayd etiladi (so&apos;rov vaqti,
            amal turi, xatolik matni). Bu jurnallar nosozlikni topish uchun kerak.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>2. Cookie va brauzer xotirasi</h2>
          <p>
            Saytda <b>reklama va uchinchi tomon kuzatuv (analytics) kodlari ishlatilmaydi</b>.
            Brauzeringizda faqat saytning ishlashi uchun zarur ma&apos;lumotlar saqlanadi:
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nima saqlanadi</th>
                  <th>Nima uchun</th>
                  <th>Turi</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Kirish tokeni</td>
                  <td>Har safar qaytadan login qilmasligingiz uchun</td>
                  <td>localStorage</td>
                </tr>
                <tr>
                  <td>Til, mavzu (yorug&apos;/tungi)</td>
                  <td>Tanlovingizni eslab qolish</td>
                  <td>localStorage</td>
                </tr>
                <tr>
                  <td>Savat, sevimlilar, oxirgi ko&apos;rilganlar</td>
                  <td>Sahifani yangilaganda yo&apos;qolmasligi uchun</td>
                  <td>localStorage</td>
                </tr>
                <tr>
                  <td>Tanishtiruv oynasi ko&apos;rilgani</td>
                  <td>Uni qayta ko&apos;rsatmaslik uchun</td>
                  <td>localStorage</td>
                </tr>
                <tr>
                  <td>Ushbu bildirishnoma tasdiqlangani</td>
                  <td>Pastdagi xabarni qayta ko&apos;rsatmaslik uchun</td>
                  <td>localStorage</td>
                </tr>
                <tr>
                  <td>Katalog keshi</td>
                  <td>Sahifa tezroq ochilishi uchun</td>
                  <td>sessionStorage</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Bularning barchasini brauzer sozlamalaridan (sayt ma&apos;lumotlarini tozalash) istalgan
            vaqtda o&apos;chirishingiz mumkin. O&apos;chirsangiz tizimdan chiqasiz va savatingiz
            bo&apos;shaydi, boshqa oqibati yo&apos;q.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>3. Ma&apos;lumotlar nima uchun ishlatiladi</h2>
          <ul className={styles.list}>
            <li>Buyurtmani qabul qilish, to&apos;lovni aniqlash va xizmatni yetkazib berish.</li>
            <li>Obuna muddati tugashi haqida eslatma yuborish.</li>
            <li>Qo&apos;llab-quvvatlash: savolingizga javob berish, muammoni hal qilish.</li>
            <li>
              Vakansiya bo&apos;limida e&apos;loningizni ko&apos;rsatish va sizni mijoz bilan
              bog&apos;lash.
            </li>
            <li>Firibgarlik va qoidabuzarlikning oldini olish.</li>
          </ul>
          <p>
            Ma&apos;lumotlaringiz reklama maqsadida ishlatilmaydi va sotilmaydi.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>4. Kim ko&apos;ra oladi</h2>
          <ul className={styles.list}>
            <li>
              <b>Xizmat xodimlari</b> — buyurtmani bajarish va qo&apos;llab-quvvatlash uchun zarur
              bo&apos;lgan hajmda.
            </li>
            <li>
              <b>Boshqa foydalanuvchilar</b> — faqat vakansiya bo&apos;limida: ishchi sifatida
              ro&apos;yxatdan o&apos;tsangiz, ismingiz, kategoriyangiz, tajribangiz, portfolio
              havolalaringiz, ish vaqtingiz va e&apos;loningiz ochiq ko&apos;rinadi.{' '}
              <b>Telefon raqamingiz faqat siz profilda &laquo;ko&apos;rinsin&raquo; deb
              belgilagan bo&apos;lsangiz</b> ko&apos;rsatiladi.
            </li>
            <li>
              <b>Texnik xizmat ko&apos;rsatuvchilar</b> — sayt va ma&apos;lumotlar bazasi
              joylashgan platformalar (Netlify — hosting, Supabase — ma&apos;lumotlar bazasi) hamda
              xabar yetkazish uchun Telegram. Ular ma&apos;lumotni faqat xizmatni ishlatish uchun
              qayta ishlaydi.
            </li>
            <li>
              <b>Davlat organlari</b> — faqat qonun talab qilgan hollarda.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>5. Qancha vaqt saqlanadi</h2>
          <p>
            Hisobingiz faol bo&apos;lgan davrda saqlanadi. Buyurtma va to&apos;lovga oid yozuvlar
            hisob-kitob talablari uchun undan keyin ham qolishi mumkin. Vakansiya e&apos;lonini
            arxivga olsangiz u katalogdan chiqadi, &laquo;Butunlay o&apos;chirish&raquo;ni tanlasangiz
            bazadan o&apos;chiriladi.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>6. Xavfsizlik</h2>
          <p>
            Ma&apos;lumotlar HTTPS orqali uzatiladi. Yetkazib beriladigan kirish ma&apos;lumotlari
            (login/parol kabi) bazada shifrlangan holda saqlanadi (AES-256-GCM). Admin paneliga
            kirish alohida sessiya va urinishlar chegarasi bilan himoyalangan. Shunga qaramay,
            internetda hech bir tizim 100% xavfsiz emas — parolingizni hech kimga bermang.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>7. Sizning huquqlaringiz</h2>
          <ul className={styles.list}>
            <li>O&apos;zingiz haqingizda saqlanayotgan ma&apos;lumotni so&apos;rash.</li>
            <li>Noto&apos;g&apos;ri ma&apos;lumotni tuzatishni so&apos;rash.</li>
            <li>Hisobingizni va ma&apos;lumotlaringizni o&apos;chirishni so&apos;rash.</li>
            <li>Xabarnomalardan (eslatmalardan) voz kechish.</li>
          </ul>
          <p>
            Buning uchun Telegramda{' '}
            <a href={`https://t.me/${SUPPORT}`} target="_blank" rel="noopener noreferrer">
              @{SUPPORT}
            </a>{' '}
            ga yozing. Murojaatlar odatda 7 ish kuni ichida ko&apos;rib chiqiladi.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>8. Yosh chegarasi</h2>
          <p>
            Xizmat 16 yoshdan kichik bolalarga mo&apos;ljallanmagan. Agar bunday foydalanuvchining
            ma&apos;lumoti yig&apos;ilgani aniqlansa, u o&apos;chiriladi.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>9. O&apos;zgarishlar</h2>
          <p>
            Siyosat yangilanishi mumkin. Jiddiy o&apos;zgarish bo&apos;lsa, saytda bildirishnoma
            qaytadan ko&apos;rsatiladi. Yuqoridagi &laquo;Oxirgi yangilanish&raquo; sanasi hujjatning
            joriy versiyasini bildiradi.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>10. Bog&apos;lanish</h2>
          <p>
            Savollar bo&apos;yicha:{' '}
            <a href={`https://t.me/${SUPPORT}`} target="_blank" rel="noopener noreferrer">
              @{SUPPORT}
            </a>{' '}
            (Telegram) dan bog&apos;lansangiz bo&apos;ladi. Xizmatdan foydalanish tartibi —{' '}
            <Link to="/shartlar">Foydalanish shartlari</Link> sahifasida.
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link to="/">← Bosh sahifaga qaytish</Link>
      </footer>
    </div>
  );
}
