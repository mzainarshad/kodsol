/**
 * /api/article — a single post at /blog/<slug>
 *
 * Uses a permissive dynamic route; the slug itself is validated before use.
 * Serves a real 404 for unknown or unpublished slugs.
 */
'use strict';

const blog = require('./_lib/blog');
const { isValidSlug } = require('./_lib/content');
const { renderArticle, renderNotFound, renderErrorPage } = require('./_lib/views');
const { describeDbError } = require('./_lib/db');
const { safeHandler } = require('./_lib/handler');

const CACHE_CONTROL = 'public, s-maxage=600, stale-while-revalidate=86400';

function sendNotFound(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).send(renderNotFound());
}

module.exports = safeHandler('article', async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vercel exposes dynamic segments as req.query.<name> for a catch-all route.
  const q = req.query || {};
  const slug = Array.isArray(q.slug) ? q.slug.join('/') : q.slug || q[0] || q['0'];

  if (!isValidSlug(slug)) return sendNotFound(res);

  try {
    const post = await blog.getPostBySlug(slug);
    if (!post) return sendNotFound(res);

    const { prev, next } = await blog.getNeighbours(post);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Kodsol-Blog-Source', 'database');
    res.status(200).send(renderArticle({ post, prev, next }));
  } catch (err) {
    const d = describeDbError(err);
    console.error('[article] lookup failed:', d.code);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Kodsol-Blog-Source', 'error');
    // A database outage is not the visitor's fault, so do not report 404 here.
    res.status(200).send(renderErrorPage(d.hint));
  }
});
