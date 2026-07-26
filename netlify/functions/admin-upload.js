const { requireAdmin } = require('../../shared/auth');
const { getEnv } = require('../../shared/config');

const BUCKET = 'product-images';
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (!requireAdmin(event.headers)) return json(401, { ok: false, error: 'Unauthorized' });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  try {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    if (!contentType.startsWith('multipart/form-data')) {
      return json(400, { ok: false, error: 'multipart/form-data talab qilinadi' });
    }

    const boundary = contentType.split('boundary=')[1];
    if (!boundary) return json(400, { ok: false, error: 'boundary topilmadi' });

    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);
    const parts = parseMultipart(raw, boundary);
    const filePart = parts.find((p) => p.name === 'file');
    if (!filePart) return json(400, { ok: false, error: 'file maydoni topilmadi' });
    if (filePart.data.length > MAX_SIZE) return json(400, { ok: false, error: 'Fayl 5 MB dan katta' });
    if (!ALLOWED_TYPES.includes(filePart.type)) return json(400, { ok: false, error: 'Faqat JPEG, PNG, WebP' });

    const ext = filePart.type.split('/')[1] === 'jpeg' ? 'jpg' : filePart.type.split('/')[1];
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const supabaseUrl = getEnv('SUPABASE_URL').replace(/\/$/, '');
    const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${filename}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': filePart.type,
        'x-upsert': 'true',
      },
      body: filePart.data,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return json(500, { ok: false, error: `Upload xatosi: ${err}` });
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${filename}`;
    return json(200, { ok: true, url: publicUrl });
  } catch (error) {
    console.error('admin-upload error', error);
    return json(500, { ok: false, error: 'Server xatosi' });
  }
};

function parseMultipart(buffer, boundary) {
  const parts = [];
  const sep = Buffer.from(`--${boundary}`);
  let start = indexOf(buffer, sep, 0);
  if (start === -1) return parts;
  start += sep.length;

  while (true) {
    const next = indexOf(buffer, sep, start);
    if (next === -1) break;
    const chunk = buffer.subarray(start, next);
    const headerEnd = indexOf(chunk, Buffer.from('\r\n\r\n'), 0);
    if (headerEnd === -1) { start = next + sep.length; continue; }
    const headerStr = chunk.subarray(0, headerEnd).toString();
    const body = chunk.subarray(headerEnd + 4, chunk.length - 2);

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

    parts.push({
      name: nameMatch?.[1] || '',
      filename: filenameMatch?.[1] || '',
      type: typeMatch?.[1]?.trim() || 'application/octet-stream',
      data: body,
    });
    start = next + sep.length;
  }
  return parts;
}

function indexOf(buf, search, from) {
  for (let i = from; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}
