/**
 * /api/feed — RSS 2.0 feed at /feed.xml
 *
 * A blog without a feed loses subscribers the moment a reader does not open
 * the site. Only published posts are included, so unpublishing removes an item
 * on the next revalidation.
 */
'use strict';

const blog = require('./_lib/blog');
const { siteUrl, SITE, esc } = require('./_lib/theme');
const { isValidSlug, toIso, formatDate } = require('./_lib/content');
const { sanitizeBody, toPlainText, safeImageUrl } = require('./_lib/sanitize');
const { describeDbError } = require('./_lib/db');
const { safeHandler } = require('./_lib/handler');

const CACHE_CONTROL = 'public, s-maxage=1800, stale-while-revalidate=86400';
const LIMIT = 30;

// RFC 822 date, which RFC 822/1123 parsers require (toISOString is not enough).
const rfc822 = (value) => {
  const iso = toIso(value);
  if (!iso) return null;
  return new Date(iso).toUTCString();
};

/** XML text escaping. */
const x = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // control characters are illegal in XML 1.0
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

/** Strip tags for the feed summary. */
const strip = (html, max = 320) => toPlainText(html, max);

module.exports = safeHandler('feed', async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  const base = siteUrl('');
  if (!base) {
    console.error('[feed] SITE_URL is not set — a feed needs absolute URLs');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end('SITE_URL is not configured.');
  }

  let posts = [];
  try {
    posts = await blog.listPosts({ limit: LIMIT, offset: 0 });
  } catch (err) {
    const d = describeDbError(err);
    console.error('[feed] failed:', d.code);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Kodsol-Blog-Source', 'error');
    return res.status(503).end('Feed temporarily unavailable.');
  }

  const updated = posts.reduce((acc, p) => {
    const t = rfc822(p.updatedAt || p.publishedAt);
    if (!t) return acc;
    return !acc || new Date(t) > new Date(acc) ? t : acc;
  }, rfc822(posts[0] && posts[0].publishedAt)) || new Date().toUTCString();

  const items = posts
    .filter((p) => isValidSlug(p.slug))
    .map((p) => {
      const url = siteUrl(`/blog/${p.slug}`);
      const img = safeImageUrl(p.coverImage);
      return [
        '    <item>',
        `      <title>${x(p.title)}</title>`,
        `      <link>${x(url)}</link>`,
        `      <guid isPermaLink="true">${x(url)}</guid>`,
        p.publishedAt ? `      <pubDate>${x(rfc822(p.publishedAt))}</pubDate>` : '',
        p.author ? `      <dc:creator>${x(p.author)}</dc:creator>` : '',
        p.tags && p.tags.length
          ? p.tags.map((t) => `      <category>${x(t)}</category>`).join('\n')
          : '',
        `      <description>${x(strip(p.contentHtml || p.content))}</description>`,
        img ? `      <enclosure url="${x(siteUrl(img))}" type="image/png" length="0"/>` : '',
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${x(`${SITE.name} — ${SITE.tagline}`)}</title>
    <link>${x(siteUrl('/blog'))}</link>
    <description>${x('Articles from the Kodsol team on software, AI, workflow automation and growth.')}</description>
    <language>en-us</language>
    <lastBuildDate>${x(updated)}</lastBuildDate>
    <atom:link href="${x(siteUrl('/feed.xml'))}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${x(siteUrl('/assets/og-default.png'))}</url>
      <title>${x(SITE.name)}</title>
      <link>${x(siteUrl('/blog'))}</link>
    </image>
${items}
  </channel>
</rss>
`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.setHeader('X-Kodsol-Blog-Source', 'database');
  res.status(200).send(xml);
});
