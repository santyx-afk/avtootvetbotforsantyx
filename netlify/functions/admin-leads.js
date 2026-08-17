const { requireAdmin } = require('../../shared/auth');
const { getAdminClient, listLeads, updateRow, deleteRow } = require('../../shared/db');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Landing formasidan kelgan leadlar: ro'yxat, "bajarildi" belgilash, o'chirish.
exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  const supabase = getAdminClient();
  try {
    if (event.httpMethod === 'GET') {
      const leads = await listLeads(supabase);
      return json(200, { ok: true, leads });
    }

    if (event.httpMethod === 'POST') {
      const { action, id } = JSON.parse(event.body || '{}');
      if (!id || !action) return json(400, { ok: false, error: 'id va action talab qilinadi' });
      if (action === 'done') {
        const lead = await updateRow(supabase, 'leads', id, { status: 'done' });
        return json(200, { ok: true, lead });
      }
      if (action === 'reopen') {
        const lead = await updateRow(supabase, 'leads', id, { status: 'new' });
        return json(200, { ok: true, lead });
      }
      if (action === 'delete') {
        await deleteRow(supabase, 'leads', id);
        return json(200, { ok: true });
      }
      return json(400, { ok: false, error: 'Noma\'lum action' });
    }

    return json(405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    // Eng ehtimoliy sabab: leads jadvali hali yaratilmagan (migratsiya qo'llanmagan)
    return json(500, { ok: false, error: 'Server xatosi — leads jadvali yaratilganini tekshiring (migrations/2026-08-17_leads.sql)' });
  }
};
