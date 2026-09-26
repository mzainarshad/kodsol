'use strict';
/**
 * Reproduce the Vercel 500 and prove the fix.
 *
 * A host that accepts the TCP connection but never completes the handshake is
 * what a wrong-but-resolvable pooler hostname looks like. Before the fix the
 * connect timeout equalled vercel.json's maxDuration, so the invocation was
 * killed before any catch block could answer -> 500 FUNCTION_INVOCATION_FAILED.
 *
 * This drives the real handlers with a fake res, so it exercises the exact code
 * path Vercel runs, without needing a live database.
 */
const http = require('http');
const net = require('net');

const HANDLERS = {
  '/blog': require('../api/blog'),
  '/feed.xml': require('../api/feed'),
  '/sitemap.xml': require('../api/sitemap'),
  '/blog/some-post': require('../api/article'),
};

// A TCP server that accepts and then says nothing, forcing a client-side hang.
const BLACKHOLE = net.createServer(() => { /* accept, never respond */ });

function fakeRes() {
  const r = {
    statusCode: 200, headers: {}, body: '', headersSent: false, writableEnded: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = String(b); this.writableEnded = true; return this; },
    json(b) { this.body = JSON.stringify(b); this.writableEnded = true; return this; },
    end(b) { if (b) this.body = String(b); this.writableEnded = true; return this; },
  };
  return r;
}

(async () => {
  await new Promise((r) => BLACKHOLE.listen(0, '127.0.0.1', r));
  const port = BLACKHOLE.address().port;

  // The dead-project credentials from the production failure, pointed at the
  // blackhole so DNS is not what we are measuring.
  process.env.DATABASE_URL =
    `postgresql://postgres.deadref:secret@127.0.0.1:${port}/postgres`;
  process.env.SITE_URL = 'https://www.kodsol.com';
  process.env.DB_SSL = 'disable';

  const BUDGET_MS = 10_000; // must match vercel.json maxDuration
  let failures = 0;
  let worst = 0;

  console.log(`connect timeout vs function budget: ${BUDGET_MS}ms\n`);
  console.log('route              status  ms     within budget  source header');
  for (const [route, handler] of Object.entries(HANDLERS)) {
    const res = fakeRes();
    const started = Date.now();
    let threw = null;
    try {
      await Promise.race([
        handler({ method: 'GET', headers: { accept: 'text/html' }, query: { slug: 'some-post' } }, res),
        new Promise((_, rej) => setTimeout(() => rej(new Error('BUDGET_EXCEEDED')), BUDGET_MS)),
      ]);
    } catch (e) {
      threw = e;
    }
    const ms = Date.now() - started;
    worst = Math.max(worst, ms);

    const withinBudget = ms < BUDGET_MS && !threw;
    const is500 = res.statusCode >= 500;
    // A degraded 503/503-equivalent is fine; a bare 500 or a budget overrun is not.
    const ok = withinBudget && !(is500 && res.statusCode !== 503);
    if (!ok) failures++;

    console.log(
      `${route.padEnd(18)} ${String(res.statusCode).padEnd(7)} ${String(ms).padEnd(6)} ` +
      `${(withinBudget ? 'yes' : 'NO - would be 500').padEnd(15)} ${res.headers['x-kodsol-blog-source'] || '-'}` +
      (threw ? `  [${threw.message}]` : '')
    );
    if (!ok) console.log(`   ^^ FAIL: ${is500 ? 'returned 500' : 'exceeded the function budget'}`);
  }

  // Second pass: the breaker should make repeat failures near-instant.
  const res2 = fakeRes();
  const t2 = Date.now();
  await HANDLERS['/blog']({ method: 'GET', headers: { accept: 'text/html' }, query: {} }, res2);
  const breakerMs = Date.now() - t2;

  console.log(`\nrepeat request while the database is still down: ${breakerMs}ms ` +
    `(source=${res2.headers['x-kodsol-blog-source']})`);

  const breakerWorks = breakerMs < 200;
  if (!breakerWorks) failures++;
  console.log(`  ${breakerWorks ? 'ok' : 'FAIL'}  circuit breaker short-circuits repeat calls`);

  BLACKHOLE.close();
  await new Promise((r) => require('../api/_lib/db').getPool().end().catch(() => r()));

  console.log(failures
    ? `\n${failures} check(s) failed\n`
    : `\nno route can return 500 or exceed the ${BUDGET_MS}ms budget; worst case ${worst}ms\n`);
  if (failures) process.exitCode = 1;
})();
