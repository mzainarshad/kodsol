/**
 * Sets the production origin in index.html without regenerating the file.
 *
 * index.html is hand-edited, so scripts/make-index.js must never run again.
 * This patches only the canonical / og:url / og:image / twitter:image / feed
 * link, which is all the domain actually affects.
 *
 *   node scripts/set-site-url.js https://www.kodsol.com
 *   node scripts/set-site-url.js --check
 */
'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.html');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
// Any non-flag argument is an intended origin, even a malformed one, so it gets
// validated and rejected loudly instead of silently falling through to --check.
const ORIGIN = argv.find((a) => !a.startsWith('--')) || '';

// Validate before touching anything: a bad canonical is worse than a placeholder
// one, because it points search engines at someone else's site.
const validate = (o) => {
  let u;
  try { u = new URL(o); } catch { return 'not a valid URL'; }
  if (!/^https?:$/.test(u.protocol)) return 'must start with http:// or https://';
  if (u.search || u.hash || u.pathname !== '/') return 'must be a bare origin, e.g. https://www.kodsol.com (no path, query or #)';
  if (u.hostname === 'kodsol.example') return 'refusing to write the placeholder domain';
  return null;
};

let html = fs.readFileSync(file, 'utf8');
const current = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '(none)';

if (CHECK || !ORIGIN) {
  const problems = [];
  // Scan the whole document, not just <link rel="canonical">: the placeholder has
  // also survived inside the Organization JSON-LD "url" field, which is what
  // search engines read for the publisher's identity.
  const stray = html.match(/https?:\/\/kodsol\.example[^"'\s]*/g) || [];
  if (stray.length) problems.push(`placeholder domain still present in ${stray.length} place(s): ${[...new Set(stray)].join(' | ')}`);
  if (!/property="og:url"/.test(html)) problems.push('og:url is missing');
  if (!/property="og:image"/.test(html)) problems.push('og:image is missing');
  if (!/name="twitter:image"/.test(html)) problems.push('twitter:image is missing');
  if (!/application\/rss\+xml/.test(html)) problems.push('feed link is missing');

  console.log(`  current canonical: ${current}`);
  if (problems.length) {
    problems.forEach((p) => console.log(`  MISSING  ${p}`));
    console.log(`\n  fix with:  node scripts/set-site-url.js https://<yourdomain>\n`);
    process.exitCode = 1;
  } else {
    console.log('  origin is set and consistent\n');
  }
  return;
}

const origin = ORIGIN.replace(/\/+$/, '');
const bad = validate(origin);
if (bad) {
  console.error(`\n  invalid origin "${origin}": ${bad}\n`);
  process.exit(1);
}

const edits = [
  ['canonical', /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${origin}/">`],
  // Organization JSON-LD "url" identifies the publisher to search engines.
  // The key is "@type" in compact JSON-LD but plain "type" if it is ever re-serialised.
  ['organization json-ld', /("?@?type"\s*:\s*"Organization"[\s\S]{0,400}?"url"\s*:\s*")([^"]*)(")/, (m, a, _old, b) => `${a}${origin}/${b}`],
  ['og:url', null, `<meta property="og:url" content="${origin}/">`],
  ['og:image', null, `<meta property="og:image" content="${origin}/assets/og-default.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="Kodsol — Software, AI, Automation, Growth">\n<meta name="twitter:image" content="${origin}/assets/og-default.png">`],
  ['feed link', null, `<link rel="alternate" type="application/rss+xml" title="Kodsol Blog" href="${origin}/feed.xml">`],
];

let n = 0;
for (const [label, re, tag] of edits) {
  if (re) {
    if (!re.test(html)) {
      console.error(`  !! ${label}: expected tag not found`);
      process.exitCode = 1;
      continue;
    }
    // A function replacement is used as-is so capture groups can be rebuilt;
    // a string replacement goes through a thunk so "$" in the tag stays literal.
    html = html.replace(re, typeof tag === 'function' ? tag : () => tag);
  } else {
    if (html.includes(tag.split('\n')[0])) continue; // already present
    // og:url / og:image / feed go right after og:type; feed goes in <head>
    const anchor = '<meta property="og:type" content="website">';
    if (label === 'feed link') {
      if (!html.includes(anchor)) { console.error('  !! feed link: og:type anchor not found'); process.exitCode = 1; continue; }
      html = html.replace(anchor, () => anchor + '\n' + tag);
    } else {
      if (!html.includes(anchor)) { console.error(`  !! ${label}: og:type anchor not found`); process.exitCode = 1; continue; }
      html = html.replace(anchor, () => anchor + '\n' + tag);
    }
  }
  n++;
}

// Safety net: the tag list above is hand-maintained, so anything it misses would
// ship a placeholder domain to production. Sweep the whole document and refuse to
// finish while any reference survives.
const leftover = html.match(/https?:\/\/kodsol\.example[^"'\s]*/g) || [];
if (leftover.length) {
  console.error(`  !! ${leftover.length} placeholder reference(s) survived: ${[...new Set(leftover)].join(' | ')}`);
  process.exitCode = 1;
} else {
  html = html.split('kodsol.example').join(origin);
}

fs.writeFileSync(file, html, 'utf8');
console.log(`  set origin -> ${origin}  (${n} tag groups patched)`);
console.log(`  index.html now ${fs.statSync(file).size} bytes\n`);
