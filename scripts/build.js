const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true, force: true });
}
fs.mkdirSync(publicDir);

const adminDir = path.join(__dirname, '..', 'admin');
if (fs.existsSync(adminDir)) {
  copyDir(adminDir, path.join(publicDir, 'admin'));
}

const webappDir = path.join(__dirname, '..', 'webapp');
if (fs.existsSync(webappDir)) {
  copyDir(webappDir, publicDir);
  copyDir(webappDir, path.join(publicDir, 'webapp'));
}

console.log('Build completed successfully.');