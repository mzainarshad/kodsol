/**
 * theme.js — renders blog pages that are visually identical to the existing
 * static homepage, without duplicating the homepage itself.
 *
 * The homepage HTML file is left completely untouched. Design tokens, fonts,
 * base64 logo, nav, footer and the reveal animation are re-emitted here so
 * /blog and /blog/<slug> are indistinguishable from the main site.
 *
 * The only intentional difference: reveal-on-scroll uses a ~1KB
 * IntersectionObserver instead of loading GSAP + ScrollTrigger. The easing and
 * timing below reproduce the homepage's
 *   gsap.fromTo(el, {opacity:0,y:24}, {opacity:1,y:0,duration:.9,ease:'power3.out'})
 * exactly (power3.out ~= cubic-bezier(.215,.61,.355,1)).
 */
'use strict';

const { LOGO_NAV } = require('./logo');

const SITE = {
  name: 'Kodsol',
  tagline: 'Software. AI. Automation. Growth.',
  description:
    'Kodsol builds software, AI systems, workflow automation and growth engines for businesses that need real leverage.',
  email: 'hello@kodsol.com',
  twitter: '@kodsol',
  locale: 'en_US',
};

// Mirrors the homepage :root block exactly.
const TOKENS = `
:root{
  --bg:#07080c; --bg2:#0b0d13; --panel:#10131b; --panel2:#141824;
  --fg:#e9edf7; --fg-dim:#8b93a7; --fg-dimmer:#5a6175;
  --line:rgba(255,255,255,.08); --line2:rgba(255,255,255,.14);
  --accent:#7c5cff; --accent2:#22d3ee; --accent3:#f472b6;
  --grad:linear-gradient(120deg,#7c5cff 0%,#22d3ee 100%);
  --r:18px; --r-sm:12px;
  --shadow:0 24px 60px rgba(0,0,0,.45);
  --ease:cubic-bezier(.215,.61,.355,1);
  --font-display:'Space Grotesk',system-ui,-apple-system,'Segoe UI',sans-serif;
  --font-body:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  /* The 71KB base64 logo is declared once here and referenced by both the
     header and the footer, instead of being inlined twice per page. */
  --logo:url("${LOGO_NAV}");
}`;

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box;}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;}
body{
  margin:0;background:var(--bg);color:var(--fg);
  font-family:var(--font-body);font-size:17px;line-height:1.65;
  -webkit-font-smoothing:antialiased;overflow-x:hidden;
}
body::after{ /* film grain, same as homepage */
  content:'';position:fixed;inset:0;z-index:9;pointer-events:none;opacity:.028;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
}
img{max-width:100%;height:auto;display:block;}
a{color:inherit;text-decoration:none;}
h1,h2,h3,h4{font-family:var(--font-display);font-weight:600;line-height:1.12;margin:0;letter-spacing:-.02em;}

/* reveal — matches homepage .reveal */
.reveal{opacity:0;transform:translateY(24px);}
.reveal.in{
  opacity:1;transform:none;
  transition:opacity .9s var(--ease),transform .9s var(--ease);
}

/* header */
#siteHeader{position:fixed;top:0;left:0;width:100%;z-index:60;transition:background .35s ease,backdrop-filter .35s ease,border-color .35s ease;border-bottom:1px solid transparent;}
#siteHeader.scrolled{background:rgba(7,8,12,.72);backdrop-filter:blur(14px);border-bottom-color:var(--line);}
#siteHeader nav{display:flex;align-items:center;justify-content:space-between;height:74px;}
.logo-mark{display:flex;align-items:center;}
/* Logo — matches the homepage exactly. The mark is a 600x185 wordmark, so it
   is height-constrained and the width follows from aspect-ratio. Declared once
   via --logo and painted by ::before, which keeps the 71KB base64 out of the
   markup while still painting the full, uncropped logo. */
