/**
 * /api/sitemap — dynamic sitemap.xml
 *
 * Only published posts are listed, and a draft that gets unpublished
 * disappears on the next revalidation instead of lingering as a 404.
 */
'use strict';

const blog = require('./_lib/blog');
const { isValidSlug } = require('./_lib/content');
const { siteUrl } = require('./_lib/theme');

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

const xmlEscape = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', CACHE_CONTROL);

  const base = siteUrl('');

  // Without SITE_URL there is nothing meaningful to advertise, and a relative
  // sitemap is invalid, so fail visibly rather than emit a broken file.
  if (!base) {
    console.error('[sitemap] SITE_URL is not set — refusing to emit a relative sitemap');
    return res.status(503).end('SITE_URL is not configured.');
  }

  let entries = [];
  try {
    entries = await blog.listSitemapEntries();
  } catch (err) {
    console.error('[sitemap] failed:', (err && err.code) || 'UNKNOWN');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end('Sitemap temporarily unavailable.');
  }

  const urls = [
    { loc: `${base}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${base}/blog`, priority: '0.8', changefreq: 'weekly' },
    ...entries
      .filter((e) => isValidSlug(e.slug))
      .map((e) => ({
        loc: `${base}/blog/${e.slug}`,
        lastmod: e.lastmod,
        priority: '0.7',
        changefreq: 'monthly',
      })),
  ];

  const body = urls
    .map((u) =>
      [
        '  <url>',
        `    <loc>${xmlEscape(u.loc)}</loc>`,
        u.lastmod ? `    <lastmod>${xmlEscape(u.lastmod)}</lastmod>` : null,
        `    <changefreq>${u.changefreq}</changefreq>`,
        `    <priority>${u.priority}</priority>`,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');

  res.status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
  );
};
