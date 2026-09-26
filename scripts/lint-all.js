'use strict';
/**
 * lint-all.js — run `node --check` over every .js file in api/ and scripts/.
 *
 * The lint script used to be a hand-maintained list of filenames, so a newly
 * added file was simply never checked. This walks the directories instead.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['api', 'scripts'];

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(full, out);
    } else if (e.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d))).sort();
let bad = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    bad++;
    const rel = path.relative(ROOT, file);
    process.stdout.write(`  FAIL  ${rel}\n`);
    process.stdout.write(String(err.stderr || '').split('\n').slice(0, 4).map((l) => `        ${l}\n`).join(''));
  }
}

console.log(`${files.length - bad}/${files.length} files parse cleanly`);
if (bad) process.exitCode = 1;
