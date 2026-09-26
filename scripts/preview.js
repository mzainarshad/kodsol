/**
 * Renders /blog and /blog/<slug> with mock data so the design and SEO output
 * can be inspected before Supabase is reachable. Writes to .preview/.
 *
 *   npm run render:preview
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { renderListing, renderArticle, renderNotFound } = require('../api/_lib/views');

const outDir = path.join(__dirname, '..', '.preview');
fs.mkdirSync(outDir, { recursive: true });

const iso = (d) => new Date(d).toISOString();

const posts = require('./mock-posts');


const write = (name, html) => {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, html, 'utf8');
  console.log(`  wrote ${name.padEnd(34)} ${(html.length / 1024).toFixed(1)} KB`);
};

console.log('Rendering preview pages with mock data...\n');

write('blog.html', renderListing({ posts, total: 47, page: 1, perPage: 12 }));
write('blog-page-2.html', renderListing({ posts: posts.slice(0, 2), total: 47, page: 2, perPage: 12 }));
write('blog-empty.html', renderListing({ posts: [], total: 0, page: 1, perPage: 12 }));
write('article-full.html', renderArticle({
  post: posts[0],
  prev: { title: posts[3].title, slug: posts[3].slug },
  next: { title: posts[1].title, slug: posts[1].slug },
}));
write('article-minimal.html', renderArticle({ post: posts[2], prev: null, next: null }));
write('404.html', renderNotFound());

// --- assertions on the generated markup ------------------------------------
const article = fs.readFileSync(path.join(outDir, 'article-full.html'), 'utf8');
const listing = fs.readFileSync(path.join(outDir, 'blog.html'), 'utf8');
const minimal = fs.readFileSync(path.join(outDir, 'article-minimal.html'), 'utf8');

const checks = [
  ['article body present in initial HTML', article.includes('Start at the handoff, not the form')],
  ['listing shows post titles server-side', listing.includes('Automating the boring half')],
  ['canonical is absolute', /<link rel="canonical" href="https?:\/\/[^"]+\/blog\/[^"]+">/.test(article)],
  ['og:type=article', article.includes('og:type" content="article"')],
  ['BlogPosting JSON-LD present', article.includes('"@type":"BlogPosting"')],
  ['BreadcrumbList JSON-LD present', article.includes('"@type":"BreadcrumbList"')],
  ['Blog JSON-LD on listing', listing.includes('"@type":"Blog"')],
  ['no GSAP loaded on blog pages', !article.includes('gsap.min.js')],
  ['no index.html reference leak', !article.includes('Software. AI. Automation. Growth (1)')],
  ['base64 logo inlined', article.includes('data:image/png;base64,')],
  ['logo declared exactly once (not per-element)', article.split('data:image/png;base64,').length === 2],
  ['external links hardened', !/target="_blank"(?![^>]*rel=)/.test(article)],
  ['404 is noindex', fs.readFileSync(path.join(outDir, '404.html'), 'utf8').includes('noindex')],
  ['no unescaped script tag in JSON-LD', !/"@context":"https:\/\/schema.org"><\/script>/.test(article)],
  ['markdown syntax stripped from excerpts', !listing.includes('## Why we stopped')],
  ['markdown emphasis stripped from excerpts', !/>[^<]*\*\*[^<]*</.test(listing)],
  ['markdown body rendered as real HTML', minimal.includes('<h2>Why we stopped storing HTML</h2>')],
  ['markdown link rendered as anchor', minimal.includes('<strong>Bold</strong>')],
  ['markdown blockquote rendered', minimal.includes('<blockquote>')],
  ['excerpt of markdown post is clean text', /Storing rendered HTML in a database/.test(listing) && !/##/.test(listing)],

  // Logo regressions. The mark is a 600x185 wordmark, so a square chip or
  // background-size:cover silently crops it to an unreadable sliver.
  ['logo keeps the 600/185 aspect ratio', listing.includes('aspect-ratio:600/185')],
  ['logo is not forced square', !/\.logo-chip\{[^}]*width:44px/.test(listing)],
  ['logo does not use background-size:cover', !/\.logo-chip::before\{[^}]*cover/.test(listing)],
  ['logo uses contain so it is never cropped', /\.logo-chip::before\{[^}]*center\/contain no-repeat/.test(listing)],
  ['logo chip keeps the light pill gradient', /\.logo-chip\{[^}]*linear-gradient\(155deg,#f8fafc,#e5e9f0\)/.test(listing)],
  ['logo chip keeps the drop shadow', /\.logo-chip\{[^}]*box-shadow:0 10px 24px/.test(listing)],
  ['logo has an accessible name', listing.includes('role="img" aria-label="Kodsol"')],
  ['footer logo is the larger 30px variant', /\.foot-brand \.logo-chip::before\{height:30px;\}/.test(listing)],
];

console.log('\nChecks:');
let failed = 0;
for (const [label, pass] of checks) {
  if (!pass) failed++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}`);
}
console.log(`\n${failed === 0 ? 'All checks passed.' : failed + ' check(s) failed.'}`);
process.exit(failed === 0 ? 0 : 1);
