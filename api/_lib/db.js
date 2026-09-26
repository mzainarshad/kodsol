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

/* ---------------------------------------------------------------------------
 * Timeouts must stay well inside the function budget.
 *
 * connectionTimeoutMillis used to be 10_000 while vercel.json set
 * maxDuration: 10. A host that accepted the TCP connection but never replied
 * therefore consumed the entire budget, Vercel killed the invocation, and the
 * visitor got a bare 500 FUNCTION_INVOCATION_FAILED before any catch block
 * could run. Every limit below is now a fraction of the budget, so the function
 * always gets to answer with a real response.
 * ------------------------------------------------------------------------ */
const CONNECT_TIMEOUT_MS = Number(process.env.DB_CONNECT_TIMEOUT_MS || 2_500);
const STATEMENT_TIMEOUT_MS = Number(process.env.DB_STATEMENT_TIMEOUT_MS || 3_000);

/* Circuit breaker: after a connection- or auth-level failure, stop trying for a
 * few seconds. Those failures are not transient per-request problems — a wrong
 * project reference fails identically every time — so without this every single
 * request pays the full connect timeout and the site looks down instead of
 * degraded. */
const BREAKER_MS = Number(process.env.DB_BREAKER_MS || 30_000);

const BREAKER_KEY = '__kodsolDbOpenUntil';

function breakerOpen() {
  return Date.now() < (globalRef[BREAKER_KEY] || 0);
}

function tripBreaker() {
  globalRef[BREAKER_KEY] = Date.now() + BREAKER_MS;
}

function closeBreaker() {
  globalRef[BREAKER_KEY] = 0;
}

/** Failures that mean "this endpoint is not answering", not "this query was bad". */
function isConnectionFailure(err) {
  const code = (err && err.code) || '';
  const message = (err && err.message) || String(err);
  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET', 'EPIPE', 'EHOSTUNREACH'].includes(code)) {
    return true;
  }
  // pg raises a connect timeout with no error code at all, and a peer that
  // accepts the socket then goes quiet shows up as "Connection terminated".
  // Both are connection-level, so both must trip the breaker, otherwise a dead
  // host costs every request the full connect timeout instead of just the first.
  if (/Connection terminated|connection timeout|timeout exceeded when trying to connect|Client has encountered a connection error/i.test(message)) {
    return true;
  }
  // Auth and tenant lookups are permanent for a given DATABASE_URL.
  return /ENOTFOUND|tenant\/user|password authentication failed|authentication failed|SSL|not authorized/i.test(
    message
  );
}

function unavailableError() {
  const err = new Error('The database is temporarily unavailable.');
  err.code = 'DB_UNAVAILABLE';
  err.hint =
    'The database is temporarily unavailable and was skipped to keep the site responding. ' +
    'Check DATABASE_URL in the Vercel environment variables.';
  return err;
}

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
    // Hard cap on establishing a connection. Must stay below the function's
    // maxDuration or a silent host turns into a 500.
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    // Cap the whole query, and the lock wait, so a stuck backend cannot hold the
    // invocation open either.
    query_timeout: CONNECT_TIMEOUT_MS + STATEMENT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    lock_timeout: STATEMENT_TIMEOUT_MS,
    ssl:
      process.env.DB_SSL === 'disable'
        ? false
        : // Supabase presents a certificate chain that is not in Node's default
          // store for pooled connections; we still get transport encryption.
          { rejectUnauthorized: false },
  });

  // An idle client erroring out must not crash the runtime.
  pool.on('error', (err) => {
    if (isConnectionFailure(err)) tripBreaker();
  });

  globalRef.__kodsolPool = pool;
  return pool;
}

/** Run a parameterized query. Values always go through $n placeholders. */
async function query(text, params) {
  if (breakerOpen()) throw unavailableError();
  try {
    const res = await getPool().query(text, params);
    closeBreaker();
    return res.rows;
  } catch (err) {
    if (isConnectionFailure(err)) tripBreaker();
    throw err;
  }
}

/**
 * Run a read-only query inside a transaction that is rolled back afterwards.
 * Used by the schema self-check so verification can never modify data.
 */
async function queryReadOnly(text, params) {
  if (breakerOpen()) throw unavailableError();

  // Acquire the client inside its own try. pool.connect() is what actually
  // dials the server, so a connect failure is raised here — before the
  // transaction try/catch below — and would otherwise never trip the breaker.
  let client;
  try {
    client = await getPool().connect();
  } catch (err) {
    if (isConnectionFailure(err)) tripBreaker();
    throw err;
  }

  try {
    await client.query('BEGIN READ ONLY');
    const res = await client.query(text, params);
    await client.query('COMMIT');
    closeBreaker();
    return res.rows;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken; releasing below is enough */
    }
    if (isConnectionFailure(err)) tripBreaker();
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
  if (code === 'DB_UNAVAILABLE') {
    return {
      code,
      hint:
        'The database is temporarily unavailable and was skipped to keep the site responding. ' +
        'Check DATABASE_URL in the Vercel environment variables.',
    };
  }
  if (code === 'ECONNREFUSED' || /ENOTFOUND/.test(message) || /tenant\/user/i.test(message)) {
    return {
      code: 'BAD_PROJECT_REF',
      hint:
        'PostgreSQL rejected the project reference in DATABASE_URL. The username must be ' +
        'postgres.<project-ref>, and <project-ref> must match the project in your Supabase URL. ' +
        'It is case-sensitive. Also confirm the pooler host region matches the project region.',
    };
  }
  if (/Connection terminated|connection timeout|timeout exceeded when trying to connect|Client has encountered a connection error/i.test(message)) {
    return {
      code: 'CONNECT_FAILED',
      hint:
        'The database accepted a connection but never completed the PostgreSQL handshake. ' +
        'Check that DATABASE_URL points at the pooler host for your project region, and that ' +
        'IPv6 or a firewall is not blackholing the connection.',
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
