'use strict';
/**
 * BLOG_FALLBACK=sample must make the blog usable when the database is missing,
 * without ever looking like real editorial or becoming indexable.
 */
process.env.BLOG_FALLBACK = 'sample';
delete process.env.DATABASE_URL;

const http = require('http');

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = String(b); return this; },
    json(b) { this.body = JSON.stringify(b); return this; },
    end(b) { this.body = String(b || ''); return this; },
  };
}

function fakeReq(url, query) {
  const u = new URL(url);
  return { method: 'GET', url, headers: { host: u.host }, query: query || {} };
}

let fails = 0;
const check = (name, cond, detail) => {
  if (cond) console.log('  PASS  ' + name);
  else { console.log('  FAIL  ' + name + (detail ? ' -> ' + detail : '')); fails++; }
};

(async () => {
  // Fresh modules so BLOG_FALLBACK is read at require time.
  for (const k of Object.keys(require.cache)) {
    if (k.includes('api\\blog') || k.includes('api\\article') || k.includes('api\\_lib')) delete require.cache[k];
  }
  const blog = require('../api/blog');
  const article = require('../api/article');
  const sitemap = require('../api/sitemap');

  // --- listing -------------------------------------------------------------
  const r = fakeRes();
  await blog(fakeReq('https://kodsol.vercel.app/blog'), r);
  check('listing returns 200', r.statusCode === 200, 'got ' + r.statusCode);
  check('listing is marked sample', r.headers['x-kodsol-blog-source'] === 'sample', r.headers['x-kodsol-blog-source']);
  check('listing is not cached', /no-store/.test(r.headers['cache-control'] || ''), r.headers['cache-control']);
  check('listing shows real post titles', /Sample content\./.test(r.body) && /automating the boring half/i.test(r.body));
  check('listing forces noindex', /name="robots" content="noindex/.test(r.body));
  check('listing shows no canonical to a fake page', !/rel="canonical" href="[^"]*\/blog"/.test(r.body) || /noindex/.test(r.body));

  // --- article -------------------------------------------------------------
  const a = fakeRes();
  await article(fakeReq('https://kodsol.vercel.app/blog/automating-the-boring-half-of-a-sales-pipeline', { slug: 'automating-the-boring-half-of-a-sales-pipeline' }), a);
  check('article returns 200', a.statusCode === 200, 'got ' + a.statusCode);
  check('article is marked sample', a.headers['x-kodsol-blog-source'] === 'sample', a.headers['x-kodsol-blog-source']);
  check('article forces noindex', /name="robots" content="noindex/.test(a.body));
  check('article renders the body', /sales pipeline|routing problem/i.test(a.body));

  // --- unknown slug must 404, not silently serve a random sample post -----
  const miss = fakeRes();
  await article(fakeReq('https://kodsol.vercel.app/blog/no-such-post', { slug: 'no-such-post' }), miss);
  check('unknown slug is 404', miss.statusCode === 404, 'got ' + miss.statusCode);

  // --- sitemap must never advertise sample URLs ---------------------------
  const s = fakeRes();
  await sitemap(fakeReq('https://kodsol.vercel.app/sitemap.xml'), s);
  check('sitemap does not list sample posts', !/automating-the-boring-half/.test(s.body || ''), (s.body || '').slice(0, 80));
  check('sitemap is 200 with static pages only in fallback mode', s.statusCode === 200, 'got ' + s.statusCode);

  // --- default (off) must NOT fall back -----------------------------------
  delete require.cache[require.resolve('../api/_lib/blog')];
  delete process.env.BLOG_FALLBACK;
  const db = require('../api/_lib/db');
  const blog2 = require('../api/_lib/blog');
  let threw = false;
  try { await blog2.listPosts(); } catch { threw = true; }
  check('fallback is OFF by default', threw, 'expected listPosts to reject without BLOG_FALLBACK');
  check('isFallback() is false when off', blog2.isFallback() === false);

  // --- with fallback off, the sitemap must stay an honest 503 -------------
  const sitemap2 = require('../api/sitemap');
  const s2 = fakeRes();
  await sitemap2(fakeReq('https://kodsol.vercel.app/sitemap.xml'), s2);
  check('sitemap is 503 (not a silently post-free 200) when off', s2.statusCode === 503, 'got ' + s2.statusCode);

  console.log(fails ? '\n' + fails + ' failed' : '\nAll sample-fallback tests passed.');
  process.exitCode = fails ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
