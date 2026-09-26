/**
 * Security assertions for the rendering pipeline. Run: node scripts/test-security.js
 *
 * The blog body comes from a database, so the sanitizer is the main trust
 * boundary. These tests assert that known bypass patterns are neutralised.
 */
'use strict';

const { sanitizeBody, toPlainText, safeImageUrl } = require('../api/_lib/sanitize');
const { isValidSlug, renderMarkdown, cleanTags } = require('../api/_lib/content');

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  FAIL  ${msg}`);
};
const pass = (label) => console.log(`  ok    ${label}`);

console.log('XSS / sanitization');

const xss = [
  ['script tag', '<p>ok</p><script>alert(1)</script>'],
  ['event handler on img', '<img src=x onerror=alert(1)>'],
  ['event handler on div', '<div onclick="alert(1)">x</div>'],
  ['javascript: href', '<a href="javascript:alert(1)">x</a>'],
  ['JaVaScRiPt: href mixed case', '<a href="JaVaScRiPt:alert(1)">x</a>'],
  ['iframe', '<iframe src="https://evil.com"></iframe>'],
  ['svg onload', '<svg onload=alert(1)></svg>'],
  ['style expression', '<div style="width:expression(alert(1))">x</div>'],
  ['data: html image', '<img src="data:text/html,<script>alert(1)</script>">'],
  ['form + input', '<form action="/steal"><input name="pw"></form>'],
  ['nested tag obfuscation', '<scr<script>ipt>alert(1)</scr</script>ipt>'],
  ['object/embed', '<object data="x.swf"></object><embed src="y">'],
  ['base tag', '<base href="https://evil.com/">'],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.com">'],
  ['style block', '<style>body{display:none}</style>'],
  ['link stylesheet', '<link rel="stylesheet" href="https://evil.com/x.css">'],
  ['onfocus autofocus', '<input autofocus onfocus=alert(1)>'],
  ['srcdoc iframe', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ['template injection', '<template><script>alert(1)</script></template>'],
  ['math/xlink', '<math><maction actiontype="statusline#xlink" xlink:href="javascript:alert(1)">x</maction></math>'],
];

// Assert on *executable constructs*, not on substrings. A sanitizer that
// correctly escapes input may still leave the words "alert(1)" visible as
// plain text, which is harmless and must not be reported as a leak.
const EXECUTABLE = [
  /<\s*script/i,
  /<\s*iframe/i,
  /<\s*object/i,
  /<\s*embed/i,
  /<\s*form/i,
  /<\s*input/i,
  /<\s*style/i,
  /<\s*base/i,
  /<\s*meta/i,
  /<\s*link/i,
  /\son[a-z]+\s*=/i,
  /href\s*=\s*["']?\s*(javascript|vbscript|data)\s*:/i,
  /src\s*=\s*["']?\s*(javascript|vbscript|data)\s*:/i,
  /style\s*=\s*["']?[^"'>]*expression\s*\(/i,
  /srcdoc\s*=/i,
];

const isExecutable = (html) => EXECUTABLE.some((re) => re.test(html));

for (const [label, input] of xss) {
  const out = sanitizeBody(input);
  if (isExecutable(out)) fail(`${label} -> ${out}`);
  else pass(label);
}

console.log('\nAllowed content survives');
const keep = [
  ['heading', '<h2>Section</h2>', /<h2>Section<\/h2>/],
  ['bold', '<strong>bold</strong>', /<strong>bold<\/strong>/],
  ['list', '<ul><li>one</li></ul>', /<li>one<\/li>/],
  ['blockquote', '<blockquote><p>q</p></blockquote>', /<blockquote>/],
  ['pre/code', '<pre><code>x()</code></pre>', /<pre><code>/],
  ['https link', '<a href="https://a.b/c">c</a>', /href="https:\/\/a\.b\/c"/],
  ['mailto', '<a href="mailto:a@b.c">mail</a>', /mailto:a@b\.c/],
  ['https image', '<img src="https://a.b/c.png" alt="c">', /src="https:\/\/a\.b\/c\.png"/],
];
for (const [label, input, expect] of keep) {
  const out = sanitizeBody(input);
  if (!expect.test(out)) fail(`${label} was stripped -> ${out}`);
  else pass(label);
}

console.log('\nLink hardening');
const ext = sanitizeBody('<a href="https://external.example/x">out</a>');
if (!/rel="noopener noreferrer nofollow"/.test(ext) || !/target="_blank"/.test(ext)) {
  fail(`external link not hardened -> ${ext}`);
} else pass('external link gets rel=noopener noreferrer nofollow + target=_blank');
if (sanitizeBody('<a href="/internal">in</a>').includes('target=')) {
  fail('internal link was forced to open in a new tab');
} else pass('internal link stays same-tab');

console.log('\nImages are lazy-loaded');
if (!/loading="lazy"/.test(sanitizeBody('<img src="https://a.b/c.png">'))) fail('image not lazy-loaded');
else pass('img gets loading=lazy');

console.log('\nSlug validation');
const slugs = [
  ['good-slug', true], ['another-post-2026', true], ['a1', true],
  ['../../etc/passwd', false], ['a b', false], ['UPPER', false],
  ['-leading', false], ['trailing-', false], ['double--dash', false],
  ['', false], ['x'.repeat(200), false], ['slug?a=b', false], ['slug#f', false],
  ["quote'", false], ['<script>', false],
];
for (const [value, expected] of slugs) {
  const got = isValidSlug(value);
  if (got !== expected) fail(`isValidSlug(${JSON.stringify(value)}) = ${got}, expected ${expected}`);
  else pass(`${JSON.stringify(value.slice(0, 20))} -> ${got}`);
}

console.log('\nMarkdown is escaped before rendering');
const md = renderMarkdown('<script>alert(1)</script>\n\n**bold** and [x](https://a.b) and `c`');
if (/<script>/i.test(md)) fail('raw script survived markdown rendering');
else pass('raw HTML is escaped in markdown output');
if (!/<strong>bold<\/strong>/.test(md)) fail('markdown bold not rendered');
else pass('markdown emphasis rendered');
if (!/<blockquote>/.test(renderMarkdown('> quoted'))) fail('markdown blockquote not rendered');
else pass('markdown blockquote rendered');
if (!/<pre><code/.test(renderMarkdown('```js\nx()\n```'))) fail('markdown code fence not rendered');
else pass('markdown code fence rendered');
// An unclosed fence must not swallow the rest of the document.
if (!/<\/code><\/pre>/.test(renderMarkdown('```\nunclosed'))) fail('unclosed code fence not closed');
else pass('unclosed code fence is still closed safely');

