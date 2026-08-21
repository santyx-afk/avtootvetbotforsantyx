import { useEffect } from 'react';

// schema.org razmetkasini (JSON-LD) sahifaga qo'shadi.
// Google shu razmetka orqali savol-javoblarni qidiruv natijasida kengaytirilgan
// ko'rinishda chiqarishi mumkin — landing'dagi FAQ bo'limi buning uchun tayyor.
export default function StructuredData({ id, data }) {
  useEffect(() => {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    el.textContent = JSON.stringify(data);
    document.head.appendChild(el);
    return () => el.remove();
  }, [id, data]);

  return null;
}
