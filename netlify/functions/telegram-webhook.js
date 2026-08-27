const { getAdminClient, request } = require('../../shared/db');
const { handleStart, handleCallback, handleReceipt, handleTextCommand } = require('../../shared/bot-service');
const { handleHumoPaymentNotification } = require('../../shared/humo-payment-service');

// To'lov bildirishnomalarini yuboradigan biznes-akkaunt Telegram ID si.
// Ilgari kodning ichida ikki joyda qattiq yozilgan edi — endi bitta joyda,
// va env orqali o'zgartirsa bo'ladi.
const PAYMENT_NOTIFIER_ID = String(process.env.PAYMENT_NOTIFIER_ID || '856254490');

async function isUserBlocked(supabase, telegramUserId) {
  if (!telegramUserId) return false;
  try {
    const { data } = await request(supabase, 'users', {
      query: `select=is_blocked&telegram_id=eq.${telegramUserId}&limit=1`,
    });
    return Boolean(data?.[0]?.is_blocked);
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const headerSecret = event.headers['x-telegram-bot-api-secret-token'] || event.headers['X-Telegram-Bot-Api-Secret-Token'];

  if (secret && headerSecret !== secret) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignored: 'invalid-secret' }) };
  }

  let update;
  try {
    update = JSON.parse(event.body || '{}');
  } catch (error) {
    console.error('Invalid JSON', error);
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignored: 'invalid-json' }) };
  }

  const supabase = getAdminClient();

  try {
    if (update.business_message) {
      const msg = update.business_message;
      
      // LOG TO AUDIT_LOGS for debugging
      const { createAuditLog } = require('../../shared/db');
      await createAuditLog(supabase, {
        order_id: null,
        user_telegram_id: String(msg.from?.id || 'unknown'),
        action: 'business_message_received',
        status: 'debug',
        metadata: { payload: msg }
      });

      // Try standard auto-payment handler first (handles "Пополнение" format)
      const payment = await handleHumoPaymentNotification({ supabase, message: msg });
      if (payment.handled) {
        return { statusCode: 200, body: 'OK' };
      }

      // "Summa ..." ko'rinishidagi to'lov xabari (biznes-akkaunt orqali keladi).
      //
      // Ilgari bu yerda `checks` jadvali orqali ishlaydigan eski oqim ham bor edi:
      // u anon kalit bilan bazaga murojaat qilar va `checks.url` da saqlangan
      // ixtiyoriy manzilga POST yuborardi (SSRF yo'li). O'sha yozuvlarni faqat
      // autentifikatsiyasiz `api.js` funksiyasi yaratardi — u olib tashlandi,
      // shuning uchun eski oqim ham bu yerdan chiqarildi. Endi to'lov to'g'ridan-
      // to'g'ri Mini App buyurtmalariga solishtiriladi.
      if (String(msg.from?.id) === PAYMENT_NOTIFIER_ID && msg.text) {
        const match = msg.text.match(/Summa\s*([\d\s.,]+)/i);
        if (match) {
          const parsedAmount = Number(match[1].replace(/\s/g, '').replace(',', '.'));

          const { confirmPaymentNotification } = require('../../shared/db');
          const { processApprovedOrderDelivery } = require('../../shared/delivery-service');
          const { sendMessage } = require('../../shared/telegram');

          const confirmation = await confirmPaymentNotification(supabase, {
            amount: parsedAmount,
            source: 'business_message',
            messageKey: String(msg.message_id || Date.now()),
          });

          if (confirmation && confirmation.status === 'matched' && confirmation.order) {
            const paidOrder = confirmation.order;
            const delivery = await processApprovedOrderDelivery({
              supabase,
              order: paidOrder,
              adminTelegramId: String(msg.from?.id),
            });

            const adminChat = process.env.ADMIN_CHAT_ID || process.env.ADMIN_TELEGRAM_ID || PAYMENT_NOTIFIER_ID;
            await sendMessage(
              adminChat,
              `✅ Avtomat to'lov (Business Message)!\nFoydalanuvchi: ${paidOrder.user_telegram_id}\nSumma: ${parsedAmount} UZS\nHolat: ${delivery.ok ? 'Yetkazildi ✅' : 'Xatolik ❌ - ' + delivery.message}`,
            );
          }
        }
      }
    } else if (update.message?.contact) {
      // Mini App requestContact orqali ulashilgan telefon raqamini saqlaymiz.
      // (Kontakt xabari matnsiz, shuning uchun uni chek deb qabul qilmaslik kerak.)
      const contact = update.message.contact;
      const fromId = String(update.message.from?.id || '');
      const isOwnContact = !contact.user_id || String(contact.user_id) === fromId;
      const digits = String(contact.phone_number || '').replace(/\D/g, '');
      if (fromId && digits && isOwnContact) {
        const { request, upsertUser, grantWelcomeBonus } = require('../../shared/db');
        const { payReferralSignupBonus } = require('../../shared/referral-service');
        const { sendMessage } = require('../../shared/telegram');
        try {
          await upsertUser(supabase, update.message.from);
          const phone = `+${digits}`;

          // Bitta SIM bilan bir nechta akkauntdan bonus yig'ishga qarshi:
          // raqam boshqa akkauntda allaqachon bo'lsa, saqlaymiz-u bonus yo'q.
          const { data: dup } = await request(supabase, 'users', {
            query: `select=telegram_id&phone=eq.${encodeURIComponent(phone)}&telegram_id=neq.${fromId}&limit=1`,
          });

          // phone_verified_at faqat SHU yerda qo'yiladi: kontaktni Telegramning
          // o'zi yuborgan va isOwnContact tekshirilgan — soxtalab bo'lmaydi.
          // Mini App'da qo'lda terilgan raqam (save-contact) bu belgini olmaydi.
          await request(supabase, 'users', {
            method: 'PATCH',
            query: `telegram_id=eq.${fromId}`,
            body: { phone, phone_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          });

          // Reply klaviaturani yig'ishtirib, tasdiq beramiz.
          await sendMessage(fromId, '✅ Raqamingiz saqlandi!', { remove_keyboard: true }).catch(() => {});

          if (!dup?.[0]) {
            // Bonuslar faqat tasdiqlangan raqamdan keyin (2026-08-27
            // nakrutkasi: 131 soxta akkaunt darhol bonus olgan edi).
            await grantWelcomeBonus(supabase, fromId)
              .catch((e) => console.warn('welcome bonus warn:', e?.message));
            await payReferralSignupBonus(supabase, fromId).catch(() => {});
          }
        } catch (e) {
          console.warn('save contact phone warn:', e?.message);
        }
      }
    } else if (update.message?.text?.startsWith('/start')) {
      const blocked = await isUserBlocked(supabase, update.message.from?.id);
      if (blocked) return { statusCode: 200, body: 'blocked' };
      await handleStart({ supabase, message: update.message });
    } else if (update.message) {
      const blocked = await isUserBlocked(supabase, update.message.from?.id);
      if (blocked) return { statusCode: 200, body: 'blocked' };
      const payment = await handleHumoPaymentNotification({ supabase, message: update.message });
      if (!payment.handled) {
        const commandHandled = update.message.text ? await handleTextCommand({ supabase, message: update.message }) : false;
        if (!commandHandled) await handleReceipt({ supabase, message: update.message });
      }
    } else if (update.callback_query) {
      const blocked = await isUserBlocked(supabase, update.callback_query.from?.id);
      if (blocked) return { statusCode: 200, body: 'blocked' };
      await handleCallback({ supabase, callbackQuery: update.callback_query });
    }
  } catch (error) {
    console.error('Webhook handler error', error);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};