// webapp-api Netlify funksiyasiga so'rov yuboruvchi wrapper.
// Har bir so'rovda Telegram initData (xom satr) header orqali yuboriladi —
// backend uni bot token bilan HMAC tekshiradi.

import { getWebApp } from '../telegram/webapp.js';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function getInitData() {
  try {
    return getWebApp()?.initData || '';
  } catch {
    return '';
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// action — webapp-api ichidagi amal nomi (masalan "init", "save-contact").
export async function apiCall(action, payload = {}, { signal } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}/webapp-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': getInitData(),
      },
      body: JSON.stringify({ action, ...payload }),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('network', 0);
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
