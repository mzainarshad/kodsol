/**
 * Read-only check of the Blog table: connectivity, real column names, the
 * resolved column map, and a row count. Makes no changes to any data.
 *
 *   npm run check:schema          (uses DATABASE_URL from the environment)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const blog = require('../api/_lib/blog');
const { describeDbError } = require('../api/_lib/db');

// Minimal .env.local loader so no extra dependency is needed.
for (const f of ['.env.local', '.env']) {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) continue;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

function line(s = '') {
  console.log(s);
}

(async () => {
  if (!process.env.DATABASE_URL) {
    line('DATABASE_URL is not set. Add it to .env.local or the environment.');
    process.exit(2);
  }

  line('Checking public."Blog" (read-only)...\n');

  let schema;
  try {
    schema = await blog.resolveSchema();
  } catch (err) {
    const d = describeDbError(err);
    line(`FAILED  [${d.code}]`);
    line(`        ${d.hint}`);
    process.exit(1);
  }

  line(`Table columns (${schema.present.length}):`);
  schema.present.forEach((c) => line(`  - ${c}  (${schema.types.get(c)})`));

  line('\nResolved field mapping:');
  const labels = {
    id: 'id', title: 'title', slug: 'slug', body: 'body (article content)',
    excerpt: 'excerpt', coverImage: 'cover image', publishedAt: 'published date',
    createdAt: 'created date', updatedAt: 'updated date', author: 'author',
    tags: 'tags', status: 'publication status', seoTitle: 'SEO title',
    seoDescription: 'SEO description', minutes: 'reading time',
  };
  for (const [field, col] of Object.entries(schema.map)) {
    line(`  ${labels[field] || field.padEnd(14)} <- ${col}`);
  }
  if (schema.missing.length) {
    line(`\n  not present (unused): ${schema.missing.join(', ')}`);
  }

  line('\nPublication predicate:');
  line(`  ${blog.publishedClause(schema).sql}`);

  try {
    const total = await blog.countPosts();
    const sample = await blog.listPosts({ limit: 3 });
    line(`\nPublished posts: ${total}`);
    if (sample.length) {
      line('Newest:');
      sample.forEach((p) => line(`  - "${p.title}"  /blog/${p.slug}`));
    } else {
      line('  (none yet — insert a row and re-run)');
    }
  } catch (err) {
    const d = describeDbError(err);
    line(`\nCount failed  [${d.code}] ${d.hint}`);
  }

  line('\nOK — schema resolved.');
  process.exit(0);
})();
