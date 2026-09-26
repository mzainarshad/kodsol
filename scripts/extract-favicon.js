// Writes the inline base64 logo out as a real favicon, so /favicon.ico
// stops 404ing. Run: node scripts/extract-favicon.js
const fs = require('fs');
const path = require('path');
const { LOGO_NAV_BASE64 } = require('../api/_lib/logo');

const dir = path.join(__dirname, '..');
const buf = Buffer.from(LOGO_NAV_BASE64, 'base64');

for (const name of ['favicon.png', 'favicon.ico', 'apple-touch-icon.png']) {
  fs.writeFileSync(path.join(dir, name), buf);
  console.log(`  wrote ${name.padEnd(24)} ${(buf.length / 1024).toFixed(1)} KB`);
}
