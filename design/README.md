# Manba (dizayn) fayllari

Bu papkada saytga chiqmaydigan asl fayllar turadi. Ular build'ga kirmaydi —
faqat kelajakda logotip yoki fonni qayta yasash kerak bo'lsa ishlatiladi.

| Fayl | Nima uchun |
|---|---|
| `santyx-logo.ai` | Logotipning vektor manbasi. `public/logo.svg`, `favicon.svg` va ikonkalar shundan olingan. |
| `santyx-logo.jpg` | Logotipning rastr varianti (ijtimoiy tarmoq va hujjatlar uchun). |
| `bg-neural-source.jpeg` | Sayt orqa fonining asl, siqilmagan nusxasi (2752×1536). Saytda `public/bg-neural.{avif,webp,jpg}` ishlatiladi. |

Logotipni qayta yasash kerak bo'lsa: `.ai` fayli aslida PDF, uni PyMuPDF
(`pymupdf`) bilan ochib SVG ga aylantirish mumkin.
