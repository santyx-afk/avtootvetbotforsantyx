// Katalogni oldindan yuklash.
// Ilgari tartib ketma-ket edi: init tugaydi → Catalog sahifasi kodi yuklanadi →
// catalog so'rovi ketadi. Endi ikkalasi init bilan BIR VAQTDA boshlanadi,
// shunda foydalanuvchi katalogni bir bosqich erta ko'radi.

import { apiCall } from './api.js';

let catalogPromise = null;

export function prefetchCatalog() {
  if (!catalogPromise) {
    catalogPromise = apiCall('catalog').catch((err) => {
      catalogPromise = null; // xato bo'lsa keyingi urinish yangi so'rov yuboradi
      throw err;
    });
    // Catalog sahifasi kodi ham hozirdan yuklansin (App.jsx'dagi lazy bilan bir xil chunk)
    import('../pages/Catalog.jsx').catch(() => {});
  }
  return catalogPromise;
}

// Oldindan yuklangan natijani BIR marta beradi; keyingi chaqiruvlar null oladi
// (Catalog sahifasi o'zi yangi so'rov yuboradi).
export function takeCatalogPrefetch() {
  const p = catalogPromise;
  catalogPromise = null;
  return p;
}
