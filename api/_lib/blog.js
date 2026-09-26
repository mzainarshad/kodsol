/**
 * blog.js — all SQL for the blog lives here, and nowhere else.
 *
 * WHY THIS FILE IS SHAPED LIKE THIS
 * The real schema of public."Blog" could not be read (the supplied project
 * reference is not recognised by any Supabase region), so the column names
 * below are not assumed. Instead:
 *
 *   1. resolveSchema() reads information_schema.columns for the table and
 *      picks the first matching name from each candidate list below, in the
 *      documented order of preference.
 *   2. Every identifier it selects is checked against the real column list,
 *      and is re-quoted as a SQL identifier. No value from a request is ever
 *      interpolated into SQL.
 *   3. If a required column cannot be resolved it throws with a message naming
 *      the table's actual columns.
 *
 * Once the schema is readable, pin RESOLVED_* to the exact names and the
 * candidate lists can be deleted.
 */
'use strict';

const { query, queryReadOnly, describeDbError, isInfraFailure } = require('./db');

const TABLE = 'public."Blog"'; // quoted: the table name is capitalised

/**
 * Candidate column names in preference order.
 * The first name that actually exists on the table wins.
 */
const CANDIDATES = {
  id: ['id', 'blog_id', 'uuid', 'ID'],
  title: ['title', 'name', 'heading', 'post_title'],
  slug: ['slug', 'permalink', 'url_slug', 'post_slug'],
  body: ['content', 'body', 'html', 'body_html', 'content_html', 'description_full', 'post_content'],
  excerpt: ['excerpt', 'summary', 'subhead', 'short_description', 'description'],
  coverImage: ['cover_image', 'coverimage', 'image', 'image_url', 'thumbnail', 'featured_image', 'banner'],
  publishedAt: ['published_at', 'publish_date', 'published_on', 'published', 'date'],
  createdAt: ['created_at', 'date', 'created'],
  updatedAt: ['updated_at', 'modified_at', 'last_modified'],
  author: ['author', 'author_name', 'byline', 'writer'],
  tags: ['tags', 'categories', 'category', 'labels', 'topics'],
  status: ['status', 'published_status', 'state', 'visibility'],
  seoTitle: ['seo_title', 'meta_title'],
  seoDescription: ['seo_description', 'meta_description'],
  minutes: ['read_time', 'reading_time', 'minutes', 'duration'],
};

// Resolved once per warm instance.
let RESOLVED = null;

