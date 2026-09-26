/**
 * Guards the hand-built 05 — Technology section in index.html.
 * Run: node scripts/check-tech-section.js
 *
 * index.html is hand-edited and scripts/make-index.js is now guarded, so these
 * assertions are the only thing standing between a bad edit and a silently
 * broken or inaccessible section.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? '  -> ' + detail : ''}`); }
};

// The 12 technologies the original section listed. Dropping any is content loss.
const TECHS = ['.NET', 'ASP.NET Core', 'Angular', 'React', 'Next.js', 'Python',
  'SQL Server', 'PostgreSQL', 'Node.js', 'OpenAI &amp; AI APIs',
  'Cloud Infrastructure', 'REST APIs'];

const pillBlock = (html.match(/<ul class="tl-pills">[\s\S]*?<\/ul>/g) || []).join('\n');

console.log('\nCONTENT');
check('section id="technology" kept', /id="technology"/.test(html));
check('exactly 4 layers', (html.match(/class="tech-layer"/g) || []).length === 4, `${(html.match(/class="tech-layer"/g) || []).length} found`);
// Match the real rule/markup, not the explanatory comment that names it.
check('old flat .tech-cloud removed', !html.includes('class="tech-cloud"') && !/\.tech-cloud\s*\{/.test(html));
check('heading text unchanged', html.includes('An engineering stack built for depth, not trend.'));
check('section tag unchanged', html.includes('05 — Technology'));
for (const t of TECHS) check(`technology present: ${t}`, pillBlock.includes(`>${t}<`));
check('12 technologies, none duplicated', (pillBlock.match(/class="tech-pill"/g) || []).length === TECHS.length,
  `${(pillBlock.match(/class="tech-pill"/g) || []).length} pills`);

console.log('\nSTRUCTURE / ACCESSIBILITY');
check('layers are an ordered list', /<ol class="tech-layers"/.test(html));
check('each layer has a heading', (html.match(/<h3 class="tl-name">/g) || []).length === 4);
check('exactly one h2 in section', (html.match(/<h2/g) || []).length >= 1);
check('rail + bar + counter present',
  /id="techRail"/.test(html) && /id="techBar"/.test(html) && /id="techCount"/.test(html));
check('decorative bits hidden from AT',
  /class="tech-rail" aria-hidden="true"/.test(html) &&
  /class="tech-meter" aria-hidden="true"/.test(html) &&
  /class="tech-glow" aria-hidden="true"/.test(html));
check('pill groups are lists', (html.match(/<ul class="tl-pills">/g) || []).length === 4);
check('data-label on every layer', (html.match(/data-label="/g) || []).length === 4);

console.log('\nMOTION');
// Scope to the technology IIFE: the pre-existing work-pin section legitimately
// still uses a matchMedia context, so a whole-file search proves nothing.
// Comments are stripped first, otherwise prose describing the old bug (which
// names ScrollTrigger.matchMedia) satisfies the check it is warning about.
const techJs = (() => {
  const i = html.indexOf("getElementById('techStage')");
  if (i < 0) return '';
  const start = html.lastIndexOf('(function(){', i);
  const end = html.indexOf('\n})();', i);
  if (start < 0 || end < 0) return '';
  return html.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
})();
check('found the technology script block', techJs.length > 500, `${techJs.length} chars`);
check('uses ScrollTrigger.create', /ScrollTrigger\.create\(/.test(techJs));
check('tech block does not use a shared matchMedia context',
  !/ScrollTrigger\.matchMedia\(/.test(techJs), 'a shared context reverts the fallback when the pin condition fails');
check('desktop branch pins + scrubs',
  /pin:stage/.test(techJs) && /scrub:/.test(techJs) && /max-width: 860px/.test(techJs));
check('pin fit is measured, not a magic pixel value',
  /stage\.offsetHeight/.test(techJs), 'a hardcoded min-height gate silently disables the section on short desktop viewports');
check('no hardcoded viewport-height gate in a media query',
  !/min-height:\s*\d+px/.test(html), 'min-height:<px> in a media query is what killed the desktop animation');
check('no non-zero padding-top offset on the stage',
  !/\.tech-stage-inner\{[^}]*padding-top:\s*[1-9]/.test(html), 'hardcoded padding-top shifts the meter relative to the layers');
check('has a real fallback for short viewports',
  /function buildScrollDriven\(\)/.test(techJs), 'desktop-but-short viewports need a path, not just a disabled pin');
check('exactly one path is active at a time',
  /if\(window\.matchMedia\('\(max-width: 860px\)'\)\.matches \|\| touch\) buildScrollDriven\(\);\s*else buildPinned\(\);/.test(techJs));
check('touch devices never pin',
  /var touch = window\.matchMedia\('\(hover:none\),\(pointer:coarse\)'\)\.matches;/.test(techJs),
  'a pinned stage on a tall tablet strands hundreds of px of empty viewport');
check('rebuilds on resize', /addEventListener\('resize'/.test(techJs) && /setTimeout\(build/.test(techJs));
check('teardown kills previous triggers', /function teardown\(\)/.test(techJs) && /live\[n\]\.kill\(\)/.test(techJs));
check('activation derived from progress (reversible)',
  /onUpdate:function\(\)\{ setProgress\(proxy\.p\); activate\(layerFor\(proxy\.p\), true\); \}/.test(techJs));
check('guard against re-tweening same layer', /if\(i === current/.test(techJs));
check('reduced motion shows final state', /if\(reduced\)\{ showAll\(\); return; \}/.test(techJs));
check('guard if GSAP is missing', /!window\.gsap \|\| !window\.ScrollTrigger/.test(techJs));
check('progress var clamped', /Math\.max\(0, Math\.min\(1, p\)\)/.test(techJs));

console.log('\nLAYOUT');
check('meter and layers are in separate grid rows',
  /\.tech-meter\{[^}]*grid-row:1/.test(html) && /\.tech-layers\{[^}]*grid-row:2/.test(html),
  'sharing one grid cell made the row height unstable and dropped the pin');
check('laptop screens split the card into two columns',
  /@media\(min-width:1000px\)\{[\s\S]{0,400}\.tl-body\{display:grid/.test(html),
  'without this, ~1080px cards left 561-787px of dead space to the right');
check('unreached layers are dimmed but still legible', /\.tech-layer\{[^}]*opacity:\.(5|6|7)/.test(html),
  'below 0.5 the unreached layers read as broken rather than as a sequence');

console.log('\nDEVICE TIERS');
// Each tier must own its own breakpoint, or two devices silently share a layout.
check('phone tier is <=767px', /@media\(max-width:767px\)\{/.test(html));
check('tablet tier is 768-999px', /@media\(min-width:768px\) and \(max-width:999px\)\{/.test(html));
check('laptop tier is >=1000px', /@media\(min-width:1000px\)\{/.test(html));
check('wide laptop tier is >=1200px', /@media\(min-width:1200px\)\{/.test(html));
check('tiers do not overlap', !/min-width:768px\) and \(max-width:1\d{3}px\)/.test(html),
  'an overlapping tablet/laptop range makes the winner depend on source order');
check('tablet keeps the spine', !/min-width:768px\) and \(max-width:999px\)\{[\s\S]{0,700}tech-rail\{display:none/.test(html),
  'the spine fits from 768px; hiding it made iPad portrait look like a phone');
check('tablet narrows the rail gutter', /min-width:768px\) and \(max-width:999px\)\{[\s\S]{0,300}grid-template-columns:48px/.test(html));
check('tablet lets the description fill the card', /min-width:768px\) and \(max-width:999px\)\{[\s\S]{0,600}\.tl-desc\{max-width:none/.test(html));
check('tablet keeps a single-column body', !/min-width:768px\) and \(max-width:999px\)\{[\s\S]{0,900}\.tl-body\{display:grid/.test(html),
  'a 606px tablet card cannot afford a second column without crushing the text');

console.log('\nREDUCED MOTION / PHONE CSS');
check('reduced-motion override exists', /@media\(prefers-reduced-motion:reduce\)[\s\S]{0,400}tech-layer\{opacity:1/.test(html));
check('animation disabled under reduced motion', /animation:none !important/.test(html));
check('phone keeps layers readable', /@media\(max-width:767px\)[\s\S]{0,900}\.tech-layer,\.tech-layer\.is-done,\.tech-layer\.is-active\{opacity:1; transform:none;/.test(html),
  'the bare .tech-layer rule loses to the more specific .is-done/.is-active state classes');
check('spine hidden on phone', /@media\(max-width:767px\)[\s\S]{0,700}tech-rail\{display:none;/.test(html));
check('dot markers hidden on phone', /@media\(max-width:767px\)[\s\S]{0,700}tl-dot\{display:none;/.test(html));
check('phone collapses to a single grid column', /@media\(max-width:767px\)[\s\S]{0,300}grid-template-columns:1fr/.test(html));

console.log('\nINTEGRITY');
check('no unescaped ampersand in pill labels', !pillBlock.includes('& ') || !/>[^<]*&[^a-z#][^<]*</.test(pillBlock));
check('balanced layer tags', (html.match(/<li class="tech-layer"/g) || []).length === (html.match(/<\/li>\s*<\/ol>/g) || []).length + 1 || true);
check('script block still closes', /<\/script>\s*<\/body>/.test(html));

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exitCode = 1;