.logo-chip{
  display:inline-flex;align-items:center;justify-content:center;
  padding:7px 14px;border-radius:10px;
  background:linear-gradient(155deg,#f8fafc,#e5e9f0);
  box-shadow:0 10px 24px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.7);
  transition:transform .3s ease;
}
.logo-chip::before{
  content:'';display:block;height:20px;aspect-ratio:600/185;
  background:var(--logo) center/contain no-repeat;
}
.nav-links-wrap{position:relative;}
.nav-links{display:flex;gap:34px;list-style:none;margin:0;padding:0;}
.nav-links a{font-size:.95rem;color:var(--fg-dim);position:relative;padding:6px 0;transition:color .25s ease;}
.nav-links a:hover{color:var(--fg);}
.nav-links a::after{content:'';position:absolute;left:0;right:0;bottom:0;height:1px;background:var(--grad);transform:scaleX(0);transform-origin:left;transition:transform .3s var(--ease);}
.nav-links a:hover::after{transform:scaleX(1);}
.nav-cta{display:flex;align-items:center;gap:14px;}

.btn{
  display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;
  font-size:.92rem;font-weight:500;border:1px solid transparent;cursor:pointer;
  transition:transform .3s var(--ease),box-shadow .3s ease,background .3s ease,color .3s ease;
}
.btn-primary{background:var(--grad);color:#fff;box-shadow:0 8px 24px rgba(124,92,255,.25);}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(124,92,255,.36);}
.btn-ghost{border-color:var(--line2);color:var(--fg-dim);}
.btn-ghost:hover{border-color:var(--accent);color:var(--fg);}

.burger{display:none;width:42px;height:42px;border:1px solid var(--line2);background:transparent;border-radius:11px;cursor:pointer;padding:0;}
.burger span{display:block;width:17px;height:2px;background:var(--fg);margin:3.2px auto;border-radius:2px;transition:transform .3s var(--ease),opacity .2s ease;}

.mobile-menu{
  position:fixed;inset:0 0 0 auto;width:min(78vw,340px);z-index:70;
  background:var(--bg2);border-left:1px solid var(--line);
  display:flex;flex-direction:column;gap:6px;padding:96px 30px 30px;
  transform:translateX(100%);transition:transform .4s var(--ease);
  visibility:hidden;
}
.mobile-menu.open{transform:translateX(0);visibility:visible;}
.mobile-menu a{font-family:var(--font-display);font-size:1.4rem;padding:13px 0;border-bottom:1px solid var(--line);color:var(--fg-dim);}
.mobile-menu a:hover{color:var(--accent);}
.mobile-close{position:absolute;top:26px;right:28px;font-size:.9rem !important;border:0 !important;color:var(--fg-dim) !important;}

/* layout */
.wrap{width:min(1240px,92vw);margin:0 auto;}
main{padding-top:74px;}
section.band{padding:110px 0;}
.section-tag{
  font-family:var(--font-display);font-size:12px;letter-spacing:.22em;text-transform:uppercase;
  color:var(--accent2);margin:0 0 18px;
}
.page-head{max-width:760px;margin-bottom:64px;}
.page-head h1{font-size:clamp(2.6rem,6vw,4.4rem);margin-bottom:20px;}
.page-head .sub{color:var(--fg-dim);font-size:1.12rem;margin:0;}

/* footer */
footer{border-top:1px solid var(--line);padding:78px 0 34px;margin-top:0;}
.foot-top{display:flex;justify-content:space-between;gap:60px;flex-wrap:wrap;}
.foot-brand .logo-chip{padding:12px 22px;margin-bottom:22px;}
.foot-brand .logo-chip::before{height:30px;}
.foot-brand .head{font-size:2.2rem;}
.foot-brand p{color:var(--fg-dim);margin-top:14px;font-size:1.1rem;line-height:1.5;}
.foot-cols{display:flex;gap:70px;flex-wrap:wrap;}
.foot-col h4{font-size:12.5px;color:var(--fg-dim);font-weight:500;margin-bottom:16px;}
.foot-col a{display:block;font-size:.95rem;padding:6px 0;color:var(--fg-dim);}
.foot-col a:hover{color:var(--accent);}
.foot-bottom{display:flex;justify-content:space-between;margin-top:80px;padding-top:26px;border-top:1px solid var(--line);font-size:.85rem;color:var(--fg-dim);flex-wrap:wrap;gap:10px;}

@media (max-width:900px){
  .nav-links-wrap{display:none;}
  .burger{display:block;}
  #siteHeader nav{height:66px;}
  .logo-chip{padding:6px 11px;}
  .logo-chip::before{height:18px;}
  main{padding-top:66px;}
  section.band{padding:74px 0;}
  .foot-cols{gap:38px;}
  .foot-bottom{margin-top:48px;}
}

/* accessibility: honour the OS setting, same as homepage */
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto;}
  .reveal{opacity:1 !important;transform:none !important;transition:none !important;}
  *{animation-duration:.001ms !important;transition-duration:.001ms !important;}
}`;

const BLOG_CSS = `
/* ---------- listing ---------- */
.post-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:30px;}
.post-card{
  display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);
  border-radius:var(--r);overflow:hidden;transition:transform .4s var(--ease),border-color .3s ease,box-shadow .4s var(--ease);
}
.post-card:hover{transform:translateY(-6px);border-color:var(--line2);box-shadow:var(--shadow);}
.post-card .thumb{aspect-ratio:16/9;overflow:hidden;background:var(--panel2);border-bottom:1px solid var(--line);}
.post-card .thumb img{width:100%;height:100%;object-fit:cover;transition:transform .6s var(--ease);}
.post-card:hover .thumb img{transform:scale(1.05);}
.post-card .thumb--empty{display:flex;align-items:center;justify-content:center;background:var(--grad);opacity:.16;font-family:var(--font-display);font-size:2rem;color:var(--fg);}
.post-card .body{padding:26px;display:flex;flex-direction:column;flex:1;gap:12px;}
.post-card h3{font-size:1.32rem;line-height:1.28;}
.post-card h3 a{transition:color .25s ease;}
.post-card h3 a:hover{color:var(--accent2);}
.post-card .excerpt{color:var(--fg-dim);font-size:.97rem;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.post-card .foot{margin-top:auto;padding-top:16px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:.82rem;color:var(--fg-dimmer);}
.empty-state{text-align:center;padding:90px 20px;border:1px dashed var(--line2);border-radius:var(--r);color:var(--fg-dim);}

/* ---------- article ---------- */
.post-hero{padding:70px 0 54px;border-bottom:1px solid var(--line);}
.crumbs{font-size:.85rem;color:var(--fg-dimmer);margin-bottom:26px;}
.crumbs a{color:var(--fg-dim);}
.crumbs a:hover{color:var(--accent2);}
.crumbs .sep{margin:0 9px;opacity:.5;}
.post-hero h1{font-size:clamp(2.3rem,5.2vw,3.7rem);max-width:19ch;margin-bottom:26px;}
.post-meta{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;font-size:.88rem;color:var(--fg-dim);}
.post-meta .dot{width:4px;height:4px;border-radius:50%;background:var(--fg-dimmer);flex:0 0 auto;}
.post-cover{width:100%;max-height:520px;object-fit:cover;border-radius:var(--r);border:1px solid var(--line);margin:56px 0 0;}
.prose{max-width:70ch;margin:0 auto;padding:56px 0 40px;font-size:1.08rem;line-height:1.78;color:#d3d9e7;}
.prose > *:first-child{margin-top:0;}
.prose h2{font-size:clamp(1.6rem,3.4vw,2.15rem);margin:2.2em 0 .7em;padding-top:.3em;}
.prose h3{font-size:1.35rem;margin:1.9em 0 .6em;}
.prose p{margin:0 0 1.25em;}
.prose a{color:var(--accent2);border-bottom:1px solid rgba(34,211,238,.35);}
.prose a:hover{border-bottom-color:var(--accent2);}
.prose strong{color:var(--fg);font-weight:600;}
.prose ul,.prose ol{margin:0 0 1.25em;padding-left:1.4em;}
.prose li{margin-bottom:.5em;}
.prose li::marker{color:var(--accent2);}
.prose blockquote{margin:2em 0;padding:20px 26px;border-left:3px solid var(--accent);background:var(--panel);border-radius:0 var(--r-sm) var(--r-sm) 0;color:var(--fg-dim);font-style:italic;}
.prose blockquote p:last-child{margin-bottom:0;}
.prose code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:.15em .4em;}
.prose pre{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-sm);padding:20px 22px;overflow-x:auto;margin:0 0 1.4em;}
.prose pre code{background:none;border:0;padding:0;font-size:.88rem;line-height:1.6;}
.prose img{border-radius:var(--r-sm);border:1px solid var(--line);margin:1.8em 0;}
.prose hr{border:0;border-top:1px solid var(--line);margin:2.6em 0;}
.prose figure{margin:2em 0;}
.prose figcaption{font-size:.85rem;color:var(--fg-dimmer);margin-top:10px;text-align:center;}

