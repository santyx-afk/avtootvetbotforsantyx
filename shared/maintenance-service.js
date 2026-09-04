const {
  expirePendingOrders,
  listDueDeliveryRetries,
  completeDeliveryRetry,
  failDeliveryRetry,
  listStuckDeliveringOrders,
  enqueueDeliveryRetry,
  cleanupProcessedPaymentMessages,
  updateMonitoringSnapshot,
  createExceptionQueueItem,
  fetchSettings,
} = require('./db');
const { sendMessage } = require('./telegram');
const { processApprovedOrderDelivery } = require('./delivery-service');
const { nextRetryAt, hasRetriesLeft } = require('./retry-policy');

function adminIds(settings) {
  return [...new Set([settings?.admin_telegram_id, process.env.ADMIN_CHAT_ID, process.env.ADMIN_TELEGRAM_ID, ...(process.env.ADMIN_TELEGRAM_IDS || '').split(',')].map((x) => String(x || '').trim()).filter(Boolean))];
}

async function notifyAdmins(supabase, text) {
  const settings = await fetchSettings(supabase);
  for (const adminChatId of adminIds(settings)) {
    try { await sendMessage(adminChatId, text, null); } catch (error) { console.warn('Admin notify failed:', error?.message); }
  }
}

async function processRetryQueue(supabase, limit = 20) {
  const retries = await listDueDeliveryRetries(supabase, limit);
  const results = [];
  for (const retry of retries) {
    const order = retry.orders;
    if (!order) {
      await failDeliveryRetry(supabase, retry.id, { reason: 'order_missing', metadata: retry.metadata || {} });
      results.push({ id: retry.id, status: 'order_missing' });
      continue;
    }
    const result = await processApprovedOrderDelivery({ supabase, order, adminTelegramId: 'retry_worker' });
    if (result.ok) {
      await completeDeliveryRetry(supabase, retry.id);
      results.push({ id: retry.id, status: 'completed' });
      continue;
    }
    const nextCount = Number(retry.retry_count || 0) + 1;
    if (hasRetriesLeft(nextCount)) {
      await enqueueDeliveryRetry(supabase, { order_id: order.id, reason: result.code || 'delivery_failed', retry_count: nextCount, next_retry_at: nextRetryAt(nextCount), metadata: { message: result.message } });
      results.push({ id: retry.id, status: 'rescheduled', retryCount: nextCount });
    } else {
      await failDeliveryRetry(supabase, retry.id, { reason: 'max_retries_exceeded', metadata: { message: result.message } });
      await createExceptionQueueItem(supabase, { order_id: order.id, reason: 'max_retries_exceeded', metadata: { message: result.message } });
      const { userLines, fetchUserBrief } = require('./admin-notify');
      const { escapeHtml } = require('./messages');
      const user = await fetchUserBrief(supabase, order.user_telegram_id);
      await notifyAdmins(supabase, [
        '⚠️ <b>Yetkazish qayta urinishlari tugadi</b>',
        '',
        ...userLines(user),
        `🧾 Buyurtma: <code>#${escapeHtml(order.order_number)}</code>`,
        `Sabab: ${escapeHtml(result.message || '-')}`,
        '',
        'Buyurtma muammoli navbatga tushdi — admin panel → Dashboard → E’tibor talab qiladi.',
      ].join('\n'));
      results.push({ id: retry.id, status: 'exception' });
    }
  }
  return results;
}

async function resumeStuckDeliveries(supabase) {
  const orders = await listStuckDeliveringOrders(supabase, Number(process.env.STUCK_DELIVERY_MINUTES || 2), 20);
  for (const order of orders) {
    await enqueueDeliveryRetry(supabase, { order_id: order.id, reason: 'stuck_delivering', retry_count: Number(order.delivery_attempts || 0), next_retry_at: new Date().toISOString(), metadata: { orderNumber: order.order_number } });
  }
  return orders.length;
}

async function runMaintenance(supabase) {
  const expired = await expirePendingOrders(supabase);
  const resumed = await resumeStuckDeliveries(supabase);
  const retries = await processRetryQueue(supabase);
  await cleanupProcessedPaymentMessages(supabase, Number(process.env.PROCESSED_PAYMENT_RETENTION_DAYS || 14));
  await updateMonitoringSnapshot(supabase);
  return { expired: expired.length, resumed, retries: retries.length };
}

module.exports = { runMaintenance, processRetryQueue, resumeStuckDeliveries };
