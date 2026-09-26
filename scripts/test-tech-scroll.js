/**
 * Drives the homepage in a real browser and verifies the 05 — Technology
 * section actually animates in scroll sequence, in both directions.
 *
 * Static regex checks cannot prove that ScrollTrigger pins, that the rail
 * fills, or that scrolling back unwinds. This does.
 *
 *   node scripts/test-tech-scroll.js
 *   node scripts/test-tech-scroll.js --headed
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ORIGIN = process.env.SITE_URL || 'http://localhost:3000';
const HEADED = process.argv.includes('--headed');
const SHOT_DIR = path.join(__dirname, '..', '.preview', 'tech');

// Reuse a browser Playwright already installed rather than downloading one.
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

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? '  (' + detail + ')' : ''}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? '  -> ' + detail : ''}`); }
};

/** Reads the live animation state out of the page. */
const probe = (page) => page.evaluate(() => {
  const stage = document.getElementById('techStage');
  const items = [...document.querySelectorAll('.tech-layer')];
  return {
    p: parseFloat(stage.style.getPropertyValue('--p') || '0'),
    counter: (document.getElementById('techCount') || {}).textContent,
    meter: (document.getElementById('techMeterLabel') || {}).textContent,
    active: items.findIndex((el) => el.classList.contains('is-active')),
    done: items.filter((el) => el.classList.contains('is-done')).length,
    hasSpacer: !!document.querySelector('.pin-spacer'),
    stageTop: Math.round(stage.getBoundingClientRect().top),
    stageH: Math.round(stage.getBoundingClientRect().height),
    viewportH: window.innerHeight,
    stageFullyVisible: (() => {
      const r = stage.getBoundingClientRect();
      return r.top >= -1 && r.bottom <= window.innerHeight + 1;
    })(),
    opacity: items.map((el) => parseFloat(getComputedStyle(el).opacity)),
    pillVisible: items.map((el) => {
      const p = el.querySelector('.tech-pill');
      if (!p) return 0;
      const r = p.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? 1 : 0;
    }),
  };
});

/**
 * Document offset where the pin begins. ScrollTrigger pins at 'top top', so the
 * pin starts when the stage's document top reaches the viewport top. Deriving it
 * matters: scrollIntoViewIfNeeded overshoots the whole pinned range, which is
 * why a naive walk reports progress=1 at every step.
 */
const pinStart = (page) => page.evaluate(() => {
  const sp = document.querySelector('.pin-spacer');
  const stage = document.getElementById('techStage');
  if (sp) return sp.getBoundingClientRect().top + window.scrollY;
  return stage.getBoundingClientRect().top + window.scrollY;
});

/** Total scrollable length of the pinned range. */
const pinLength = (page) => page.evaluate(() => {
  const sp = document.querySelector('.pin-spacer');
  const stage = document.getElementById('techStage');
  if (sp) return sp.getBoundingClientRect().height - stage.getBoundingClientRect().height;
  return 0;
});

