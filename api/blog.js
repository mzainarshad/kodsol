/**
 * /api/blog — the blog index at /blog
 *
 * Renders complete HTML server-side, so the post titles and summaries are in
 * the initial response and crawlable without executing JavaScript.
 */
'use strict';

const blog = require('./_lib/blog');
const { renderListing, renderErrorPage } = require('./_lib/views');
const { describeDbError } = require('./_lib/db');

const PER_PAGE = 12;

// Vercel serves this from its edge cache and revalidates in the background,
// so a newly published post appears without a redeploy.
const CACHE_CONTROL = 'public, s-maxage=600, stale-while-revalidate=86400';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = (req.query && req.query.page) || '1';
  const pageNum = Math.min(Math.max(parseInt(raw, 10) || 1, 1), 500);

  try {
    const [posts, total] = await Promise.all([
      blog.listPosts({ limit: PER_PAGE, offset: (pageNum - 1) * PER_PAGE }),
      blog.countPosts(),
    ]);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.status(200).send(renderListing({ posts, total, page: pageNum, perPage: PER_PAGE }));
  } catch (err) {
    const d = describeDbError(err);
    // Log the code, never the connection string.
    console.error('[blog] listing failed:', d.code);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(renderErrorPage(d.hint));
  }
};
