'use strict';
// Regression: set-site-url.js must patch the Organization JSON-LD "url" and must
// preserve the sibling name/description fields. It once wrote the replacer
// function's own source into index.html, so prove both properties.
const fs = require('fs');
const { execFileSync } = require('child_process');
const p = 'index.html';
const original = fs.readFileSync(p, 'utf8');
const restore = () => fs.writeFileSync(p, original, 'utf8');

const broken = '{"@context":"https://schema.org","@type":"Organization","name":"Kodsol","description":"Custom software development, AI automation and digital growth systems.","url":"https://kodsol.example"}';

try {
  // Force the placeholder back in, mimicking a fresh clone of the design file.
  fs.writeFileSync(p, original.replace(/"url":"https:\/\/kodsol\.vercel\.app\/"/, '"url":"https://kodsol.example"'), 'utf8');
  if (!fs.readFileSync(p, 'utf8').includes('kodsol.example')) throw new Error('could not stage the placeholder');

  execFileSync(process.execPath, ['scripts/set-site-url.js', 'https://kodsol.vercel.app'], { encoding: 'utf8' });

  const out = fs.readFileSync(p, 'utf8');
  const line = out.split('\n').find((l) => l.includes('"@type":"Organization"'));
  const fail = [];
  if (!line) fail.push('Organization JSON-LD line vanished');
  if (line && /\$\{a\}|=> \`/.test(line)) fail.push('replacer source leaked into the document: ' + line);
  if (line && !line.includes('"url":"https://kodsol.vercel.app/"')) fail.push('url not repointed: ' + line);
  if (line && !line.includes('"name":"Kodsol"')) fail.push('name field lost');
  if (line && !line.includes('"description":"Custom software development')) fail.push('description field lost');
  if (/kodsol\.example/.test(out)) fail.push('placeholder still present somewhere in index.html');
  if (out.split('\n').length !== original.split('\n').length) fail.push('line count changed');

  if (fail.length) { fail.forEach((f) => console.log('  FAIL', f)); process.exitCode = 1; }
  else console.log('  ok    JSON-LD url repointed, sibling fields intact, no placeholder left');
} finally {
  restore();
}
