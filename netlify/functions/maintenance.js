const { getAdminClient } = require('../../shared/db');
const { runMaintenance } = require('../../shared/maintenance-service');

// Har 5 daqiqada. Ilgari har daqiqada ishlardi — oyiga ~43 200 chaqiruv,
// ya'ni Netlify bepul rejasidagi limitning uchdan biri, ustiga har safar
// bir necha Supabase so'rovi. Yetkazib berishdagi kechikish sezilmaydi.
exports.config = { schedule: '*/5 * * * *' };

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
