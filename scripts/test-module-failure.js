'use strict';
/**
 * test-module-failure.js — a dependency that fails to load must not 500.
 *
 * `require('pg')` used to run at module scope in api/_lib/db.js. If the driver
 * was missing, every route in the project died during import and Vercel
 * reported it as FUNCTION_INVOCATION_FAILED, with no application log line at
 * all — indistinguishable from a database outage.
 *
 * This simulates a broken install by making require('pg') throw, then asserts
 * that each handler still produces a real, classified response.
 */
const Module = require('module');
const path = require('path');

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
};

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: '', headersSent: false, writableEnded: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = String(b); this.writableEnded = true; return this; },
    json(b) { this.body = JSON.stringify(b); this.writableEnded = true; return this; },
    end(b) { if (b) this.body = String(b); this.writableEnded = true; return this; },
  };
}

// Break require('pg') for every module loaded from here on.
const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'pg' || request === 'sanitize-html') {
    const err = new Error(`Cannot find module '${request}'`);
    err.code = 'MODULE_NOT_FOUND';
    throw err;
  }
  return realLoad.call(this, request, parent, isMain);
};

(async () => {
  process.env.SITE_URL = 'https://www.kodsol.com';
  process.env.DATABASE_URL =
    'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

  // Fresh module registry so db.js picks up the broken require.
  for (const k of Object.keys(require.cache)) {
    if (k.includes(path.join('live web', 'api'))) delete require.cache[k];
  }

  console.log('\nDRIVER MISSING');
  const health = require('../api/health');
  const blog = require('../api/blog');
  const feed = require('../api/feed');
  const sitemap = require('../api/sitemap');
  const article = require('../api/article');

  {
    const res = fakeRes();
    await health({ method: 'GET', headers: { accept: 'application/json' }, query: {} }, res);
    let json = null;
    try { json = JSON.parse(res.body); } catch { /* handled below */ }
    check('health still responds 200', res.statusCode === 200, `got ${res.statusCode}`);
    check('health body is valid JSON', Boolean(json));
    check('health reports pg as failed to load',
      json && json.checks.modules.pg.startsWith('MODULE_NOT_FOUND'),
      json && String(json.checks.modules.pg));
    check('health reports sanitize-html as failed to load',
      json && json.checks.modules['sanitize-html'].startsWith('MODULE_NOT_FOUND'));
    check('health reports allModulesLoaded=false', json && json.checks.allModulesLoaded === false);
    check('reachable carries a classified code',
      json && json.checks.reachable && typeof json.checks.reachable.code === 'string');
  }

  {
    const res = fakeRes();
    await blog({ method: 'GET', headers: { accept: 'text/html' }, query: {} }, res);
    check('/blog responds 200 with an error page, not a crash',
      res.statusCode === 200 && res.body.length > 0, `status=${res.statusCode}`);
    check('/blog does not leak a stack trace',
      !/at Object\.|node:internal|\.js:\d+:\d+/.test(res.body));
    check('/blog marks the source as error', res.headers['x-kodsol-blog-source'] === 'error');
  }

  for (const [name, handler] of [['feed', feed], ['sitemap', sitemap]]) {
    const res = fakeRes();
    await handler({ method: 'GET', headers: { accept: 'text/html' }, query: {} }, res);
    check(`${name} responds 503 rather than 500`, res.statusCode === 503, `status=${res.statusCode}`);
  }

  // /blog/<slug> deliberately answers 200 with a noindex error page: a database
  // outage must not be reported as a 404, which would look like a missing post.
  // What matters here is only that it is never a 500.
  {
    const res = fakeRes();
    await article({ method: 'GET', headers: { accept: 'text/html' }, query: { slug: 'a-post' } }, res);
    check('article never returns 500', res.statusCode < 500, `status=${res.statusCode}`);
    check('article still sends a page', res.body.length > 0);
    check('article marks the source as error', res.headers['x-kodsol-blog-source'] === 'error');
  }

  Module._load = realLoad;
  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
})();
