/**
 * db.js — server-only PostgreSQL access.
 *
 * This module must never be imported by client-side code. It is only ever
 * required from files under /api, which Vercel runs server-side, so
 * DATABASE_URL is never shipped to the browser.
 *
 * Credential handling rules enforced here:
 *  - the connection string is read from the environment only;
 *  - it is never written to a file, a log line, or an error message;
 *  - errors are reported by error code, not by echoing the DSN.
 */
'use strict';

const { Pool } = require('pg');

// Reuse one pool across warm invocations. Without this, every serverless
// request opens a fresh connection and we exhaust Supabase's connection limit.
const globalRef = globalThis;

function getPool() {
  if (globalRef.__kodsolPool) return globalRef.__kodsolPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    const err = new Error('DATABASE_URL is not set. Add it to the Vercel environment variables.');
    err.code = 'NO_DATABASE_URL';
    throw err;
  }

  const pool = new Pool({
    connectionString,
    // Serverless: a small pool per warm instance is plenty.
    max: Number(process.env.DB_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Fail fast instead of letting a request hang on a bad host.
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 8_000),
    ssl:
      process.env.DB_SSL === 'disable'
        ? false
        : // Supabase presents a certificate chain that is not in Node's default
          // store for pooled connections; we still get transport encryption.
          { rejectUnauthorized: false },
  });

  // An idle client erroring out must not crash the runtime.
  pool.on('error', () => {});

  globalRef.__kodsolPool = pool;
  return pool;
}

/** Run a parameterized query. Values always go through $n placeholders. */
async function query(text, params) {
  const pool = getPool();
  const res = await pool.query(text, params);
  return res.rows;
}

/**
 * Run a read-only query inside a transaction that is rolled back afterwards.
 * Used by the schema self-check so verification can never modify data.
 */
async function queryReadOnly(text, params) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const res = await client.query(text, params);
    await client.query('COMMIT');
    return res.rows;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken; releasing below is enough */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reduce a driver error to something safe to show in a response or log.
 * PostgreSQL auth/lookup failures are reported by code + a short hint so the
 * connection string itself never leaks.
 */
function describeDbError(err) {
  // Already classified (for example by resolveSchema) — return it unchanged so
  // the code is not re-derived from an already-human-readable message.
  if (err && typeof err.hint === 'string' && err.hint) {
    return { code: err.code || 'UNKNOWN', hint: err.hint };
  }

  const code = (err && err.code) || 'UNKNOWN';
  const message = (err && err.message) || String(err);

  if (code === 'NO_DATABASE_URL') {
    return { code, hint: 'DATABASE_URL is not configured for this environment.' };
  }
  if (/ENOTFOUND/.test(message) || /tenant\/user/i.test(message)) {
    return {
      code: 'BAD_PROJECT_REF',
      hint:
        'PostgreSQL rejected the project reference in DATABASE_URL. The username must be ' +
        'postgres.<project-ref>, and <project-ref> must match the project in your Supabase URL. ' +
        'It is case-sensitive. Also confirm the pooler host region matches the project region.',
    };
  }
  if (/password authentication failed/i.test(message)) {
    return {
      code: 'BAD_PASSWORD',
      hint: 'The project reference resolved, but the password was rejected. Reset it in Supabase and update DATABASE_URL.',
    };
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENETUNREACH|5432|6543/.test(message)) {
    return { code: 'CONNECT_FAILED', hint: 'Could not reach PostgreSQL. Check the host, port and region.' };
  }
  if (/SSL/i.test(message)) {
    return { code: 'SSL_ERROR', hint: 'TLS negotiation failed. Try the pooler host from the Supabase dashboard.' };
  }
  if (code === '57014') {
    return { code: 'TIMEOUT', hint: 'The query exceeded the statement timeout.' };
  }
  // Never echo the raw message: it can embed the connection string.
  return { code, hint: 'Database error. Check the server logs for details.' };
}

module.exports = { query, queryReadOnly, describeDbError, getPool };
