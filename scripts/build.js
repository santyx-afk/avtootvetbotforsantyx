const fs = require('fs');
const path = require('path');

// Vite build'dan KEYIN ishlaydi (package.json: "vite build && node scripts/build.js").
// Vazifasi: statik admin panelni (`admin/`) Vite chiqishi (`dist/`) ichiga
// `dist/admin/` sifatida ko'chirish. `dist/` ni O'CHIRMAYDI — Mini App shu yerda.

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const adminDir = path.join(rootDir, 'admin');

if (!fs.existsSync(distDir)) {
  // Vite build ishlamagan bo'lsa — noto'g'ri tartib.
  fs.mkdirSync(distDir, { recursive: true });
  console.warn('Warning: dist/ topilmadi. Avval `vite build` ishga tushishi kerak.');
}

if (fs.existsSync(adminDir)) {
  copyDir(adminDir, path.join(distDir, 'admin'));
  console.log('Admin panel dist/admin/ ga ko\'chirildi.');
}

// ---------------- sitemap.xml ----------------
// Sitemap endi build paytida emas, `netlify/functions/sitemap.js` da jonli
// quriladi: obunalar ro'yxati bazadan olinadi, ya'ni admin panelda yangi reja
// qo'shilsa build kutmasdan sitemap'ga tushadi.

console.log('Build post-step tugadi.');
