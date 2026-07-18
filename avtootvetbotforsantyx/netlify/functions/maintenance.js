const { getAdminClient } = require('../../shared/db');
const { runMaintenance } = require('../../shared/maintenance-service');

exports.config = { schedule: '* * * * *' };

exports.handler = async () => {
  const supabase = getAdminClient();
  try {
    const result = await runMaintenance(supabase);
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...result }) };
  } catch (error) {
    console.error('Maintenance failed', error);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: error?.message }) };
  }
};
