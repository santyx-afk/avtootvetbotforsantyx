import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from './Privacy.module.css';

const SUPPORT = (import.meta.env.VITE_SUPPORT_USERNAME || 'santyx').replace(/^@/, '');
const BOT = (import.meta.env.VITE_BOT_USERNAME || 'santyxnarxbot').replace(/^@/, '');

// Oxirgi tahrir sanasi — hujjat mazmuni o'zgarganda qo'lda yangilanadi.
const UPDATED = '16.08.2026';

// Foydalanish shartlari (ommaviy oferta). Til — o'zbekcha, uslub Privacy bilan
// bir xil (Privacy.module.css qayta ishlatiladi). Mazmun xizmatning kodda
// mavjud haqiqiy xatti-harakatiga asoslangan; jarayon o'zgarsa sahifa ham
// yangilanishi shart.
export default function Terms() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Foydalanish shartlari — santyx';
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
        <h1 className={styles.title}>Foydalanish shartlari</h1>
        <p className={styles.updated}>Oxirgi yangilanish: {UPDATED}</p>

        <p className={styles.lead}>
          Ushbu hujjat SANTYX PRO xizmatidan (santyx.uz sayti, <b>@{BOT}</b> Telegram boti va
          uning ichidagi ilova) foydalanish tartibini belgilaydi. Xizmatdan foydalanish —
          buyurtma berish, to&apos;lov qilish yoki e&apos;lon joylash — ushbu shartlarga rozilik
          bildirganingizni anglatadi.
        </p>

        <section className={styles.section}>
          <h2 className={styles.h2}>1. Xizmat nima taklif qiladi</h2>
          <p>
            Xizmat raqamli mahsulotlarni — premium obunalar, akkauntlar va litsenziya
            kalitlarini — sotib olish imkonini beradi. Har bir mahsulotning narxi, muddati va
            yetkazib berish turi katalogdagi sahifasida ko&apos;rsatiladi. Bundan tashqari,
            xizmatda bepul vakansiya bo&apos;limi mavjud (8-bo&apos;limga qarang).
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>2. Buyurtma va to&apos;lov</h2>
          <ul className={styles.list}>
            <li>
              Buyurtma uchun sizga <b>noyob summa</b> beriladi — to&apos;lov aynan shu summada,
              buyurtmada ko&apos;rsatilgan muddat ichida qilinishi kerak. Boshqa summa
              o&apos;tkazilsa, to&apos;lov avtomatik aniqlanmasligi mumkin — bunday holda chek
              bilan qo&apos;llab-quvvatlashga murojaat qiling.
            </li>
            <li>Muddat ichida to&apos;lanmagan buyurtma avtomatik bekor qilinadi.</li>
            <li>
              To&apos;lov tekshiruvdan o&apos;tgach buyurtma tasdiqlanadi. Tasdiqlash yoki rad
              etish haqida botdan xabar olasiz.
            </li>
            <li>
              Balansingizdagi mablag&apos;dan ham to&apos;lashingiz mumkin — bu holda yetishmagan
              qismi uchun noyob summa beriladi.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>3. Yetkazib berish</h2>
          <ul className={styles.list}>
            <li>
              <b>Avtomatik mahsulotlar</b> (tayyor akkaunt yoki kalit) to&apos;lov tasdiqlangach
              darhol botga yuboriladi.
            </li>
            <li>
              <b>Qo&apos;lda ulanadigan mahsulotlar</b> odatda 10–15 daqiqada yetkaziladi; band
              vaqtlarda biroz ko&apos;proq vaqt olishi mumkin.
            </li>
            <li>
              Yetkazib berilgan kirish ma&apos;lumotlarini (login, parol, kalit) xavfsiz saqlash
              — sizning mas&apos;uliyatingiz.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>4. Kafolat va almashtirish</h2>
          <p>
            Har bir mahsulotning kafolat shartlari uning sahifasida ko&apos;rsatiladi. Obuna
            ko&apos;rsatilgan muddat davomida ishlamay qolsa va bu sizning aybingiz bilan
            bo&apos;lmasa (masalan, parolni o&apos;zgartirish, qoidalarni buzish), muammoni
            bepul bartaraf etamiz yoki mahsulotni almashtirib beramiz. Buning uchun{' '}
            <a href={`https://t.me/${SUPPORT}`} target="_blank" rel="noopener noreferrer">
              @{SUPPORT}
            </a>{' '}
            ga murojaat qiling.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>5. To&apos;lovni qaytarish</h2>
          <ul className={styles.list}>
            <li>
              Buyurtma bajarilmasa (mahsulot yetkazilmasa) va almashtirish imkoni
              bo&apos;lmasa — to&apos;lov to&apos;liq qaytariladi.
            </li>
            <li>
              Yetkazilgan va ishlayotgan raqamli mahsulot uchun to&apos;lov qaytarilmaydi — bu
              raqamli tovarlarning xususiyati (kirish ma&apos;lumotlari ochilgach ularni
              &laquo;qaytarib olib&raquo; bo&apos;lmaydi).
            </li>
            <li>
              Kafolat davrida hal qilib bo&apos;lmagan muammo yuzasidan qaytarish — kelishuv
              asosida balansga yoki to&apos;lov qilingan kartaga amalga oshiriladi.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>6. Balans, promokod va referal dasturi</h2>
          <ul className={styles.list}>
            <li>
              Balansdagi mablag&apos; (jumladan keshbek va referal bonuslari) faqat xizmat
              ichidagi xaridlar uchun ishlatiladi, naqd pulga yechib olinmaydi.
            </li>
            <li>
              Promokodlarning amal qilish muddati va ishlatish soni cheklangan bo&apos;lishi
              mumkin — shartlari e&apos;lon qilinganda ko&apos;rsatiladi.
            </li>
            <li>
              Referal dasturini suiiste&apos;mol qilish (soxta hisoblar ochish va h.k.)
              aniqlansa, bonuslar bekor qilinadi.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>7. Taqiqlanadi</h2>
          <ul className={styles.list}>
            <li>Sotib olingan akkauntlarni uchinchi shaxslarga qayta sotish yoki ulashish.</li>
            <li>Firibgarlik, soxta to&apos;lov cheklari yuborish.</li>
            <li>Xizmat ishiga texnik aralashish, zaifliklardan foydalanish.</li>
            <li>
              Qoidabuzarlik aniqlanganda hisob bloklanishi va xizmat ko&apos;rsatish rad
              etilishi mumkin.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>8. Vakansiya bo&apos;limi</h2>
          <p>
            Vakansiya bo&apos;limi — ishchi va mijozlarni bog&apos;laydigan <b>bepul</b>{' '}
            e&apos;lonlar doskasi. Xizmat tomonlar o&apos;rtasidagi kelishuv, ish sifati va
            to&apos;lovlarga aralashmaydi va ular uchun javobgar emas. E&apos;lonlar moderatsiyadan
            o&apos;tadi; yolg&apos;on yoki qoidaga zid e&apos;lonlar olib tashlanadi.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>9. Javobgarlik chegarasi</h2>
          <p>
            Obuna xizmatlarining o&apos;zi (streaming, dizayn, AI platformalari va h.k.)
            uchinchi tomon mahsulotlaridir — ular o&apos;z narxlari, funksiyalari yoki
            qoidalarini o&apos;zgartirishi mumkin, bunga bizning ta&apos;sirimiz yo&apos;q.
            Bunday o&apos;zgarishlar tufayli yuzaga kelgan noqulayliklar uchun xizmat javobgar
            emas, lekin har bir holatda adolatli yechim topishga harakat qilamiz (4- va
            5-bo&apos;limlar).
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>10. Yosh chegarasi</h2>
          <p>Xizmatdan foydalanish uchun kamida 16 yoshda bo&apos;lishingiz kerak.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>11. O&apos;zgarishlar va bog&apos;lanish</h2>
          <p>
            Shartlar yangilanishi mumkin — joriy versiya doim shu sahifada, yuqorida
            &laquo;Oxirgi yangilanish&raquo; sanasi bilan turadi. Savollar bo&apos;yicha:{' '}
            <a href={`https://t.me/${SUPPORT}`} target="_blank" rel="noopener noreferrer">
              @{SUPPORT}
            </a>{' '}
            (Telegram). Ma&apos;lumotlaringiz qanday saqlanishi haqida —{' '}
            <Link to="/maxfiylik">Maxfiylik siyosati</Link>.
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link to="/">← Bosh sahifaga qaytish</Link>
      </footer>
    </div>
  );
}