(async () => {
  const exe = findChrome();
  if (!exe) {
    console.log('\n  no chromium found; set CHROME_PATH and re-run\n');
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ executablePath: exe, headless: !HEADED });
  const errors = [];

  try {
    // ---------------- desktop, scrolling down ----------------
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto(ORIGIN, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
    await page.waitForTimeout(600);

    console.log('\nGSAP LOADED');
    const libs = await page.evaluate(() => ({ gsap: !!window.gsap, st: !!window.ScrollTrigger }));
    check('GSAP present', libs.gsap);
    check('ScrollTrigger present', libs.st);

    console.log('\nSECTION GEOMETRY (1440x900)');
    const start0 = await pinStart(page);
    await page.evaluate((y) => window.scrollTo(0, y), start0);
    await page.waitForTimeout(1000);
    const top = await probe(page);
    check('stage has real height', top.stageH > 200, `${top.stageH}px`);
    check('stage fits the viewport while pinned', top.stageFullyVisible,
      `stageH=${top.stageH} viewportH=${top.viewportH}`);
    check('all 4 layers have visible pills', top.pillVisible.every((v) => v === 1), JSON.stringify(top.pillVisible));
    check('a pin-spacer was created (pin active)', top.hasSpacer);
    check('first layer active on entry', top.active === 0, `active=${top.active}`);
    check('counter reads 01', top.counter === '01', `counter=${top.counter}`);
    check('meter label is Interface', top.meter === 'Interface', `meter=${top.meter}`);
    check('rail starts near empty', top.p < 0.2, `--p=${top.p.toFixed(3)}`);
    check('unreached layers are dimmed', top.opacity.slice(1).every((o) => o < 0.9), JSON.stringify(top.opacity));
    await page.screenshot({ path: path.join(SHOT_DIR, '1-entry.png') });

    console.log('\nSCROLL SEQUENCE (down)');
    const len = await pinLength(page);
    const seen = [top.active];
    const prog = [top.p];
    check('pin range is long enough to read', len >= 400, `${len}px over ${4} layers`);
    // Sample the middle of each quarter, not the boundaries: layer i is active
    // for p in [i/total, (i+1)/total), so stepping 0.3/0.55/0.8 would never
    // observe layer 0.
    for (const frac of [0.125, 0.375, 0.625, 0.875, 1]) {
      await page.evaluate((y) => window.scrollTo(0, y), start0 + len * frac);
      await page.waitForTimeout(800);
      const s = await probe(page);
      seen.push(s.active);
      prog.push(s.p);
      console.log(`      step ${frac}: active=${s.active} counter=${s.counter} meter=${s.meter} --p=${s.p.toFixed(3)} done=${s.done}`);
    }

    check('sequence advanced 0->1->2->3 in order',
      JSON.stringify(seen) === JSON.stringify([0, 0, 1, 2, 3, 3]), JSON.stringify(seen));
    check('rail progress increased monotonically',
      prog.every((v, i) => i === 0 || v >= prog[i - 1] - 0.001), prog.map((v) => v.toFixed(2)).join(' -> '));
    const end = await probe(page);
    check('earlier layers marked done at the end', end.done === 3, `done=${end.done}`);
    check('all layers lit at the end', end.opacity.every((o) => o > 0.6), JSON.stringify(end.opacity));
    check('final counter reads 04', end.counter === '04', `counter=${end.counter}`);
    await page.screenshot({ path: path.join(SHOT_DIR, '2-end.png') });

    console.log('\nSCROLL SEQUENCE (up, must unwind)');
    await page.evaluate((y) => window.scrollTo(0, y), start0);
    await page.waitForTimeout(1000);
    const back = await probe(page);
    check('scrolling back returns to layer 1 (0-indexed 0)', back.active === 0, `active=${back.active}`);
    check('scrolling back empties the rail', back.p < 0.2, `--p=${back.p.toFixed(3)}`);
    check('no layers left marked done', back.done === 0, `done=${back.done}`);
    check('counter reset to 01', back.counter === '01', `counter=${back.counter}`);
    await page.screenshot({ path: path.join(SHOT_DIR, '3-scrolled-back.png') });

    // ---------------- reduced motion ----------------
    console.log('\nREDUCED MOTION');
    const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await rm.goto(ORIGIN, { waitUntil: 'networkidle' });
    await rm.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
    await rm.waitForTimeout(700);
    await rm.locator('#technology').scrollIntoViewIfNeeded();
    await rm.waitForTimeout(600);
    const r = await rm.evaluate(() => {
      const items = [...document.querySelectorAll('.tech-layer')];
      return {
        noPin: !document.querySelector('.pin-spacer'),
        allActive: items.every((el) => el.classList.contains('is-active')),
        allOpaque: items.every((el) => getComputedStyle(el).opacity === '1'),
        p: document.getElementById('techStage').style.getPropertyValue('--p'),
      };
    });
    check('no pinning under reduced motion', r.noPin);
    check('all layers visible under reduced motion', r.allActive && r.allOpaque);
    check('rail forced to full under reduced motion', parseFloat(r.p || '0') === 1, `--p=${r.p}`);
    await rm.screenshot({ path: path.join(SHOT_DIR, '4-reduced-motion.png') });
    await rm.close();

    // ---------------- desktop that still fits: pin, but never overflow ----------------
    // The invariant is NOT "no pin on short desktop". 1024x768 leaves 160px of
    // slack here, so pinning is correct and gives the intended scrub. What must
    // never happen is pinning a stage taller than the viewport.
    console.log('\nSHORT DESKTOP (1024x768)');
    const short = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await short.goto(ORIGIN, { waitUntil: 'networkidle' });
    await short.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
    await short.waitForTimeout(600);
    await short.locator('#technology').scrollIntoViewIfNeeded();
    await short.waitForTimeout(700);
    const sd = await short.evaluate(() => {
      const stage = document.getElementById('techStage');
      return {
        techPinned: !!stage.closest('.pin-spacer'),
        stageH: Math.round(stage.getBoundingClientRect().height),
        vh: window.innerHeight,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        layerWidths: [...document.querySelectorAll('.tech-layer')].map((el) => el.getBoundingClientRect().width),
      };
    });
    check('pinned stage fits the viewport, or is not pinned at all',
      !sd.techPinned || sd.stageH <= sd.vh, `pinned=${sd.techPinned} stageH=${sd.stageH} vh=${sd.vh}`);
    check('all layer cards have width on short desktop', sd.layerWidths.every((w) => w > 0), JSON.stringify(sd.layerWidths));
    check('no horizontal overflow on short desktop', sd.overflow <= 0, `${sd.overflow}px`);
    await short.screenshot({ path: path.join(SHOT_DIR, '5-short-desktop.png') });
    await short.close();

    // ---------------- genuinely too short: must fall back, not go inert ----------------
    // Wider than 860px so the width rule cannot be what disables the pin: the
    // only thing that can stop it here is the measured fit test. The stage is
    // ~570px once the two-column card body applies, so a 520px viewport is short
    // enough to force the fallback.
    console.log('\nTOO-SHORT DESKTOP (1100x520)');
    const tiny = await browser.newPage({ viewport: { width: 1100, height: 520 } });
    await tiny.goto(ORIGIN, { waitUntil: 'networkidle' });
    await tiny.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
    await tiny.waitForTimeout(600);
    const tt = await tiny.evaluate(() => {
      const stage = document.getElementById('techStage');
      return { stageH: Math.round(stage.getBoundingClientRect().height), vh: window.innerHeight };
    });
    check('viewport is genuinely shorter than the stage', tt.stageH > tt.vh, `stageH=${tt.stageH} vh=${tt.vh}`);
    await tiny.locator('#technology').scrollIntoViewIfNeeded();
    await tiny.waitForTimeout(700);
    const tf = await tiny.evaluate(() => ({
      pinned: !!document.getElementById('techStage').closest('.pin-spacer'),
      active: [...document.querySelectorAll('.tech-layer')].findIndex((e) => e.classList.contains('is-active')),
      counter: (document.getElementById('techCount') || {}).textContent,
    }));
    check('falls back to scroll-driven when the stage cannot fit', !tf.pinned, `pinned=${tf.pinned}`);
    await tiny.evaluate(() => {
      const stage = document.getElementById('techStage');
      window.scrollTo(0, stage.getBoundingClientRect().top + window.scrollY + stage.offsetHeight);
    });
    await tiny.waitForTimeout(800);
    const tl = await tiny.evaluate(() => ({
      active: [...document.querySelectorAll('.tech-layer')].findIndex((e) => e.classList.contains('is-active')),
      counter: (document.getElementById('techCount') || {}).textContent,
      counterVisible: getComputedStyle(document.querySelector('.tech-meter')).display !== 'none',
    }));
    check('fallback still reaches a later layer', tl.active > tf.active, `${tf.active} -> ${tl.active}`);
    check('fallback counter advances', tl.counter !== tf.counter, `${tf.counter} -> ${tl.counter}`);
    check('layer cards are legible without pinning', tl.counterVisible);
    await tiny.screenshot({ path: path.join(SHOT_DIR, '6-too-short.png') });
    await tiny.close();

    // ---------------- mobile ----------------
    console.log('\nMOBILE (390x844)');
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await m.goto(ORIGIN, { waitUntil: 'networkidle' });
    await m.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
    await m.waitForTimeout(600);
    await m.locator('#technology').scrollIntoViewIfNeeded();
    await m.waitForTimeout(800);
    const mm = await m.evaluate(() => {
      const items = [...document.querySelectorAll('.tech-layer')];
      return {
        noPin: !document.querySelector('.pin-spacer'),
        railHidden: getComputedStyle(document.querySelector('.tech-rail')).display === 'none',
        dotsHidden: getComputedStyle(document.querySelector('.tl-dot')).display === 'none',
        opacity: items.map((el) => parseFloat(getComputedStyle(el).opacity)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        counter: document.getElementById('techCount').textContent,
      };
    });
    check('no pinning on mobile', mm.noPin);
    check('spine hidden on mobile', mm.railHidden);
    check('dot markers hidden on mobile', mm.dotsHidden);
    check('all 4 layers readable on mobile', mm.opacity.every((o) => o > 0.9), JSON.stringify(mm.opacity));
    check('no horizontal overflow on mobile', mm.overflow <= 0, `${mm.overflow}px`);
    await m.screenshot({ path: path.join(SHOT_DIR, '6-mobile.png'), fullPage: false });
    await m.close();

    console.log('\nJS ERRORS');
    check('no page or console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  } finally {
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`screenshots: ${SHOT_DIR}\n`);
  if (fail) process.exitCode = 1;
})();
