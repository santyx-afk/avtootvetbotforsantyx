// webapp-api Netlify funksiyasiga so'rov yuboruvchi wrapper.
// Auth ikki xil bo'lishi mumkin:
//  - Telegram Mini App: X-Telegram-Init-Data header (initData HMAC)
//  - Brauzer: Authorization: Bearer <JWT> (Telegram orqali login qilingach olinadi)

import { getWebApp } from '../telegram/webapp.js';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_KEY = 'santyx:webToken';

// ---- Brauzer JWT token (localStorage) ----
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}
export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

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

// action — webapp-api ichidagi amal nomi (masalan "init", "public-catalog").
export async function apiCall(action, payload = {}, { signal } = {}) {
  const initData = getInitData();
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}/webapp-api`, {
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

  // Brauzer JWT eskirgan/yaroqsiz bo'lsa — token'ni tozalab login sahifasiga qaytaramiz.
  if (res.status === 401 && token && !initData) {
    clearToken();
    try {
      if (window.location.pathname !== '/login') window.location.replace('/login');
    } catch {
      /* ignore */
    }
  }

  if (!res.ok || (data && data.ok === false)) {
    const error = new ApiError(data?.error || `HTTP ${res.status}`, res.status);
    error.data = data; // masalan texnik tanaffus matni
    throw error;
  }
  return data;
}