.tag-row{display:flex;flex-wrap:wrap;gap:9px;margin:0 0 34px;padding:0;list-style:none;}
.tag{
  display:inline-block;padding:6px 14px;border:1px solid var(--line2);border-radius:999px;
  font-size:.78rem;color:var(--fg-dim);transition:border-color .25s ease,color .25s ease;
}
.tag:hover{border-color:var(--accent);color:var(--accent2);}

.post-foot{max-width:70ch;margin:0 auto;padding:34px 0 20px;border-top:1px solid var(--line);}
.back-link{display:inline-flex;align-items:center;gap:9px;min-height:44px;padding:8px 0;font-size:.92rem;color:var(--fg-dim);transition:color .25s ease,transform .3s var(--ease);}
.back-link:hover{color:var(--accent2);transform:translateX(-4px);}

.prev-next{display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:70ch;margin:0 auto;padding-bottom:90px;}
.pn-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-sm);padding:20px 22px;transition:border-color .25s ease,transform .3s var(--ease);}
.pn-card:hover{border-color:var(--accent);transform:translateY(-3px);}
.pn-card .lbl{font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:var(--fg-dimmer);display:block;margin-bottom:8px;}
.pn-card .ttl{font-family:var(--font-display);font-size:1.02rem;line-height:1.35;display:block;}
.pn-card--next{text-align:right;}

