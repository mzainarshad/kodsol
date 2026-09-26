'use strict';
/** Text-level inspection of the rendered sample-fallback page, for review without images. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const f = path.join(os.tmpdir(), 'opencode', 'fallback-blog.html');
const h = fs.readFileSync(f, 'utf8');

const text = h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#\d+;/g, '')
  .split('\n').map((s) => s.trim()).filter(Boolean);

const show = (label, re) => {
  const m = text.filter((t) => re.test(t));
  console.log(`  ${label}:`);
  m.slice(0, 6).forEach((t) => console.log('     - ' + t.slice(0, 110)));
  if (!m.length) console.log('     (none)');
};

console.log('  --- structure ---');
console.log('     <style> blocks :', (h.match(/<style/g) || []).length);
console.log('     h1             :', (h.match(/<h1[^>]*>([^<]*)/g) || []).map((s) => s.replace(/<[^>]+>/g, '')).join(' / '));
console.log('     <article>      :', (h.match(/<article/g) || []).length);
console.log('     unclosed tags  :', /<\/html>\s*$/.test(h.trim()) ? 'no, closes cleanly' : 'YES - truncated');

console.log('  --- banner ---');
show('notice', /Sample content|demonstration posts|DATABASE_URL/i);

console.log('  --- post titles ---');
show('titles', /boring half|Retrieval|Markdown|CDN|cache/i);

console.log('  --- index safety ---');
console.log('     robots         :', (h.match(/name="robots" content="[^"]*"/) || ['(none)'])[0]);
console.log('     canonical      :', (h.match(/rel="canonical" href="[^"]*"/) || ['(none)'])[0]);
console.log('     og:url         :', (h.match(/property="og:url" content="[^"]*"/) || ['(none)'])[0]);
