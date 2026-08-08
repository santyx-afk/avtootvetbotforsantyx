// Vakansiya moduli API wrapper — do'kon API'sidan (api.js) mustaqil endpoint.
// Auth mexanizmi bir xil: Telegram initData yoki brauzer JWT.

import { getWebApp } from '../telegram/webapp.js';
import { getToken, ApiError } from './api.js';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function getInitData() {
  try {
    return getWebApp()?.initData || '';
  } catch {
    return '';
  }
}

// So'rov shu muddatdan oshsa uziladi. Timeout'siz javob kelmagan so'rov abadiy
// osilib qolardi — chaqiruvchidagi `finally` ishlamay, sahifa "Yuklanmoqda"
// holatida qotib qolardi (Netlify funksiyasining sovuq startida uchraydi).
const REQUEST_TIMEOUT_MS = 15000;

export async function vacancyCall(action, payload = {}, { signal } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': getInitData() };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // Chaqiruvchining signali (masalan qidiruv debounce'i) timeout bilan birlashtiriladi.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${API_BASE}/vacancy-api`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });
  } catch (err) {
    // Chaqiruvchi bekor qilgan bo'lsa — AbortError'ni o'tkazamiz (kutilgan holat).
    // Timeout bo'lsa oddiy tarmoq xatosi sifatida ko'rsatiladi.
    if (signal?.aborted) throw err;
    throw new ApiError('timeout', 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* bo'sh yoki JSON emas */
  }

  if (!res.ok || (data && data.ok === false)) {
    throw new ApiError(data?.error || `HTTP ${res.status}`, res.status);
  }
  return data;
}
