/**
 * SEO audit of the rendered blog output. Run: node scripts/audit-seo.js
 * Reports what is present, what is wrong, and what is missing.
 */
'use strict';

process.env.SITE_URL = process.env.SITE_URL || 'https://www.kodsol.com';
const fs = require('fs');
const path = require('path');
const { renderListing, renderArticle, renderNotFound } = require('../api/_lib/views');
const posts = require('./mock-posts');

const root = path.join(__dirname, '..');

const article = renderArticle({
  post: posts[0],
  prev: { title: 'p', slug: posts[3].slug },
  next: { title: 'n', slug: posts[1].slug },
});
const listing = renderListing({ posts, total: 47, page: 1, perPage: 12 });
const page2 = renderListing({ posts: posts.slice(0, 2), total: 47, page: 2, perPage: 12 });
const nf = renderNotFound();

const rows = [];
/**
 * @param detail  shown when the check passes (a measurement, e.g. "78 chars")
 * @param hint    shown when the check fails (how to fix it)
 */
const add = (area, check, ok, detail = '', hint = '') => rows.push({ area, check, ok, detail, hint });

// Length limits are defined in characters as a search engine reads them, so
// measure decoded text. "&amp;" is 5 bytes in the source but 1 character in a
// SERP, and over-counting it produces false failures on perfectly good titles.
const decode = (s) => String(s)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&nbsp;/g, ' ');

// ---------- per-page basics ----------
for (const [name, html] of [['listing', listing], ['article', article]]) {
  const t = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] || '');
  const d = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] || '');
  const c = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] || '';
  add(name, 'has <title>', !!t, t);
  add(name, 'title length 15-60', t.length >= 15 && t.length <= 60, `${t.length} chars`, `${t.length} chars: "${t}"`);
  add(name, 'meta description', !!d, `${d.length} chars`);
  add(name, 'description length 70-160', d.length >= 70 && d.length <= 160, `${d.length} chars`);
  add(name, 'canonical is absolute', /^https?:\/\//.test(c), c);
  add(name, 'html lang set', /<html lang="en">/.test(html));
  add(name, 'viewport set', /name="viewport"/.test(html));
  add(name, 'exactly one h1', (html.match(/<h1[\s>]/g) || []).length === 1, `${(html.match(/<h1[\s>]/g) || []).length} found`);
  add(name, 'og:title', /property="og:title"/.test(html));
  add(name, 'og:description', /property="og:description"/.test(html));
  add(name, 'og:url', /property="og:url"/.test(html));
  add(name, 'og:type', /property="og:type"/.test(html));
  add(name, 'og:image', /property="og:image" content="https?:\/\/[^"]+"/.test(html),
    (html.match(/property="og:image" content="([^"]*)"/) || [])[1], 'MISSING or relative - social shares render blank');
  add(name, 'twitter:card', /name="twitter:card"/.test(html));
  add(name, 'twitter:image', /name="twitter:image" content="https?:\/\/[^"]+"/.test(html), '', 'MISSING or relative');
  add(name, 'theme-color', /name="theme-color"/.test(html));
  add(name, 'favicon', /rel="icon"/.test(html));
  add(name, 'JSON-LD present', /application\/ld\+json/.test(html));
}

