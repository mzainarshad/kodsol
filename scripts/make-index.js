/**
 * Bootstraps index.html (the path Vercel serves at /) from the original
 * homepage, adding only: a Blog link in the nav / mobile menu / footer,
 * favicon tags, and optionally real canonical/OG tags.
 *
 * The original file is left completely untouched.
 *
 * NOTE: index.html is now hand-edited (section animations, SEO copy). This
 * script is a ONE-TIME bootstrap, not a build step. Running it again would
 * discard every manual change, so it refuses to overwrite unless you pass
 * --force. The original .html file remains the pristine design reference.
 *
 * Run: node scripts/make-index.js
 *      node scripts/make-index.js --url https://www.kodsol.com
 *      node scripts/make-index.js --force
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..');

// Optional --url sets the canonical origin, og:url and og:image.
const argv = process.argv.slice(2);
const urlIdx = argv.indexOf('--url');
const SITE = (urlIdx >= 0 ? argv[urlIdx + 1] : process.env.SITE_URL || '').replace(/\/+$/, '');
const FORCE = argv.includes('--force');

const src = fs.readdirSync(dir).find((n) => n.toLowerCase().endsWith('.html') && n !== 'index.html');
if (!src) throw new Error('source homepage not found');

const destPath = path.join(dir, 'index.html');

// Guard: never silently clobber hand-edited output.
if (fs.existsSync(destPath) && !FORCE) {
  const existing = fs.readFileSync(destPath, 'utf8');
  console.error('\n  index.html already exists and is hand-edited. Refusing to overwrite.\n');
  console.error(`  current: ${existing.length} bytes`);
  console.error('  This script is a one-time bootstrap from the original file, not a build step.');
  console.error('  If you really want to regenerate and lose your edits:');
  console.error('      node scripts/make-index.js --url https://yourdomain.com --force\n');
  process.exit(1);
}

let html = fs.readFileSync(path.join(dir, src), 'utf8');
const before = html.length;
const applied = [];
const skip = (label, cond) => {
  if (cond) applied.push(`SKIP (already present) ${label}`);
};

const edits = [
  // 1. desktop nav
  [
    'nav: Blog link',
    `        <li><a href="#technology">Technology</a></li>
        <li><a href="#contact">Contact</a></li>`,
    `        <li><a href="#technology">Technology</a></li>
        <li><a href="/blog">Blog</a></li>
        <li><a href="#contact">Contact</a></li>`,
  ],
  // 2. mobile menu
  [
    'mobile menu: Blog link',
    `  <a href="#technology">Technology</a>
  <a href="#contact">Contact</a>`,
    `  <a href="#technology">Technology</a>
  <a href="/blog">Blog</a>
  <a href="#contact">Contact</a>`,
  ],
  // 3. footer column
  [
    'footer: Blog column',
    `        <div class="foot-col">
          <h4>Contact</h4>
          <a href="mailto:hello@kodsol.com">hello@kodsol.com</a>`,
    `        <div class="foot-col">
          <h4>Blog</h4>
          <a href="/blog">All articles</a>
          <a href="#contact">Work with us</a>
        </div>
        <div class="foot-col">
          <h4>Contact</h4>
          <a href="mailto:hello@kodsol.com">hello@kodsol.com</a>`,
  ],
  // 4. icons
  [
    'favicon + theme-color tags',
    '<link rel="canonical"',
    `<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#07080c">
<link rel="canonical"`,
  ],
];

// 5. canonical / og:url / og:image — only when a real origin is known.
// The source file ships with the placeholder https://kodsol.example, which
// must never reach production.
if (SITE) {
  const desc = 'Kodsol builds intelligent software, AI automation and digital growth systems that help businesses work smarter, move faster and scale further.';
  edits.push(
    [
      'canonical -> real origin',
      '<link rel="canonical" href="https://kodsol.example">',
      `<link rel="canonical" href="${SITE}/">`,
    ],
    [
      'og:url',
      '<meta property="og:type" content="website">',
      `<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/">
<meta property="og:image" content="${SITE}/assets/og-default.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:image" content="${SITE}/assets/og-default.png">
<link rel="alternate" type="application/rss+xml" title="Kodsol Blog" href="${SITE}/feed.xml">`,
    ],
  );
} else {
  console.warn('  note: no --url / SITE_URL given, leaving the placeholder canonical in place.');
  console.warn('        Re-run with:  node scripts/make-index.js --url https://www.yourdomain.com');
}

for (const [label, from, to] of edits) {
  if (html.includes(to)) {
    skip(label);
    continue;
  }
  if (!html.includes(from)) {
    console.error(`  !! anchor not found for: ${label}`);
    process.exitCode = 1;
    continue;
  }
  html = html.replace(from, () => to);
  applied.push(`applied  ${label}`);
}

fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
console.log(`source : ${src}`);
console.log(`wrote  : index.html  (${before} -> ${html.length} bytes)`);
applied.forEach((a) => console.log(`  ${a}`));
