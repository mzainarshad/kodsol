'use strict';
/**
 * Guards the production-only ERR_REQUIRE_ESK failure.
 *
 * Vercel's Node runtime has require(esm) DISABLED, while a normal local Node has
 * it enabled. That made sanitize-html 2.17.7 (which pulls the ESM-only
 * htmlparser2 12) work perfectly on a developer machine and fail on every
 * deployed request, because the only difference was the runtime flag.
 *
 * This test re-runs itself under --no-experimental-require-module and asserts
 * the real render path still works there, so the version can never be bumped
 * back into an ESM-only dependency without the suite catching it.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const SELF = __filename;
const FLAG = '--no-experimental-require-module';

if (process.env.KODSOL_RUNTIME_CHILD === '1') {
  // --- child: running under the production-equivalent runtime ---------------
  const { sanitizeBody, toPlainText } = require('../api/_lib/sanitize');
  const views = require('../api/_lib/views');

  const fails = [];
  const check = (name, cond, detail) => {
    if (cond) console.log('  ok    ' + name);
    else { console.log('  FAIL  ' + name + (detail ? ' -> ' + detail : '')); fails.push(name); }
  };

  // typeof alone is not enough: with the broken dependency the export still
  // exists and only throws when invoked, so the call is what proves it loads.
  let loadError = null;
  try { sanitizeBody('<b>probe</b>'); } catch (e) { loadError = e.code || e.message; }
  check('sanitize-html loads with require(esm) disabled', !loadError, String(loadError).slice(0, 90));

  const dirty = '<img src=x onerror=alert(1)><script>bad()</script><b>ok</b>';
  const clean = sanitizeBody(dirty);
  check('strips <script>', !/<script/i.test(clean), clean);
  check('strips event handlers', !/onerror/i.test(clean), clean);
  check('keeps safe markup', /<b>ok<\/b>/.test(clean), clean);

  const ext = sanitizeBody('<a href="https://example.com">x</a>');
  check('hardens external links', /rel="noopener noreferrer nofollow"/.test(ext) && /target="_blank"/.test(ext), ext);
  check('strips javascript: urls', !/javascript:/i.test(sanitizeBody('<a href="javascript:alert(1)">x</a>')));
  check('strips iframes', !/<iframe/i.test(sanitizeBody('<iframe src="https://x.com"></iframe>')));
  check('strips forms', !/<form|<input/i.test(sanitizeBody('<form><input name=a></form>')));

  check('toPlainText strips markdown', !/[*#`]/.test(toPlainText('## Heading\n\nSome **bold** text.')), toPlainText('## Heading\n\nSome **bold** text.'));

  // The render path itself must work, not just the sanitizer in isolation.
  // Note the page legitimately contains <script> tags for JSON-LD, so the
  // assertion targets the injected payload rather than the tag name.
  const html = views.renderListing({
    posts: [{ slug: 'a', title: 'A', excerpt: 'x', tags: ['t'], publishedAt: '2026-01-01T00:00:00.000Z' }],
    total: 1, page: 1, perPage: 12,
  });
  check('renderListing produces a full document', /^<!doctype html>/i.test(html) && /<\/html>\s*$/.test(html));

  const art = views.renderArticle({
    post: { slug: 'a', title: 'A', contentHtml: '<p>Hello</p><script>INJECTED_PAYLOAD()</script>', publishedAt: '2026-01-01T00:00:00.000Z' },
    prev: null, next: null,
  });
  check('renderArticle keeps safe body content', /<p>Hello<\/p>/.test(art));
  check('renderArticle strips the injected payload', !/INJECTED_PAYLOAD/.test(art));

  process.exitCode = fails.length ? 1 : 0;
  if (!fails.length) console.log('\n  production runtime (require(esm) disabled): OK');
} else {
  // --- parent: re-run under the flag ---------------------------------------
  console.log('\n  Production runtime check (--no-experimental-require-module)');
  try {
    execFileSync(process.execPath, [FLAG, SELF], {
      stdio: 'inherit',
      env: { ...process.env, KODSOL_RUNTIME_CHILD: '1' },
    });
  } catch (err) {
    console.error('\n  the deployed runtime cannot load the sanitizer; this is what breaks /blog in production');
    process.exitCode = 1;
  }
}
