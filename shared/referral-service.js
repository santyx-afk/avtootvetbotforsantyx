const { request, fetchSettings, addWalletTransaction, createAuditLog } = require('./db');
const { sendMessage } = require('./telegram');

async function processReferralPayout(supabase, order) {
  try {
    const telegramId = String(order.user_telegram_id);
    const { data } = await request(supabase, 'referrals', {
      query: `select=*&referred_telegram_id=eq.${telegramId}&limit=1`,
    });
    const ref = data?.[0];
    if (!ref) return;

    const settings = await fetchSettings(supabase);
    const referrerId = ref.referrer_telegram_id;
    const orderAmount = Number(order.base_price || order.amount || 0);

    // Fix bonus — birinchi xarid uchun (status=registered → paid)
    if (ref.status === 'registered') {
      const fixBonus = Number(settings?.referral_bonus || 0);
      if (fixBonus > 0) {
        await addWalletTransaction(supabase, {
          user_telegram_id: referrerId,
          order_id: order.id,
          amount: fixBonus,
          type: 'credit',
          description: `Referal bonus (yangi foydalanuvchi #${telegramId})`,
        });
        await sendMessage(referrerId, `🎁 Sizning referalingiz birinchi xarid qildi! Balansingizga +${fixBonus.toLocaleString('uz-UZ')} UZS qo'shildi.`).catch(() => {});
      }
      await request(supabase, 'referrals', {
        method: 'PATCH',
        query: `referred_telegram_id=eq.${telegramId}`,
        body: { status: 'paid', first_order_id: order.id, updated_at: new Date().toISOString() },
      });
    }

    // Foizli bonus — har bir xarid uchun
    const percent = Number(settings?.referral_percent || 0);
    if (percent > 0 && orderAmount > 0) {
      const percentBonus = Math.floor(orderAmount * percent / 100);
      if (percentBonus > 0) {
        await addWalletTransaction(supabase, {
          user_telegram_id: referrerId,
          order_id: order.id,
          amount: percentBonus,
          type: 'credit',
          description: `Referal ${percent}% (#${telegramId} xaridi)`,
        });
        await request(supabase, 'referrals', {
          method: 'PATCH',
          query: `referred_telegram_id=eq.${telegramId}`,
          body: {
            total_earned: Number(ref.total_earned || 0) + percentBonus,
            purchase_count: Number(ref.purchase_count || 0) + 1,
            updated_at: new Date().toISOString(),
          },
        });
      }
    }

    await createAuditLog(supabase, {
      order_id: order.id,
      user_telegram_id: telegramId,
      action: 'referral_payout',
      status: 'completed',
      metadata: { referrer: referrerId, percent },
    });
  } catch (err) {
    console.warn('referral payout warn:', err?.message);
  }
}

module.exports = { processReferralPayout };
