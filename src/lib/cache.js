// Oddiy stale-while-revalidate cache (localStorage ustida).
// Sahifa ochilganda eng oxirgi muvaffaqiyatli API javobini DARHOL ko'rsatish,
// keyin fonda yangi ma'lumotni yuklab, o'zgargan bo'lsa yangilash uchun.
// Shu tufayli Mini App qayta ochilganda bo'sh spinner o'rniga darrov kontent chiqadi.

import { readStorage, writeStorage } from '../utils/storage.js';

const PREFIX = 'cache:';

// key bo'yicha saqlangan ma'lumotni qaytaradi (yo'q bo'lsa null).
export function readCache(key) {
  const entry = readStorage(PREFIX + key, null);
  if (!entry || typeof entry !== 'object' || !('data' in entry)) return null;
  return entry.data;
}

// key bo'yicha ma'lumotni (vaqt belgisi bilan) saqlaydi.
export function writeCache(key, data) {
  writeStorage(PREFIX + key, { data, at: Date.now() });
}