/** Quote a SQL identifier safely: double any embedded double quotes. */
function ident(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

/**
 * Read the table's real columns and map them to the fields the site needs.
 * Cached per warm instance; safe to call on every request.
 */
async function resolveSchema() {
  if (RESOLVED) return RESOLVED;

  let rows;
  try {
    rows = await queryReadOnly(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Blog'
        ORDER BY ordinal_position`,
      []
    );
  } catch (err) {
    // Annotate rather than replace, so the original stack and code survive.
    const d = describeDbError(err);
    err.hint = d.hint;
    err.code = d.code;
    throw err;
  }

  if (!rows.length) {
    const e = new Error(
      'Table public."Blog" was not found. Create the table, or set TABLE in api/_lib/blog.js to your real table name.'
    );
    e.code = 'TABLE_NOT_FOUND';
    e.hint =
      'Table public."Blog" was not found. Create the table, or set TABLE in api/_lib/blog.js to your real table name.';
    throw e;
  }

  const present = new Set(rows.map((r) => r.column_name));
  const lower = new Map([...present].map((c) => [c.toLowerCase(), c]));
  const types = new Map(rows.map((r) => [r.column_name, r.data_type]));

  const map = {};
  const missing = [];
  for (const [field, names] of Object.entries(CANDIDATES)) {
    let found = null;
    for (const n of names) {
      if (present.has(n)) { found = n; break; }
      if (lower.has(n.toLowerCase())) { found = lower.get(n.toLowerCase()); break; }
    }
    if (found) map[field] = found;
    else missing.push(field);
  }

  // Without these three the blog cannot function at all.
  const required = ['title', 'slug', 'body'];
  const absent = required.filter((f) => !map[f]);
  if (absent.length) {
    const hint =
      `public."Blog" is missing a usable column for: ${absent.join(', ')}. ` +
      `Columns present: ${[...present].join(', ')}. Update CANDIDATES in api/_lib/blog.js.`;
    const e = new Error(hint);
    e.code = 'COLUMNS_NOT_RESOLVED';
    e.hint = hint;
    throw e;
  }

  RESOLVED = { map, present: [...present], types, missing };
  return RESOLVED;
}

/** The publication predicate, chosen from whatever the table actually offers. */
function publishedClause(schema) {
  const { map, types } = schema;

  if (map.status) {
    const t = types.get(map.status);
    if (t === 'boolean') return { sql: `${ident(map.status)} = true`, params: [] };
    if (t === 'user-defined') {
      // Likely an enum; compare case-insensitively on its text value.
      return { sql: `lower(${ident(map.status)}::text) = 'published'`, params: [] };
    }
    return { sql: `lower(${ident(map.status)}::text) IN ('published','publish','live','true','1')`, params: [] };
  }

  if (map.publishedAt) {
    const t = types.get(map.publishedAt);
    if (t === 'boolean') return { sql: `${ident(map.publishedAt)} = true`, params: [] };
    return {
      sql: `${ident(map.publishedAt)} IS NOT NULL AND ${ident(map.publishedAt)} <= now()`,
      params: [],
    };
  }

  // Nothing indicates publication state, so treat every row as public.
  return { sql: 'true', params: [] };
}

/** SELECT list, omitting columns the table does not have. */
function selectList(schema, { withBody = true } = {}) {
  const { map } = schema;
  const cols = [
    map.id,
    map.title,
    map.slug,
    withBody ? map.body : null,
    map.excerpt,
    map.coverImage,
    map.publishedAt,
    map.createdAt,
    map.updatedAt,
    map.author,
    map.tags,
    map.seoTitle,
    map.seoDescription,
    map.minutes,
  ].filter(Boolean);

  const seen = new Set();
  const uniq = cols.filter((c) => (seen.has(c) ? false : seen.add(c)));
  return uniq.map(ident).join(', ');
}

/** ORDER BY clause, newest first. */
function orderClause(schema) {
  const col = schema.map.publishedAt || schema.map.createdAt;
  return col ? ` ORDER BY ${ident(col)} DESC NULLS LAST` : '';
}

/**
 * Map a database row onto the shape the renderer expects.
 * Body text stays raw here; sanitizing happens in the view layer.
 */
function toPost(row, schema) {
  const g = (field) => (schema.map[field] ? row[schema.map[field]] : null);
  return {
    id: g('id'),
    title: String(g('title') || '').trim(),
    slug: String(g('slug') || '').trim(),
    content: g('body'),
    contentHtml: g('body'),
    excerpt: g('excerpt'),
    coverImage: g('coverImage'),
    publishedAt: g('publishedAt') || g('createdAt'),
    updatedAt: g('updatedAt'),
    author: g('author'),
    tags: g('tags'),
    status: g('status'),
    seoTitle: g('seoTitle'),
    seoDescription: g('seoDescription'),
    minutes: g('minutes'),
  };
}

/* ------------------------------------------------------------------ *
 * Database implementations. Each is wrapped by the public function of
 * the same name, which decides whether a failure may fall back to
 * sample content.
 * ------------------------------------------------------------------ */

async function listPostsFromDb({ limit = 12, offset = 0 } = {}) {
  const schema = await resolveSchema();
  const pub = publishedClause(schema);
  const take = Math.min(Math.max(Number(limit) || 12, 1), 50);
  const skip = Math.max(Number(offset) || 0, 0);

  const sql =
    `SELECT ${selectList(schema, { withBody: false })} FROM ${TABLE} ` +
    `WHERE ${pub.sql}${orderClause(schema)} LIMIT $1 OFFSET $2`;

  const rows = await query(sql, [take, skip]);
  return rows.map((r) => toPost(r, schema));
}

async function countPostsFromDb() {
  const schema = await resolveSchema();
  const pub = publishedClause(schema);
  const rows = await query(`SELECT count(*)::int AS n FROM ${TABLE} WHERE ${pub.sql}`, []);
  return rows[0] ? Number(rows[0].n) : 0;
}

async function getPostBySlugFromDb(slug) {
  const schema = await resolveSchema();
  const pub = publishedClause(schema);
  const sql =
    `SELECT ${selectList(schema)} FROM ${TABLE} ` +
    `WHERE ${ident(schema.map.slug)} = $1 AND ${pub.sql} LIMIT 1`;

  const rows = await query(sql, [slug]);
  return rows.length ? toPost(rows[0], schema) : null;
}

async function listSitemapEntriesFromDb() {
  const schema = await resolveSchema();
  const pub = publishedClause(schema);
  const dateCol = schema.map.updatedAt || schema.map.publishedAt || schema.map.createdAt;
  const cols = [schema.map.slug, dateCol].filter(Boolean).map(ident).join(', ');

  const rows = await query(
    `SELECT ${cols} FROM ${TABLE} WHERE ${pub.sql}${orderClause(schema)}`,
    []
  );
  return rows.map((r) => ({
    slug: String(r[schema.map.slug] || '').trim(),
    lastmod: dateCol ? toIsoSafe(r[dateCol]) : null,
  }));
}

async function getNeighboursFromDb(post) {
  const schema = await resolveSchema();
  const pub = publishedClause(schema);
  const dateCol = schema.map.publishedAt || schema.map.createdAt;
  if (!dateCol) return { prev: null, next: null };

  const pick = (op) => {
    const sql =
      `SELECT ${ident(schema.map.title)} AS title, ${ident(schema.map.slug)} AS slug, ${ident(dateCol)} AS d ` +
      `FROM ${TABLE} WHERE ${pub.sql} AND ${ident(dateCol)} ${op} $1 AND ${ident(schema.map.slug)} <> $2 ` +
      `ORDER BY ${ident(dateCol)} ${op === '<' ? 'DESC' : 'ASC'} LIMIT 1`;
    return sql;
  };

  const at = post.publishedAt instanceof Date ? post.publishedAt : new Date(post.publishedAt);
  if (Number.isNaN(at.getTime())) return { prev: null, next: null };

  const [prevRows, nextRows] = await Promise.all([
    query(pick('<'), [at, post.slug]),
    query(pick('>'), [at, post.slug]),
  ]);

  const shape = (r) => (r ? { title: String(r.title || ''), slug: String(r.slug || '') } : null);
  return { prev: shape(prevRows[0]), next: shape(nextRows[0]) };
}

/**
 * Sample content is opt-in and off by default. When it is enabled and the
 * database is unusable, the read functions return bundled sample posts instead
 * of throwing, so a missing or wrong DATABASE_URL degrades to visibly-labelled
 * placeholder content rather than an error page for every visitor. The routes
 * detect this via isFallback() and force noindex so it is never indexed.
 */
function fallbackEnabled() {
  return String(process.env.BLOG_FALLBACK || '').trim().toLowerCase() === 'sample';
}

let servedFallback = false;

/** True when the last read was served from sample content, not the database. */
function isFallback() {
  return servedFallback;
}

const samplePosts = () => require('./sample-posts');

/**
 * Runs a database read, falling back to sample content when BLOG_FALLBACK=sample.
 * Only infrastructure failures fall back; a real query that legitimately returns
 * zero rows must not be turned into sample posts, or a genuinely empty blog
 * would show content that does not exist.
 */
async function read(fn, sampleFn) {
  // Always reset first: a warm lambda reuses this module across requests, so a
  // stale true from an earlier fallback must never leak into a later response.
  servedFallback = false;
  if (!fallbackEnabled()) return fn();
  try {
    return await fn();
  } catch (err) {
    if (!isInfraFailure(err)) throw err;
    servedFallback = true;
    return sampleFn();
  }
}

/** Paginated list of published posts, newest first. */
async function listPosts(opts = {}) {
  return read(
    () => listPostsFromDb(opts),
    () => samplePosts().slice(0, Math.min(Math.max(Number(opts.limit) || 12, 1), 50))
  );
}

/** Total published post count, for pagination and the sitemap. */
async function countPosts() {
  return read(countPostsFromDb, () => samplePosts().length);
}

/**
 * Fetch one published post by slug. The slug is validated by the caller and
 * still bound as a parameter, so it cannot alter the query.
 */
async function getPostBySlug(slug) {
  return read(
    () => getPostBySlugFromDb(slug),
    () => samplePosts().find((p) => p.slug === slug) || null
  );
}

/** Slug + date for every published post, for the sitemap. */
async function listSitemapEntries() {
  // The sitemap is a machine contract with crawlers, so it must list only real,
  // indexable URLs. It therefore never falls back to sample content: sample posts
  // are served noindex and advertising them would invite indexing of pages that
  // are meant to stay out of the index.
  //
  // With sample fallback enabled, an outage still yields a valid sitemap holding
  // just the static pages. Without it, the failure is re-thrown so the route can
  // answer 503, which tells crawlers to retry rather than declaring a complete
  // but silently post-free site.
  servedFallback = false;
  try {
    return await listSitemapEntriesFromDb();
  } catch (err) {
    if (!isInfraFailure(err) || !fallbackEnabled()) throw err;
    return [];
  }
}

/** Nearest published post before/after the given date, for prev/next links. */
async function getNeighbours(post) {
  return read(
    () => getNeighboursFromDb(post),
    () => {
      const all = samplePosts().slice().sort(
        (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
      );
      const i = all.findIndex((p) => p.slug === post.slug);
      return {
        prev: i > 0 ? { title: all[i - 1].title, slug: all[i - 1].slug } : null,
        next: i >= 0 && i < all.length - 1 ? { title: all[i + 1].title, slug: all[i + 1].slug } : null,
      };
    }
  );
}


function toIsoSafe(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Introspection helper for local verification scripts. */
async function inspect() {
  return resolveSchema();
}

module.exports = {
  listPosts,
  countPosts,
  getPostBySlug,
  getNeighbours,
  listSitemapEntries,
  resolveSchema,
  publishedClause,
  inspect,
  isFallback,
  fallbackEnabled,
  isValidSlug: (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 120,
  TABLE,
};
