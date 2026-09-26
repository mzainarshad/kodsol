/**
 * views.js — turns post objects into full HTML documents.
 *
 * Kept free of database and request handling so the exact output that Vercel
 * will serve can be rendered and inspected locally.
 */
'use strict';

const { page, esc, siteUrl, SITE, BLOG_CSS } = require('./theme');
const { sanitizeBody } = require('./sanitize');
const {
  renderBody, formatDate, toIso, readingTime, cleanTags, toTagList, coverImage, description,
} = require('./content');

const ORG_ID = `${siteUrl('')}#organization`;

/** Site-level JSON-LD, matching the homepage's Organization block. */
function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.name,
    url: siteUrl('') || 'https://kodsol.com',
    logo: {
      '@type': 'ImageObject',
      url: siteUrl('/favicon.ico'),
    },
    email: SITE.email,
    description: SITE.description,
  };
}

/** WebSite + SearchAction, so the blog can be surfaced as a site property. */
function webSiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl('')}#website`,
    name: SITE.name,
    url: siteUrl('') || 'https://kodsol.com',
    publisher: { '@id': ORG_ID },
  };
}

/** Blog posts index, so Google can treat /blog as a distinct entity. */
function blogLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${siteUrl('/blog')}#blog`,
    name: `${SITE.name} Blog`,
    description: 'Notes on software, AI, automation and growth from the Kodsol team.',
    url: siteUrl('/blog'),
    publisher: { '@id': ORG_ID },
    inLanguage: 'en',
  };
}

/** A single article, with full Article + BreadcrumbList graph. */
function articleLd(post) {
  const url = siteUrl(`/blog/${post.slug}`);
  const img = coverImage(post);
  const published = toIso(post.publishedAt);
  const modified = toIso(post.updatedAt) || published;

  const graph = [
    {
      '@type': 'BlogPosting',
      '@id': `${url}#article`,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      headline: post.title.slice(0, 110),
      description: description(post),
      url,
      datePublished: published,
      dateModified: modified,
      inLanguage: 'en',
      author: { '@type': post.author ? 'Person' : 'Organization', name: post.author || SITE.name },
      publisher: { '@id': ORG_ID },
      isPartOf: { '@id': `${siteUrl('/blog')}#blog` },
      ...(img ? { image: { '@type': 'ImageObject', url: siteUrl(img) || img } } : {}),
      ...(toTagList(post.tags).length ? { keywords: toTagList(post.tags).join(', ') } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl('') },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: siteUrl('/blog') },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    },
  ];

  return { '@context': 'https://schema.org', '@graph': graph };
}

function tagList(tags) {
  if (!tags || !tags.length) return '';
  return `<ul class="tag-row">${tags
    .map((t) => `<li><a class="tag" href="/blog">${t}</a></li>`)
    .join('')}</ul>`;
}

function byline(post) {
  const parts = [];
  const date = formatDate(post.publishedAt);
  // The separator is decorative: hidden from assistive tech so the byline is
  // not announced as one unspaced run of text.
  const SEP = '<span class="dot" aria-hidden="true"></span>';
  if (date) parts.push(`<time datetime="${esc(toIso(post.publishedAt))}">${esc(date)}</time>`);
  if (post.author) parts.push(`<span>${esc(String(post.author))}</span>`);
  const mins = Number(post.minutes) > 0 ? Number(post.minutes) : readingTime(post.contentHtml || post.content);
  parts.push(`<span>${mins} min read</span>`);
  return parts.join(SEP);
}

function card(post) {
  const img = coverImage(post);
  const thumb = img
    ? `<div class="thumb"><img src="${esc(img)}" alt="${esc(post.title)}" loading="lazy" decoding="async"></div>`
    : `<div class="thumb thumb--empty" aria-hidden="true">${esc(
        (post.title || 'K').trim().charAt(0).toUpperCase(),
      )}</div>`;

  const date = formatDate(post.publishedAt);
  return `
  <article class="post-card reveal">
    ${thumb}
    <div class="body">
      <h3><a href="/blog/${esc(post.slug)}">${esc(post.title)}</a></h3>
      <p class="excerpt">${description(post)}</p>
      <div class="foot">
        <span>${date ? `<time datetime="${esc(toIso(post.publishedAt))}">${esc(date)}</time>` : ''}</span>
        <span>${Number(post.minutes) > 0 ? Number(post.minutes) : readingTime(post.contentHtml || post.content)} min</span>
      </div>
    </div>
  </article>`;
}

/** /blog — paginated index. */
/**
 * Banner shown above sample content. It states plainly that these are placeholders,
 * so a visitor (or a preview screenshot) can never mistake them for real posts.
 */
function sampleNotice() {
  return `
  <div class="wrap">
    <p style="border:1px solid rgba(217,119,6,.45);background:rgba(217,119,6,.10);color:#fde68a;border-radius:12px;padding:14px 18px;margin:0 0 28px;font-size:.92rem;line-height:1.6">
      <strong>Sample content.</strong> The database is not connected, so these are
      demonstration posts rather than real articles. Set <code>DATABASE_URL</code> in
      Vercel and redeploy to publish the real blog.
    </p>
  </div>`;
}

