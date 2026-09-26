/**
 * /api/health — configuration and database self-check.
 *
 * WHY
 * A 500 FUNCTION_INVOCATION_FAILED page says nothing: it does not reveal whether
 * DATABASE_URL is missing, points at a project that no longer exists, has a bad
 * password, or is simply timing out. This endpoint answers exactly that, in the
 * browser, without needing shell access to the deployment.
 *
 * It is designed so that it can NEVER itself fail:
 *   - always responds 200 with a JSON body, even when everything is broken;
 *   - every probe is wrapped, and a failed probe becomes a reported value;
 *   - the connection string is parsed and only the non-secret parts are echoed.
 *     The password is never included, not even partially.
 */
'use strict';

const { safeHandler } = require('./_lib/handler');

/**
 * Split a PostgreSQL URL into reportable parts. Returns null when absent or
 * unparseable. The password is deliberately dropped here and never returned.
 */
function describeDsn(raw) {
  if (!raw) return { present: false };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { present: true, parseable: false };
  }

  const user = decodeURIComponent(u.username || '');
  // Supabase's convention is postgres.<project-ref>; the ref is 20 lowercase
  // letters and digits. Anything else means the URL was assembled incorrectly.
  const m = /^postgres\.([A-Za-z0-9]{20})$/.exec(user);
  const ref = m ? m[1] : null;

  return {
    present: true,
    parseable: true,
    // Safe to show: the host is not a secret and is the thing most often wrong.
    host: u.hostname,
    port: u.port || '5432',
    database: (u.pathname || '/').replace(/^\//, ''),
    user: ref ? `postgres.${ref}` : user ? '(unrecognised format)' : '(missing)',
    projectRef: ref,
    refLooksValid: Boolean(ref),
    hasPassword: Boolean(u.password),
    // The pooler host carries the region; a mismatch is a common cause of a
    // connection that opens but never completes the handshake.
    region: (/:([a-z0-9-]+)\.pooler\./.exec(u.hostname) || [])[1] || null,
  };
}

module.exports = safeHandler('health', async function handler(req, res) {
  const report = {
    ok: false,
    time: new Date().toISOString(),
    node: process.version,
    checks: {},
  };

  // --- configuration -------------------------------------------------------
  const site = String(process.env.SITE_URL || '').trim();
  const deployment = String(
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || ''
  ).trim();
  report.checks.siteUrl = {
    configured: Boolean(site),
    // siteUrl() falls back to the Vercel deployment URL, so absolute canonicals
    // still work; this records which origin will actually be emitted.
    effective: site || (deployment ? `https://${deployment}` : null),
    usingFallback: !site && Boolean(deployment),
  };

  const dsn = describeDsn(process.env.DATABASE_URL);
  report.checks.database = dsn;

  // --- driver --------------------------------------------------------------
  try {
    require('pg');
    report.checks.driver = { loaded: true };
  } catch (err) {
    report.checks.driver = { loaded: false, error: (err && err.message) || 'unknown' };
  }

  // --- module load check ---------------------------------------------------
  // A module that fails to require kills the whole function at import time, and
  // Vercel shows that as FUNCTION_INVOCATION_FAILED with no log line. Checking
  // the render path explicitly turns it into a readable result here.
  const modules = {};
  for (const [name, load] of [
    ['pg', () => require('pg')],
    ['sanitize-html', () => require('sanitize-html')],
    ['htmlparser2', () => require('htmlparser2')],
    ['views', () => require('./_lib/views')],
    ['blog', () => require('./_lib/blog')],
  ]) {
    try {
      const mod = load();
      // Record the version that actually got installed. A dependency range in
      // package.json is not a guarantee: a fresh resolve on the platform can
      // pull a different build than the lockfile, and that is exactly how
      // sanitize-html ended up requiring an ESM-only htmlparser2 in production
      // while working fine locally. Naming the version makes that visible.
      const pkg = `${name}/package.json`;
      let version = 'unknown';
      try { version = require(pkg).version; } catch { /* not resolvable by name */ }
      modules[name] = mod ? `ok (${version})` : `ok (${version})`;
    } catch (err) {
      // A MODULE_NOT_FOUND for a package reads as "dependencies did not install";
      // ERR_REQUIRE_ESM means the resolved version is the wrong module format.
      // Only the error code and first line are exposed: the full message can
      // contain absolute build paths.
      const code = (err && err.code) || 'ERROR';
      const first = String((err && err.message) || 'unknown').split('\n')[0];
      let installed = '';
      try { installed = ` [installed ${require(`${name}/package.json`).version}]`; } catch { /* not installed */ }
      modules[name] = `${code}: ${first.replace(/\/var\/task\S*/g, '<path>')}${installed}`.slice(0, 240);
    }
  }
  report.checks.modules = modules;
  report.checks.allModulesLoaded = Object.values(modules).every((v) => v.startsWith('ok'));

  // --- live database probe -------------------------------------------------
  // Bounded so this endpoint always answers inside the function budget.
  if (!dsn.present) {
    report.checks.reachable = {
      ok: false,
      code: 'NO_DATABASE_URL',
      fix: 'Add DATABASE_URL in Vercel → Settings → Environment Variables, then redeploy.',
    };
  } else if (!dsn.parseable) {
    report.checks.reachable = {
      ok: false,
      code: 'BAD_URL',
      fix: 'DATABASE_URL is not a valid URL. Copy it again from Supabase → Project Settings → Database.',
    };
  } else {
    const started = Date.now();
    try {
      const blog = require('./_lib/blog');
      const posts = await blog.listPosts({ limit: 1, offset: 0 });
      report.checks.reachable = {
        ok: true,
        ms: Date.now() - started,
        table: blog.TABLE,
        sampleRowFound: posts.length > 0,
      };
      // Only meaningful once the table is reachable.
      try {
        const schema = await blog.resolveSchema();
        report.checks.schema = {
          resolved: true,
          columns: schema.present,
          mapped: schema.map,
          unmapped: schema.missing,
        };
      } catch (err) {
        report.checks.schema = { resolved: false, code: (err && err.code) || 'UNKNOWN', hint: err && err.hint };
      }
    } catch (err) {
      const d = require('./_lib/db').describeDbError(err);
      report.checks.reachable = {
        ok: false,
        ms: Date.now() - started,
        code: d.code,
        fix: d.hint,
      };
    }
  }

  report.ok = Boolean(report.checks.reachable && report.checks.reachable.ok);
  report.summary = report.ok
    ? 'Database reachable and blog table readable.'
    : 'Database is NOT usable. See checks.reachable.code and .fix.';

  // Always 200: this endpoint reporting failure is the signal, and a 500 here
  // would be indistinguishable from the problem it is meant to diagnose.
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(JSON.stringify(report, null, 2));
});