// ---------- article specifics ----------
add('article', 'og:type=article', /og:type" content="article"/.test(article));
add('article', 'article:published_time', /article:published_time" content="\d{4}-\d{2}-\d{2}T/.test(article),
  (article.match(/article:published_time" content="([^"]*)"/) || [])[1], 'MISSING');
add('article', 'article:modified_time', /article:modified_time" content="\d{4}-\d{2}-\d{2}T/.test(article),
  (article.match(/article:modified_time" content="([^"]*)"/) || [])[1], 'MISSING');
add('article', 'BlogPosting JSON-LD', /"@type":"BlogPosting"/.test(article));
add('article', 'datePublished', /"datePublished":"\d{4}-\d{2}-\d{2}T/.test(article));
add('article', 'dateModified', /"dateModified":"\d{4}-\d{2}-\d{2}T/.test(article));
add('article', 'BreadcrumbList JSON-LD', /"@type":"BreadcrumbList"/.test(article));
add('article', 'author in JSON-LD', /"author":\{/.test(article));
add('article', 'visible breadcrumbs', /class="crumbs"/.test(article));
add('article', 'headline <=110 chars', (() => {
  const m = article.match(/"headline":"([^"]*)"/);
  return m ? m[1].length <= 110 : false;
})());
add('article', 'internal link to /blog', /href="\/blog"/.test(article));
add('article', 'prev/next internal links', /pn-card/.test(article));
add('article', 'time datetime attr', /<time datetime="\d{4}-\d{2}-\d{2}T/.test(article));
add('article', 'no GSAP payload', !/gsap\.min\.js/.test(article));

// ---------- listing specifics ----------
add('listing', 'Blog JSON-LD', /"@type":"Blog"/.test(listing));
add('listing', 'CollectionPage on paged view', /"@type":"CollectionPage"/.test(page2));
add('listing', 'page 2 canonical distinct', /page=2/.test(page2));
add('listing', 'pager links', /page=2/.test(listing));

// ---------- 404 ----------
add('404', 'noindex directive', /noindex/.test(nf));
add('404', 'renders a real page', /<h1/.test(nf));

// ---------- project-level ----------
const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
add('robots.txt', 'exists', true);
add('robots.txt', 'allows crawling', /Allow:\s*\//.test(robots));
add('robots.txt', 'points at sitemap', /Sitemap:/.test(robots));
add('robots.txt', 'blocks /api/', /Disallow: \/api\//.test(robots));

const vj = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
add('routing', '/blog rewrite', vj.rewrites.some((r) => r.source === '/blog'));
add('routing', '/blog/:slug* rewrite', vj.rewrites.some((r) => r.source === '/blog/:slug*'));
add('routing', '/sitemap.xml rewrite', vj.rewrites.some((r) => r.source === '/sitemap.xml'));
add('routing', '/feed.xml rewrite', vj.rewrites.some((r) => r.source === '/feed.xml'));
add('routing', '/api/* noindex header', vj.headers.some((h) => h.source === '/api/(.*)'));
add('routing', 'security headers', vj.headers.some((h) => h.headers.some((x) => x.key === 'Strict-Transport-Security')));

const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const REBUILD = 'rebuild with: npm run build:index -- --url <real origin>';
add('homepage', 'canonical is NOT the placeholder', !/kodsol\.example/.test(home), '', `still https://kodsol.example - ${REBUILD}`);
add('homepage', 'og:url set', /property="og:url"/.test(home), '', `MISSING - ${REBUILD}`);
add('homepage', 'og:image set', /property="og:image"/.test(home), '', `MISSING - ${REBUILD}`);

// The original homepage stays on disk as the design source of truth, so it must
// be unreachable over HTTP or it competes with / in search results.
const stray = fs.readdirSync(root).filter((f) => f.toLowerCase().endsWith('.html') && f !== 'index.html');
const redirectFor = (f) => (vj.redirects || []).some(
  (r) => r.destination === '/' && r.permanent === true && r.source.replace(/^\//, '').toLowerCase() === f.toLowerCase()
);
const uncovered = stray.filter((f) => !redirectFor(f));
add('site', 'no duplicate homepage served', uncovered.length === 0,
  stray.length ? 'source kept on disk, 301 to /' : 'only index.html at root',
  uncovered.length
    ? `${uncovered.length} .html file(s) at root with no 301: ${uncovered.join(' | ')}`
    : '');

add('site', 'RSS/Atom feed route',
  vj.rewrites.some((r) => r.source === '/feed.xml') && fs.existsSync(path.join(root, 'api', 'feed.js')),
  '/feed.xml -> /api/feed', 'add the rewrite and api/feed.js');
add('site', 'feed linked in page head', /application\/rss\+xml/.test(article), '', 'no <link rel="alternate"> for the feed');
add('site', 'default og:image exists', fs.existsSync(path.join(root, 'assets', 'og-default.png')),
  'assets/og-default.png (1200x630)', 'run npm run build:og, then shoot assets/og-default.html at 1200x630 to assets/og-default.png');
add('site', 'og:image is absolute (no-cover fallback)', /og:image" content="https?:\/\//.test(article),
  'absolute fallback resolves', 'fallback image is relative; crawlers may reject it');

// Google Fonts woff2 URLs are versioned and rotate, so a hardcoded preload
// silently 404s. preconnect + display=swap is the durable equivalent.
add('site', 'fonts use display=swap (non-blocking text)',
  /family=Inter[^"']*display=swap/.test(article), '', 'no display=swap; text waits on fonts');
add('site', 'preconnect to font origins',
  /rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/.test(article) &&
  /rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/.test(article), '', 'missing preconnect to fonts.gstatic.com');

// ---------- report ----------
const byArea = {};
for (const r of rows) (byArea[r.area] ||= []).push(r);

let pass = 0, fail = 0;
for (const [area, list] of Object.entries(byArea)) {
  console.log(`\n${area.toUpperCase()}`);
  for (const r of list) {
    if (r.ok) { pass++; console.log(`  ok    ${r.check}${r.detail ? '  (' + r.detail + ')' : ''}`); }
    else { fail++; const why = r.hint || r.detail; console.log(`  GAP   ${r.check}${why ? '  -> ' + why : ''}`); }
  }
}
console.log(`\n${'='.repeat(60)}\n${pass} passed, ${fail} need attention`);
console.log('\nNOTE: article/listing checks above ran with a cover-less mock post,');
console.log('so og:image absence there is expected; the real question is the');
console.log('no-cover fallback, which is currently missing entirely.');