function renderListing({ posts, total, page: pageNum, perPage, fallback = false }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const jsonLd = [organizationLd(), webSiteLd(), blogLd()];

  if (pageNum > 1) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${SITE.name} Blog — page ${pageNum}`,
      url: siteUrl(`/blog?page=${pageNum}`),
      isPartOf: { '@id': `${siteUrl('/blog')}#blog` },
    });
  }

  const pager = [];
  if (pageNum > 1) pager.push(`<a class="btn btn-ghost" href="/blog${pageNum > 2 ? `?page=${pageNum - 1}` : ''}">← Newer</a>`);
  if (pageNum < totalPages) pager.push(`<a class="btn btn-ghost" href="/blog?page=${pageNum + 1}">Older →</a>`);

  const body = `
  <section class="band">
    <div class="wrap">
      <div class="page-head">
        <p class="section-tag reveal">Journal</p>
        <h1 class="reveal">Notes on building.</h1>
        <p class="sub reveal">How we think about software, AI, automation and growth — written by the people doing the work.</p>
      </div>

      ${fallback ? sampleNotice() : ''}

      ${
        posts.length
          ? `<div class="post-grid">${posts.map(card).join('')}</div>`
          : `<div class="empty-state reveal">
               <h2 style="font-size:1.4rem;margin-bottom:10px">No posts published yet.</h2>
               <p style="margin:0">Once the first article is published it will appear here.</p>
             </div>`
      }

      ${pager.length ? `<div style="display:flex;gap:12px;justify-content:center;margin-top:56px">${pager.join('')}</div>` : ''}
    </div>
  </section>`;

  return page({
    title: pageNum > 1
      ? `Blog — Software, AI & Automation Articles (page ${pageNum})`
      : 'Blog — Software, AI, Automation & Growth Articles',
    description:
      pageNum > 1
        ? `Page ${pageNum} of articles from the Kodsol team on software, AI, workflow automation and growth.`
        : 'Articles from the Kodsol team on software, AI, workflow automation and growth.',
    path: pageNum > 1 ? `/blog?page=${pageNum}` : '/blog',
    css: BLOG_CSS,
    jsonLd,
    body,
    // Sample content is a stopgap, never real editorial: keep it out of indexes.
    noindex: fallback,
  });
}

/** /blog/<slug> — a single article. */
function renderArticle({ post, prev, next, fallback = false }) {
  const url = siteUrl(`/blog/${post.slug}`);
  const img = coverImage(post);
  const title = String(post.seoTitle || post.title || '').trim();
  const desc = String(post.seoDescription || '').trim() || description(post);
  const tags = cleanTags(post.tags);
  const bodyHtml = renderBody(post, { sanitizeBody });

  const hero = `
  <section class="post-hero">
    <div class="wrap">
      <p class="crumbs">
        <a href="/">Home</a><span class="sep">/</span><a href="/blog">Blog</a>
      </p>
      ${fallback ? sampleNotice() : ''}
      ${tagList(tags)}
      <h1>${esc(post.title)}</h1>
      <div class="post-meta">${byline(post)}</div>
    </div>
  </section>`;

  const cover = img
    ? `<div class="wrap"><img class="post-cover" src="${esc(img)}" alt="${esc(post.title)}" decoding="async"></div>`
    : '';

  const nav = [];
  if (prev) {
    nav.push(`<a class="pn-card" href="/blog/${esc(prev.slug)}"><span class="lbl">Previous</span><span class="ttl">${esc(prev.title)}</span></a>`);
  }
  if (next) {
    nav.push(`<a class="pn-card pn-card--next" href="/blog/${esc(next.slug)}"><span class="lbl">Next</span><span class="ttl">${esc(next.title)}</span></a>`);
  }

  const body = `
${hero}
${cover}
  <div class="wrap">
    <article class="prose">
${bodyHtml}
    </article>
    <div class="post-foot">
      <a class="back-link" href="/blog">← All articles</a>
    </div>
    ${nav.length ? `<nav class="prev-next" aria-label="More articles">${nav.join('')}</nav>` : ''}
  </div>`;

  const published = toIso(post.publishedAt);
  const modified = toIso(post.updatedAt) || published;

  return page({
    title,
    description: desc,
    path: `/blog/${post.slug}`,
    ogType: 'article',
    image: coverImage(post) || undefined,
    published,
    modified,
    css: BLOG_CSS,
    jsonLd: [articleLd(post)],
    body,
    noindex: fallback,
  });
}

/** /404 for an unknown slug. */
function renderNotFound() {
  return page({
    title: 'Article not found',
    description: 'The article you are looking for does not exist or has been moved.',
    path: '/blog',
    noindex: true,
    css: BLOG_CSS,
    body: `
  <section class="band">
    <div class="wrap" style="text-align:center;max-width:640px">
      <p class="section-tag reveal" style="text-align:center">404</p>
      <h1 class="reveal" style="font-size:clamp(2.2rem,6vw,3.4rem);margin-bottom:18px">This article isn't here.</h1>
      <p class="sub reveal" style="margin-bottom:34px">It may have been unpublished or the link is out of date.</p>
      <a class="btn btn-primary reveal" href="/blog">Browse all articles</a>
    </div>
  </section>`,
  });
}

/** Shown when the database is unreachable, so the site degrades gracefully. */
function renderErrorPage(message) {
  return page({
    title: 'Temporarily unavailable',
    description: 'The blog is temporarily unavailable.',
    path: '/blog',
    noindex: true,
    css: BLOG_CSS,
    body: `
  <section class="band">
    <div class="wrap" style="text-align:center;max-width:640px">
      <p class="section-tag reveal" style="text-align:center">Unavailable</p>
      <h1 class="reveal" style="font-size:clamp(2rem,5.5vw,3rem);margin-bottom:18px">The blog can't be reached right now.</h1>
      <p class="sub reveal" style="margin-bottom:34px">${esc(message)}</p>
      <a class="btn btn-ghost reveal" href="/">Back to home</a>
    </div>
  </section>`,
  });
}

module.exports = { renderListing, renderArticle, renderNotFound, renderErrorPage };