console.log('\nMarkdown cannot create dangerous links');
for (const [label, src] of [
  ['javascript: link', '[click](javascript:alert(1))'],
  ['data: link', '[click](data:text/html,<script>alert(1)</script>)'],
  ['vbscript: link', '[click](vbscript:msgbox(1))'],
]) {
  const out = renderMarkdown(src);
  // The safe outcome is either an escaped literal, or an anchor with an
  // http(s) href. What must never happen is an anchor with a script scheme.
  const anchor = out.match(/<a[^>]*>/i);
  const bad = anchor && /href\s*=\s*["']?\s*(javascript|vbscript|data)\s*:/i.test(anchor[0]);
  if (bad) fail(`${label} produced a dangerous anchor -> ${out}`);
  else if (isExecutable(out)) fail(`${label} produced executable markup -> ${out}`);
  else pass(`${label} -> ${JSON.stringify(out)}`);
}
// A legitimate https link must still work.
if (!/<a href="https:\/\/a\.b"/.test(renderMarkdown('[x](https://a.b)'))) {
  fail('markdown broke a legitimate https link');
} else pass('legitimate https link still renders');

console.log('\nExcerpts strip Markdown syntax');
const excerpt = toPlainText('## Heading\n\nSome **bold** and [a link](https://x.y) plus `code`.', 165);
if (/##|\*\*|\]\(/.test(excerpt)) fail(`markdown leaked into excerpt -> ${excerpt}`);
else pass(`excerpt is clean: "${excerpt}"`);
if (!/&lt;/.test(toPlainText('<b>x</b>'))) { /* no angle brackets remain */ }
if (toPlainText('a <script>alert(1)</script> b', 165).includes('<script>')) fail('script leaked into excerpt');
else pass('excerpt escapes angle brackets');

console.log('\nOpen Graph image validation');
for (const [url, expected] of [
  ['https://a.b/c.png', true],
  ['/local.png', true],
  ['http://a.b/c.png', true],
  ['javascript:alert(1)', false],
  ['data:image/png;base64,AAAA', false],
  ['//evil.com/x.png', false],
  ['not a url', false],
  ['', false],
]) {
  const got = Boolean(safeImageUrl(url));
  if (got !== expected) fail(`safeImageUrl(${JSON.stringify(url)}) = ${got}, expected ${expected}`);
  else pass(`${JSON.stringify(url.slice(0, 24))} -> ${safeImageUrl(url) || '(rejected)'}`);
}

console.log('\nTag cleaning');
const tags = cleanTags(['ai', 'automation', 'ai', '<script>', 'a'.repeat(100), null, 42]);
if (tags.some((t) => /<|>/.test(t))) fail(`tags allowed markup: ${tags}`);
else pass(`tags cleaned -> ${JSON.stringify(tags)}`);
if (new Set(tags).size !== tags.length) fail('duplicate tags were kept');
else pass('duplicates removed');
if (tags.length > 8) fail('more than 8 tags kept');
else pass('capped at 8 tags');

console.log(`\n${failures === 0 ? 'All security tests passed.' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