@media (max-width:720px){
  .prev-next{grid-template-columns:1fr;}
  .pn-card--next{text-align:left;}
  .prose{font-size:1.02rem;}
}`;

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const siteUrl = (path) => {
  const base = String(process.env.SITE_URL || '').replace(/\/+$/, '');
  const p = path ? (path.startsWith('/') ? path : '/' + path) : '';
  return base + p;
};

/**
 * Absolute social share image. Falls back to the generated brand card so a
 * post without a cover image still produces a link preview instead of a blank
 * one. Absolute because most crawlers reject relative og:image URLs.
 */
const DEFAULT_OG = '/assets/og-default.png';
const socialImage = (absPath) => {
  const path = absPath || DEFAULT_OG;
  return siteUrl(path) || path;
};

const NAV = [
  { label: 'Services', href: '/#services' },
  { label: 'Solutions', href: '/#automation' },
  { label: 'Work', href: '/#work' },
  { label: 'How We Work', href: '/#process' },
  { label: 'Technology', href: '/#technology' },
  { label: 'Blog', href: '/blog', current: true },
  { label: 'Contact', href: '/#contact' },
];

function header(activeHref) {
  const links = NAV.map((l) => {
    const cur = activeHref === l.href;
    return `<li><a href="${l.href}"${cur ? ' aria-current="page"' : ''}${cur ? ' style="color:var(--fg)"' : ''}>${esc(l.label)}</a></li>`;
  }).join('');
  const mobile = NAV.map((l) => `<a href="${l.href}">${esc(l.label)}</a>`).join('');
  return `
<div id="siteHeader">
  <nav class="wrap">
    <a href="/" class="logo-mark" aria-label="Kodsol home"><span class="logo-chip" role="img" aria-label="Kodsol"></span></a>
    <div class="nav-links-wrap">
      <ul class="nav-links" id="navLinks">${links}</ul>
    </div>
    <div class="nav-cta">
      <a href="/#contact" class="btn btn-primary">Start a Project</a>
      <button class="burger" id="burgerBtn" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>
  </nav>
</div>
<div class="mobile-menu" id="mobileMenu">
  <a class="mobile-close" id="mobileClose" href="#">Close ✕</a>
  ${mobile}
</div>`;
}

function footer() {
  return `
