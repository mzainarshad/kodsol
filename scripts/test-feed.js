'use strict';
/**
 * test-feed.js — the feed must render whatever shape the tags column has.
 *
 * `tags` can arrive as a text[] array, a jsonb array, a JSON-encoded string, or
 * a plain comma-separated string, depending on the column type. The feed used to
 * call p.tags.map(...) outside its try block, so a string column threw a
 * TypeError that surfaced as a 500 FUNCTION_INVOCATION_FAILED.
 *
 * blog.listPosts is monkey-patched because feed.js resolves it as a property at
 * call time, so the real module can be reused without a database.
 */
const blog = require('../api/_lib/blog');
const feed = require('../api/feed');
const { toTagList } = require('../api/_lib/content');

// The feed refuses to emit relative URLs, so it needs an origin.
process.env.SITE_URL = 'https://www.kodsol.com';

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
    end(b) { if (b) this.body = String(b); this.writableEnded = true; return this; },
  };
}

const post = (tags) => ({
  title: 'A post about tags',
  slug: 'a-post-about-tags',
  contentHtml: '<p>Body text.</p>',
  excerpt: 'Short summary.',
  publishedAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-16T10:00:00.000Z',
  author: 'Kodsol',
  coverImage: null,
  tags,
});

async function render(tags) {
  const original = blog.listPosts;
  blog.listPosts = async () => [post(tags)];
  const res = fakeRes();
  try {
    await feed({ method: 'GET', headers: { accept: 'application/rss+xml' }, query: {} }, res);
  } finally {
    blog.listPosts = original;
  }
  return res;
}

console.log('\nTAGS COLUMN SHAPES');
const shapes = [
  ['text[] array', ['Automation', 'AI']],
  ['comma-separated string', 'Automation, AI'],
  ['JSON array string', '["Automation","AI"]'],
  ['single string', 'Automation'],
  ['null', null],
  ['empty array', []],
  ['whitespace string', '   '],
];

(async () => {
for (const [name, value] of shapes) {
  const res = await render(value);
  check(`renders with ${name}`, res.statusCode === 200 && res.body.includes('<rss'), `status=${res.statusCode}`);
}

console.log('\nCATEGORY OUTPUT');
{
  const res = await render('Automation, AI & Growth');
  const cats = res.body.match(/<category>[^<]*<\/category>/g) || [];
  check('splits a comma-separated string into categories', cats.length === 2, `${cats.length} found`);
  check('categories keep their text', res.body.includes('<category>Automation</category>') && res.body.includes('AI &amp; Growth'));
  check('escapes ampersands in XML', res.body.includes('AI &amp; Growth'), 'raw & would be invalid XML');
  check('no unescaped ampersand inside a category', !/<category>[^<]*&(?!amp;|lt;|gt;|quot;|apos;|#)[^<]*<\/category>/.test(res.body));
}
{
  const res = await render(['Automation', 'AI & Growth']);
  check('renders array tags with escaping', res.body.includes('AI &amp; Growth'));
}
{
  const res = await render(null);
  check('omits categories entirely when there are no tags', !res.body.includes('<category>'));
}

console.log('\ntoTagList UNIT');
check('string splits on commas', toTagList('a, b , c').join('|') === 'a|b|c', toTagList('a, b , c').join('|'));
check('JSON string is parsed', toTagList('["a","b"]').join('|') === 'a|b', toTagList('["a","b"]').join('|'));
check('array passes through', toTagList(['a', 'b']).join('|') === 'a|b');
check('null yields empty', toTagList(null).length === 0);
check('undefined yields empty', toTagList(undefined).length === 0);
check('number becomes one tag', toTagList(7).join('|') === '7', toTagList(7).join('|'));
check('object uses name', toTagList([{ name: 'AI' }]).join('|') === 'AI');
check('capped at 8', toTagList(['1','2','3','4','5','6','7','8','9','10']).length === 8);
check('trims values', toTagList(['  spaced  ']).join('|') === 'spaced');

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exitCode = 1;
})();
