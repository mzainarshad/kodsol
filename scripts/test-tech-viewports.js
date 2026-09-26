'use strict';
// Device-tier sweep for the technology section.
//
// Every device must end up with a working sequence (pinned or scroll-driven)
// AND the layout that its tier is supposed to get:
//   phone   (<=767)  no spine, no pin
//   tablet  (768-999) spine, no pin (touch)
//   laptop  (>=1000)  spine, pin when the stage actually fits
const path = require('path');
const { chromium } = require('playwright-core');
const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe');
const ORIGIN = process.env.SITE_URL || 'http://localhost:3000';

const DEVICES = [
  { name: 'iPhone SE',          w: 375,  h: 667,  touch: true,  tier: 'phone' },
  { name: 'iPhone 14',          w: 390,  h: 844,  touch: true,  tier: 'phone' },
  { name: 'Pixel 7',            w: 412,  h: 915,  touch: true,  tier: 'phone' },
  { name: 'iPhone 14 Pro Max',  w: 430,  h: 932,  touch: true,  tier: 'phone' },
  { name: 'Galaxy Tab',         w: 800,  h: 1280, touch: true,  tier: 'tablet' },
  { name: 'iPad mini',          w: 768,  h: 1024, touch: true,  tier: 'tablet' },
  { name: 'iPad 10.2',          w: 820,  h: 1180, touch: true,  tier: 'tablet' },
  { name: 'iPad Pro 11',        w: 834,  h: 1194, touch: true,  tier: 'tablet' },
  { name: 'iPad Pro 12.9',      w: 1024, h: 1366, touch: true,  tier: 'laptop' },
  { name: 'iPad Pro landscape', w: 1024, h: 768,  touch: true,  tier: 'laptop' },
  { name: 'Surface tablet',     w: 1280, h: 800,  touch: true,  tier: 'laptop' },
  { name: 'short desktop',      w: 900,  h: 700,  touch: false, tier: 'laptop' },
  { name: 'narrow desktop',     w: 860,  h: 900,  touch: false, tier: 'tablet' },
  { name: 'laptop 1280',        w: 1280, h: 800,  touch: false, tier: 'laptop' },
  { name: 'laptop 1366',        w: 1366, h: 768,  touch: false, tier: 'laptop' },
  { name: 'laptop 1440',        w: 1440, h: 900,  touch: false, tier: 'laptop' },
  { name: 'laptop 1600',        w: 1600, h: 900,  touch: false, tier: 'laptop' },
  { name: 'desktop 1920',       w: 1920, h: 1080, touch: false, tier: 'laptop' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  let bad = 0;

  console.log('device                 size         mode      spine  2col  stageH  vh    overflow  verdict');
  for (const d of DEVICES) {
    const page = await browser.newPage({
      viewport: { width: d.w, height: d.h },
      isMobile: d.touch,
      hasTouch: d.touch,
    });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(ORIGIN, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
    await page.waitForTimeout(650);

    const m = await page.evaluate(() => {
      const stage = document.getElementById('techStage');
      const items = [...document.querySelectorAll('.tech-layer')];
      const rail = document.querySelector('.tech-rail');
      const body = document.querySelector('.tl-body');
      return {
        stageH: Math.round(stage.getBoundingClientRect().height),
        vh: window.innerHeight,
        pinned: !!stage.closest('.pin-spacer'),
        spine: !!rail && getComputedStyle(rail).display !== 'none',
        twoCol: body ? getComputedStyle(body).display === 'grid' : false,
        layerWidths: items.map((e) => Math.round(e.getBoundingClientRect().width)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    // Walk the section and record the highlight as it advances.
    const seq = [];
    const prog = [];
    const SAMPLES = 16;
    for (let i = 0; i <= SAMPLES; i++) {
      const y = await page.evaluate((frac) => {
        const sp = document.querySelector('.pin-spacer');
        const st = document.getElementById('techStage');
        const top = sp ? sp.getBoundingClientRect().top + window.scrollY
                       : st.getBoundingClientRect().top + window.scrollY;
        const len = sp ? sp.getBoundingClientRect().height - st.getBoundingClientRect().height
                       : st.getBoundingClientRect().height;
        const pad = sp ? 0 : window.innerHeight * 0.4;
        return top - pad + len * frac;
      }, i / SAMPLES);
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(220);
      const s = await page.evaluate(() => ({
        active: [...document.querySelectorAll('.tech-layer')].findIndex((e) => e.classList.contains('is-active')),
        p: parseFloat(document.getElementById('techStage').style.getPropertyValue('--p') || '0'),
      }));
      if (!seq.length || seq[seq.length - 1] !== s.active) seq.push(s.active);
      prog.push(s.p);
    }

    const forwardOnly = seq.every((v, i) => i === 0 || v >= seq[i - 1]);
    const progressUp = prog.every((v, i) => i === 0 || v >= prog[i - 1] - 0.02);
    const reachedLast = seq[seq.length - 1] === 3;
    const fits = m.stageH + 56 <= m.vh;
    // Pin exactly when the tier says a pointer device that is wide enough and
    // has room: never on touch, never on a phone, never if the stage overflows.
    const shouldPin = !d.touch && d.w > 860 && fits;
    const shouldSpine = d.w >= 768;
    const shouldTwoCol = d.w >= 1000;

    const problems = [];
    if (m.pinned !== shouldPin) problems.push(`pin=${m.pinned} want=${shouldPin}`);
    if (m.spine !== shouldSpine) problems.push(`spine=${m.spine} want=${shouldSpine}`);
    if (m.twoCol !== shouldTwoCol) problems.push(`2col=${m.twoCol} want=${shouldTwoCol}`);
    if (m.overflow > 0) problems.push(`overflow=${m.overflow}px`);
    if (m.layerWidths.some((w) => w <= 0)) problems.push('layer has no width');
    if (!reachedLast) problems.push('never reached layer 04');
    if (!forwardOnly) problems.push('highlight went backwards');
    if (!progressUp) problems.push('progress regressed');
    if (errs.length) problems.push('errors: ' + errs.join(';'));

    if (problems.length) bad++;
    console.log(
      `${d.name.padEnd(21)} ${(d.w + 'x' + d.h).padEnd(12)} ${(m.pinned ? 'PINNED' : 'scroll ').padEnd(9)} ` +
      `${(m.spine ? 'yes' : 'no ').padEnd(6)} ${(m.twoCol ? 'yes' : 'no ').padEnd(5)} ` +
      `${String(m.stageH).padEnd(7)} ${String(m.vh).padEnd(5)} ${String(m.overflow).padEnd(9)} ` +
      (problems.length ? 'BROKEN ' + problems.join('; ') : 'ok'));
    await page.close();
  }
  await browser.close();
  console.log(bad ? `\n${bad} of ${DEVICES.length} device(s) broken\n` : `\nall ${DEVICES.length} devices match their tier and run the sequence\n`);
  if (bad) process.exitCode = 1;
})();
