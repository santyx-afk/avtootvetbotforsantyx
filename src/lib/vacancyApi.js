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

export async function vacancyCall(action, payload = {}, { signal } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': getInitData() };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}/vacancy-api`, {
      method: 'POST',
      headers,
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
