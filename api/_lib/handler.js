/**
 * handler.js — shared wrapper for the serverless functions.
 *
 * WHY THIS EXISTS
 * Every function already catches its own database errors, but a throw from
 * anywhere else — rendering, a bad SITE_URL, a bug in a view — escaped the
 * handler and Vercel replaced the whole response with
 * "500 FUNCTION_INVOCATION_FAILED". That page tells the visitor nothing and
 * tells us nothing either.
 *
 * safeHandler() guarantees three things:
 *   1. a response is always sent, even if the handler throws;
 *   2. a database outage is reported as a degraded 503, never as a 500;
 *   3. X-Kodsol-Blog-Source says where the content came from, so a broken
 *      database can be identified from the browser without reading logs.
 */
'use strict';

const { describeDbError } = require('./db');

/** Status codes that mean "our fault, the visitor did nothing wrong". */
const DEGRADED = new Set([
  'DB_UNAVAILABLE',
  'NO_DATABASE_URL',
  'BAD_PROJECT_REF',
  'BAD_PASSWORD',
  'CONNECT_FAILED',
  'SSL_ERROR',
  'TIMEOUT',
  'TABLE_NOT_FOUND',
  'COLUMNS_NOT_RESOLVED',
]);

function isDegraded(err) {
  return DEGRADED.has((err && err.code) || '');
}

/**
 * @param {string} name    log prefix, e.g. 'blog'
 * @param {Function} inner the real handler
 */
function safeHandler(name, inner) {
  return async function guarded(req, res) {
    try {
      await inner(req, res);
    } catch (err) {
      // Never echo the message: a driver error can embed the connection string.
      const code = (err && err.code) || 'UNKNOWN';
      console.error(`[${name}] unhandled error:`, code);

      if (res.headersSent || res.writableEnded) {
        try { res.end(); } catch { /* already closed */ }
        return;
      }

      const d = describeDbError(err);
      const degraded = isDegraded(err);

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Kodsol-Blog-Source', 'error');

      if (String(req.headers && req.headers.accept || '').includes('text/html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res
          .status(degraded ? 503 : 500)
          .send(
            `<!doctype html><meta charset="utf-8"><title>Temporarily unavailable</title>` +
            `<body style="font:16px/1.6 system-ui,sans-serif;max-width:38rem;margin:12vh auto;padding:0 1.5rem">` +
            `<h1 style="font-size:1.4rem">Temporarily unavailable</h1>` +
            `<p>The blog could not be loaded${degraded ? ' because the database is unreachable' : ''}. ` +
            `Please try again in a moment.</p>` +
            `<p style="opacity:.6;font-size:.85rem">Reference: ${d.code}</p></body>`
          );
      }

      return res.status(degraded ? 503 : 500).json({ error: 'temporarily unavailable', code: d.code });
    }
  };
}

module.exports = { safeHandler, isDegraded };
