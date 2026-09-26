'use strict';
/**
 * test-health.js — the diagnostic endpoint must never fail and must never leak.
 *
 * A health check that can 500 is worse than no health check, so this asserts
 * the two properties that matter: it always answers 200 with parseable JSON,
 * and the connection string password never appears in the response.
 */
const net = require('net');

const health = require('../api/health');

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

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
};

const SECRET = 'hunter2-SUPERSECRET-pw';

async function probe(env) {
  const saved = {};
  for (const k of ['DATABASE_URL', 'SITE_URL', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  const res = fakeRes();
  try {
    await health({ method: 'GET', headers: { accept: 'application/json' }, query: {} }, res);
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
  return res;
}

(async () => {
  console.log('\nNO DATABASE_URL');
  {
    const res = await probe({});
    check('responds 200 even with nothing configured', res.statusCode === 200, `got ${res.statusCode}`);
    let json = null;
    try { json = JSON.parse(res.body); } catch { /* handled below */ }
    check('body is valid JSON', Boolean(json));
    check('reports NO_DATABASE_URL', json && json.checks.reachable.code === 'NO_DATABASE_URL',
      json && json.checks.reachable.code);
    check('includes an actionable fix', Boolean(json && json.checks.reachable.fix));
    check('ok is false', json && json.ok === false);
  }

  console.log('\nDEAD PROJECT REF (unresolvable host)');
  {
    const res = await probe({
      DATABASE_URL: `postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:${SECRET}@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres`,
      SITE_URL: 'https://www.kodsol.com',
    });
    check('responds 200', res.statusCode === 200, `got ${res.statusCode}`);
    const json = JSON.parse(res.body);
    check('extracts the project ref', json.checks.database.projectRef === 'aaaaaaaaaaaaaaaaaaaa',
      String(json.checks.database.projectRef));
    check('ref reported as valid format', json.checks.database.refLooksValid === true);
    check('reachable is false with a code', json.checks.reachable.ok === false && Boolean(json.checks.reachable.code));
  }

  console.log('\nSECRET HANDLING');
  {
    const res = await probe({
      DATABASE_URL: `postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:${SECRET}@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres`,
    });
    check('password never appears in the response', !res.body.includes(SECRET));
    check('password not echoed url-encoded either', !res.body.includes(encodeURIComponent(SECRET)));
    check('only a hasPassword boolean is reported', res.body.includes('"hasPassword": true'));
    check('host is reported so it can be checked', res.body.includes('db.aaaaaaaaaaaaaaaaaaaa.supabase.co'));
  }

  console.log('\nMALFORMED INPUT');
  {
    const res = await probe({ DATABASE_URL: 'not-a-url' });
    check('responds 200 on an unparseable DSN', res.statusCode === 200, `got ${res.statusCode}`);
    const json = JSON.parse(res.body);
    check('flags BAD_URL', json.checks.reachable.code === 'BAD_URL', json.checks.reachable.code);
  }
  {
    const res = await probe({ DATABASE_URL: 'postgresql://wronguser:pw@host.example.com:5432/db' });
    const json = JSON.parse(res.body);
    check('flags a non-Supabase username format', json.checks.database.refLooksValid === false);
    check('does not echo the raw username', !res.body.includes('wronguser'));
  }

  console.log('\nSITE URL FALLBACK');
  {
    const res = await probe({ VERCEL_PROJECT_PRODUCTION_URL: 'kodsol.vercel.app' });
    const json = JSON.parse(res.body);
    check('falls back to the Vercel deployment URL', json.checks.siteUrl.effective === 'https://kodsol.vercel.app',
      String(json.checks.siteUrl.effective));
    check('flags that the fallback is in use', json.checks.siteUrl.usingFallback === true);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
})();
