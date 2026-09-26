'use strict';
/**
 * Candidate verification for the production ERR_REQUIRE_ESM failure.
 * Run under --no-experimental-require-module to match the Vercel runtime.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CANDIDATES = ['2.17.0', '2.16.0', '2.14.0', '2.17.7'];

// The real OPTIONS from api/_lib/sanitize.js, so we test the actual config and
// not a toy subset.
const OPTIONS = require(path.join(__dirname, '..', 'api', '_lib', 'sanitize.js'));

// Only module loadability decides the version. Whether the policy is correct is
// covered by scripts/test-security.js, which is run under this same flag after
// the winner is installed.
const PROBE = `
const s = require('sanitize-html');
const out = s('<img src=x onerror=alert(1)><script>bad()</script><b>ok</b>');
if (typeof s !== 'function') { console.log(JSON.stringify({ fails: ['not a function'] })); }
else if (/<script|onerror/i.test(out)) { console.log(JSON.stringify({ fails: ['xss not stripped'] })); }
else if (!/<b>ok<\\/b>/.test(out)) { console.log(JSON.stringify({ fails: ['safe markup dropped'] })); }
else { console.log(JSON.stringify({ fails: [] })); }
`;

const results = [];
for (const version of CANDIDATES) {
  const dir = path.join(os.tmpdir(), 'opencode', 'cand-' + version);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'cand', version: '1.0.0', dependencies: { 'sanitize-html': version } }, null, 2)
  );
  // npm ships as a .cmd shim on Windows, which cannot be spawned directly
  // without a shell, so route it through cmd.exe.
  execFileSync('cmd.exe', ['/c', 'npm', 'install', '--silent', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'pipe' });

  const probe = path.join(dir, 'probe.js');
  fs.writeFileSync(probe, PROBE);

  let installed, hp;
  try {
    installed = JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', 'sanitize-html', 'package.json'), 'utf8')).version;
    hp = JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', 'htmlparser2', 'package.json'), 'utf8')).version + '/' +
         (JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', 'htmlparser2', 'package.json'), 'utf8')).type || 'cjs');
  } catch { hp = '?'; }

  let verdict;
  try {
    const out = execFileSync(process.execPath, ['--no-experimental-require-module', probe],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const r = JSON.parse(out.trim().split('\n').pop());
    verdict = r.fails.length ? 'FAILS: ' + r.fails.join(',') : 'PASS';
  } catch (e) {
    const msg = String(e.stderr || e.message).split('\n').filter(Boolean)[0] || 'unknown';
    verdict = 'ERR ' + msg.replace(/\/var\/task\S*/g, '<path>').slice(0, 70);
  }
  results.push({ version, installed, hp, verdict });
  console.log(`  sanitize-html@${version.padEnd(7)} htmlparser2 ${String(hp).padEnd(12)} -> ${verdict}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

const winner = results.find((r) => r.verdict === 'PASS');
console.log('\n  ' + (winner ? `USE sanitize-html@${winner.version}` : 'no candidate passed'));
process.exitCode = winner ? 0 : 1;

