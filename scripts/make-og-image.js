/**
 * Writes the HTML card for the default social share image.
 *   node scripts/make-og-image.js
 * Then screenshot assets/og-default.html at 1200x630 into
 * assets/og-default.png (see npm run "og:image:shoot" note in README).
 *
 * Kept free of the playwright dependency so the site does not ship it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { LOGO_NAV } = require('../api/_lib/logo');

const OUT_DIR = path.join(__dirname, '..', 'assets');
const site = (process.env.SITE_URL || 'https://www.kodsol.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px;height:630px}
  body{background:#07080c;color:#e9edf7;overflow:hidden;
       font-family:'Inter',sans-serif;position:relative;
       display:flex;flex-direction:column;justify-content:space-between;padding:72px 80px}
  body::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.03;
       background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}
  .glow{position:absolute;border-radius:50%;filter:blur(120px);opacity:.5}
  .g1{width:620px;height:620px;right:-180px;top:-220px;background:radial-gradient(circle,#7c5cff,transparent 70%)}
  .g2{width:520px;height:520px;left:-160px;bottom:-240px;background:radial-gradient(circle,#22d3ee,transparent 70%)}
  .grid{position:absolute;inset:0;
       background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),
                        linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);
       background-size:60px 60px;
       -webkit-mask-image:radial-gradient(ellipse at 50% 40%,#000 30%,transparent 78%)}
  .row{position:relative;display:flex;align-items:center;justify-content:space-between}
  .chip{display:inline-flex;align-items:center;justify-content:center;padding:7px 14px;border-radius:10px;
        background:linear-gradient(155deg,#f8fafc,#e5e9f0);
        box-shadow:0 10px 24px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.7)}
  .chip img{height:20px;width:auto;display:block}
  .url{font-family:'Space Grotesk',sans-serif;font-size:23px;color:#8b93a7}
  .mid{position:relative}
  h1{font-family:'Space Grotesk',sans-serif;font-weight:600;
     font-size:78px;line-height:1.05;letter-spacing:-.025em;max-width:19ch}
  .grad{background:linear-gradient(120deg,#7c5cff 0%,#22d3ee 100%);
        -webkit-background-clip:text;background-clip:text;color:transparent}
  .tag{display:inline-block;font-family:'Space Grotesk',sans-serif;font-size:16px;
       letter-spacing:.22em;text-transform:uppercase;color:#22d3ee;margin-bottom:24px}
</style></head>
<body>
  <div class="g1 glow"></div><div class="g2 glow"></div><div class="grid"></div>
  <div class="row">
    <span class="chip"><img src="${LOGO_NAV}" alt=""></span>
    <span class="url">${site}</span>
  </div>
  <div class="mid">
    <span class="tag">Software &middot; AI &middot; Automation &middot; Growth</span>
    <h1>Notes on <span class="grad">building.</span></h1>
  </div>
</body></html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, 'og-default.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`  wrote assets/og-default.html  (${(fs.statSync(out).size / 1024).toFixed(1)} KB) - open at 1200x630 and save as og-default.png`);
