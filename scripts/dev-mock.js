/**
 * Local dev server that serves the whole site with working /blog routes,
 * backed by mock data. This exists because the blog links are absolute paths
 * (/blog), which a browser cannot resolve when index.html is opened from disk
 * with file:// — that produces ERR_FILE_NOT_FOUND.
 *
 *   node scripts/dev-mock.js        ->  http://localhost:3000
 *
 * Uses the same renderers as production, so what you see here is what Vercel
 * will serve. Swap the mock data for the Supabase queries when ready.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
process.env.SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

const { renderListing, renderArticle, renderNotFound } = require('../api/_lib/views');
const { isValidSlug } = require('../api/_lib/content');
const posts = require('./mock-posts');

const PORT = Number(process.env.PORT || 3000);
const STATIC = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const send = (res, status, type, body) => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let p = decodeURIComponent(url.pathname);

  // --- blog routes (mirror vercel.json rewrites) --------------------------
  if (p === '/blog' || p === '/blog/') {
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
    const perPage = 12;
    const slice = posts.slice((page - 1) * perPage, page * perPage);
    return send(res, 200, 'text/html; charset=utf-8',
      renderListing({ posts: slice, total: posts.length, page, perPage }));
  }

  if (p.startsWith('/blog/')) {
    const slug = p.slice('/blog/'.length);
    if (!isValidSlug(slug)) return send(res, 404, 'text/html; charset=utf-8', renderNotFound());
    const i = posts.findIndex((x) => x.slug === slug);
    if (i === -1) return send(res, 404, 'text/html; charset=utf-8', renderNotFound());
    return send(res, 200, 'text/html; charset=utf-8',
      renderArticle({
        post: posts[i],
        prev: i > 0 ? { title: posts[i - 1].title, slug: posts[i - 1].slug } : null,
        next: i < posts.length - 1 ? { title: posts[i + 1].title, slug: posts[i + 1].slug } : null,
      }));
  }

  if (p === '/feed.xml') {
    const base = process.env.SITE_URL;
    const items = posts.map((x) => [
      '    <item>',
      `      <title>${x.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`,
      `      <link>${base}/blog/${x.slug}</link>`,
      `      <guid isPermaLink="true">${base}/blog/${x.slug}</guid>`,
      `      <pubDate>${new Date(x.publishedAt).toUTCString()}</pubDate>`,
      `      <description>${(x.excerpt || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</description>`,
      '    </item>',
    ].join('\n')).join('\n');
    return send(res, 200, 'application/rss+xml; charset=utf-8',
      `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n` +
      `    <title>Kodsol — Software. AI. Automation. Growth.</title>\n` +
      `    <link>${base}/blog</link>\n` +
      `    <description>Articles from the Kodsol team.</description>\n` +
      `    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>\n` +
      `${items}\n  </channel>\n</rss>\n`);
  }

  if (p === '/sitemap.xml') {
    const base = process.env.SITE_URL;
    const urls = [
      `<url><loc>${base}/</loc><priority>1.0</priority></url>`,
      `<url><loc>${base}/blog</loc><priority>0.8</priority></url>`,
      ...posts.map((x) => `<url><loc>${base}/blog/${x.slug}</loc><lastmod>${x.updatedAt || x.publishedAt}</lastmod></url>`),
    ];
    return send(res, 200, 'application/xml; charset=utf-8',
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  }

  // --- static files -------------------------------------------------------
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);

  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<h1>404</h1><p>Not found: <code>${p}</code></p><p><a href="/">Home</a></p>`);
  }

  send(res, 200, STATIC[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
});

// A raw EADDRINUSE stack trace tells the user nothing about what to do next.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use - another dev server is probably running.\n`);
    console.error(`  Find it:   netstat -ano | findstr :${PORT}\n`);
    console.error(`  Then kill it:  taskkill /PID <pid> /F\n`);
    console.error(`  Or use a different port:  set PORT=${PORT + 1} && npm run dev\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`\n  Kodsol dev server (mock data)\n`);
  console.log(`  http://localhost:${PORT}/`);
  console.log(`  http://localhost:${PORT}/blog`);
  posts.forEach((x) => console.log(`  http://localhost:${PORT}/blog/${x.slug}`));
  console.log(`  http://localhost:${PORT}/sitemap.xml`);
  console.log(`  http://localhost:${PORT}/feed.xml\n`);
  console.log(`  Nav links and the Blog button now resolve correctly.`);
  console.log(`  Open http://localhost:${PORT} in the browser - do not open the .html file directly.\n`);
});
