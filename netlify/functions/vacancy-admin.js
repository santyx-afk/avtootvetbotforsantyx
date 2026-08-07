const { requireAdmin } = require('../../shared/auth');
const { getAdminClient } = require('../../shared/db');
const { ADMIN_ACTIONS, json } = require('./vacancy-api');

// Vakansiya moduli uchun admin API — admin panel (cookie sessiyasi) chaqiradi.
// vacancy-api.js Telegram initData/JWT bilan ishlaydi va panelda u yo'q, shuning
// uchun auth shu yerda boshqacha. Amallar mantiqi esa bir joyda — ADMIN_ACTIONS.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'unauthorized' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  const handler = ADMIN_ACTIONS[body.action];
  if (!handler) return json(400, { ok: false, error: 'unknown_action' });

  try {
    return await handler(getAdminClient(), body, 'web_admin');
  } catch (error) {
    console.error('vacancy-admin error', body.action, error);
    return json(500, { ok: false, error: 'server_error' });
  }
};
