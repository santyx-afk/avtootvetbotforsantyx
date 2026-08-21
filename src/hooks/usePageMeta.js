import { useEffect } from 'react';

// Sahifa metama'lumotlarini (title, description, canonical, og:*) o'rnatadi.
//
// Nima uchun kerak: bu SPA — barcha marshrutlar bitta index.html dan yuklanadi,
// unda esa canonical qattiq `https://santyx.uz/` qilib yozilgan edi. Natijada
// /maxfiylik va /shartlar sahifalari qidiruv tizimiga "men bosh sahifaman" deb
// ko'rinardi va indeksdan tushib qolardi.
//
// Komponent almashganda oldingi qiymatlar tiklanadi, shunda sahifalar
// bir-birining metasini "meros" qilib olmaydi.

const SITE_URL = 'https://santyx.uz';

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
    const match = selector.match(/\[(name|property|rel)="([^"]+)"\]/);
    if (match) el.setAttribute(match[1], match[2]);
    document.head.appendChild(el);
  }
  const previous = el.getAttribute(attr);
  el.setAttribute(attr, value);
  return () => {
    if (previous === null) el.remove();
    else el.setAttribute(attr, previous);
  };
}

export default function usePageMeta({ title, description, path = '/', noindex = false }) {
  useEffect(() => {
    const restores = [];
    const url = `${SITE_URL}${path}`;

    const prevTitle = document.title;
    if (title) {
      document.title = title;
      restores.push(() => {
        document.title = prevTitle;
      });
    }

    restores.push(setMeta('link[rel="canonical"]', 'href', url));
    restores.push(setMeta('meta[property="og:url"]', 'content', url));
    if (title) restores.push(setMeta('meta[property="og:title"]', 'content', title));
    if (description) {
      restores.push(setMeta('meta[name="description"]', 'content', description));
      restores.push(setMeta('meta[property="og:description"]', 'content', description));
    }
    if (noindex) restores.push(setMeta('meta[name="robots"]', 'content', 'noindex, follow'));

    return () => restores.forEach((restore) => restore());
  }, [title, description, path, noindex]);
}
