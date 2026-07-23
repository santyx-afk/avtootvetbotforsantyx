const { getAdminClient, request } = require('../../shared/db');

exports.handler = async (event) => {
  try {
    const supabase = getAdminClient();
    
    const { data: deliveryLogs } = await request(supabase, 'delivery_logs', { query: 'select=*&order=created_at.desc&limit=5' });
    const { data: auditLogs } = await request(supabase, 'audit_logs', { query: 'select=*&order=created_at.desc&limit=5' });
    const { data: orders } = await request(supabase, 'orders', { query: 'select=*&order=created_at.desc&limit=5' });
    const { data: paymentLogs } = await request(supabase, 'payment_logs', { query: 'select=*&order=created_at.desc&limit=5' });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deliveryLogs,
        auditLogs,
        orders,
        paymentLogs
      }, null, 2)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message, stack: error.stack })
    };
  }
};