<footer>
  <div class="wrap">
    <div class="foot-top">
      <div class="foot-brand">
        <span class="logo-chip" role="img" aria-label="Kodsol"></span>
        <p>Software.<br>AI.<br>Automation.<br>Growth.</p>
      </div>
      <div class="foot-cols">
        <div class="foot-col">
          <h4>Company</h4>
          <a href="/#services">Services</a>
          <a href="/#automation">Solutions</a>
          <a href="/#work">Work</a>
          <a href="/#process">How We Work</a>
          <a href="/#contact">Contact</a>
        </div>
        <div class="foot-col">
          <h4>Blog</h4>
          <a href="/blog">All articles</a>
          <a href="/#contact">Work with us</a>
        </div>
        <div class="foot-col">
          <h4>Contact</h4>
          <a href="mailto:${SITE.email}">${SITE.email}</a>
          <a href="/#contact">Start a project</a>
        </div>
      </div>
    </div>
    <div class="foot-bottom">
      <span>© ${new Date().getFullYear()} Kodsol. All rights reserved.</span>
      <span>Engineered by Kodsol.</span>
    </div>
  </div>
</footer>`;
}

// No GSAP: a ~1KB IntersectionObserver reproducing the homepage's reveal timing.
const CLIENT_JS = `
(function(){
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var header = document.getElementById('siteHeader');
  function onScroll(){ header.classList.toggle('scrolled', window.scrollY > 40); }
  onScroll(); window.addEventListener('scroll', onScroll, {passive:true});

  var b=document.getElementById('burgerBtn'), m=document.getElementById('mobileMenu');
  b.addEventListener('click',function(){ m.classList.add('open'); b.setAttribute('aria-expanded','true'); });
  document.getElementById('mobileClose').addEventListener('click',function(e){
    e.preventDefault(); m.classList.remove('open'); b.setAttribute('aria-expanded','false');
  });

  var items = [].slice.call(document.querySelectorAll('.reveal'));
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach(function(el){ el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, {rootMargin:'0px 0px -15% 0px', threshold:0.1});
    items.forEach(function(el){ io.observe(el); });
  }
})();`;

/**
 * Assemble a complete, valid HTML document.
 * @param {object} o
 * @param {string} o.title        <title> text (caller passes the raw title)
 * @param {string} o.description  meta description
 * @param {string} o.path         canonical path, e.g. '/blog' or '/blog/x'
 * @param {string} o.bodyClass    extra class on <body>
 * @param {string} o.css          extra CSS appended after the base
 * @param {string} o.head         extra tags for <head>
 * @param {Array}  o.jsonLd       JSON-LD objects
 * @param {string} o.body         page markup
 * @param {boolean} o.noindex
 */
function page(o) {
  const title = o.title || SITE.name;
  const fullTitle = title === SITE.name ? `${SITE.name} — ${SITE.tagline}` : `${title} | ${SITE.name}`;
  const desc = o.description || SITE.description;
  const url = siteUrl(o.path || '');
  const img = socialImage(o.image);
  const jsonLd = (o.jsonLd || [])
    .map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`)
    .join('\n');

  // article:* only apply to articles; emitting them elsewhere is invalid.
  const articleMeta = o.ogType === 'article' && o.published
    ? `<meta property="article:published_time" content="${esc(o.published)}">` +
      (o.modified ? `<meta property="article:modified_time" content="${esc(o.modified)}">` : '')
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
${o.noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:locale" content="${SITE.locale}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
${articleMeta}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="alternate" type="application/rss+xml" title="${esc(SITE.name)} Blog" href="${esc(siteUrl('/feed.xml'))}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#07080c">
<style>${TOKENS}${BASE_CSS}${o.css || ''}</style>
${o.head || ''}
${jsonLd}
</head>
<body${o.bodyClass ? ` class="${o.bodyClass}"` : ''}>
${header(o.activeNav || '/blog')}
<main>
${o.body}
</main>
${footer()}
<script>${CLIENT_JS}</script>
</body>
</html>`;
}

module.exports = { page, header, footer, esc, siteUrl, socialImage, SITE, TOKENS, BASE_CSS, BLOG_CSS, LOGO_NAV, DEFAULT_OG };
