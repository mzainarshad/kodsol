'use strict';
/**
 * Renders the real /blog handler with BLOG_FALLBACK=sample and no DATABASE_URL,
 * then screenshots it, so the sample-content page is reviewed as visitors see it.
 */
process.env.BLOG_FALLBACK = 'sample';
process.env.SITE_URL = process.env.SITE_URL || 'https://kodsol.vercel.app';
delete process.env.DATABASE_URL;

const fs = require('fs');
const path = require('path');
const os = require('os');
const blog = require('../api/blog');

function res() {
  return {
    statusCode: 0, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = String(b); return this; },
    json(b) { this.body = JSON.stringify(b); return this; },
    end(b) { this.body = String(b || ''); return this; },
  };
}

(async () => {
  const r = res();
  await blog({ method: 'GET', headers: {}, query: {} }, r);

  console.log('  status          :', r.statusCode);
  console.log('  source          :', r.headers['x-kodsol-blog-source']);
  console.log('  cache-control   :', r.headers['cache-control']);
  console.log('  robots          :', (r.body.match(/name="robots" content="[^"]*"/) || ['(none)'])[0]);
  console.log('  banner present  :', /Sample content\./.test(r.body));
  console.log('  post cards      :', (r.body.match(/class="[^"]*post-card/g) || []).length || (r.body.match(/<article/g) || []).length);

  const out = path.join(os.tmpdir(), 'opencode', 'fallback-blog.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.body, 'utf8');

  const { chromium } = require('playwright-core');
  // Reuse the same lookup as test-tech-scroll.js: a pinned chromium revision
  // goes stale on every playwright upgrade.
  const findChrome = () => {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
    if (!fs.existsSync(base)) return undefined;
    for (const dir of fs.readdirSync(base)) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe',
        'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(base, dir, rel);
        if (fs.existsSync(p)) return p;
      }
    }
    return undefined;
  };
  const exe = findChrome();
  if (!exe) throw new Error('no chromium found; set CHROME_PATH');
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const p = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  await p.goto('file:///' + out.replace(/\\/g, '/'));
  await p.waitForTimeout(700);
  const shot = path.join(process.cwd(), '.preview', 'blog-fallback.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await p.screenshot({ path: shot });
  await browser.close();
  console.log('  screenshot      :', shot);
})().catch((e) => { console.error(e); process.exitCode = 1; });
