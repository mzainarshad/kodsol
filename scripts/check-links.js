// Verifies that index.html links to the blog, and where.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const lines = html.split('\n');
const lineOf = (idx) => html.slice(0, idx).split('\n').length;

const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];

const blogLinks = anchors
  .map((m) => ({ href: m[1], text: m[2].replace(/\s+/g, ' ').trim(), line: lineOf(m.index) }))
  .filter((a) => /blog/i.test(a.href) || /blog/i.test(a.text));

console.log(`total <a> in index.html: ${anchors.length}`);
console.log(`\nBlog links found: ${blogLinks.length}`);
blogLinks.forEach((a) => console.log(`  line ${String(a.line).padStart(4)}  href="${a.href}"  text="${a.text}"`));

const expected = [
  { where: 'desktop nav', label: 'Blog' },
  { where: 'mobile menu', label: 'Blog' },
  { where: 'footer', label: 'All articles' },
];

console.log('\nRequired links:');
let ok = true;
for (const e of expected) {
  const hit = blogLinks.find((a) => a.text === e.label && a.href === '/blog');
  if (hit) console.log(`  ok    ${e.where.padEnd(13)} -> href="/blog" text="${hit.text}" (line ${hit.line})`);
  else { ok = false; console.log(`  FAIL  ${e.where.padEnd(13)} -> no <a href="/blog"> with text "${e.label}"`); }
}

// Which context does each link sit in?
function contextOf(line) {
  const navStart = html.indexOf('nav-links');
  const navEnd = html.indexOf('</ul>', navStart);
  const mmStart = html.indexOf('mobile-menu');
  const mmEnd = html.indexOf('</div>', mmStart);
  const footStart = html.indexOf('<footer');
  const idx = html.split('\n').slice(0, line).join('\n').length;
  if (idx > navStart && idx < navEnd) return 'desktop nav';
  if (idx > mmStart && idx < mmEnd) return 'mobile menu';
  if (idx > footStart) return 'footer';
  return 'unknown';
}

console.log('\nContext of each blog link:');
blogLinks.forEach((a) => console.log(`  "${a.text}" -> ${contextOf(a.line)}`));

console.log(`\n${ok ? 'index.html IS linked to the blog.' : 'index.html is MISSING blog links.'}`);
process.exit(ok ? 0 : 1);
