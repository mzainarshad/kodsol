/**
 * Sample posts, shaped exactly like a row from public."Blog" after toPost().
 *
 * These live in api/ rather than scripts/ so a deployed function never reaches
 * outside its own directory tree. scripts/mock-posts.js re-exports this, so
 * preview and the local dev server still render identical pages.
 *
 * They are only ever served when BLOG_FALLBACK=sample, and that content is
 * marked noindex so it can never be indexed or mistaken for real editorial.
 */
'use strict';

module.exports = [
  {
    title: 'Automating the boring half of a sales pipeline',
    slug: 'automating-the-boring-half-of-a-sales-pipeline',
    excerpt:
      'Most CRM automation fails because it automates the wrong step. Here is the sequence we have shipped for three B2B teams, and why lead scoring came last.',
    coverImage: '',
    publishedAt: '2026-03-04T09:00:00.000Z',
    updatedAt: '2026-03-06T11:30:00.000Z',
    author: 'Kodsol',
    tags: ['automation', 'sales ops'],
    seoTitle: '',
    seoDescription: '',
    minutes: 7,
    contentHtml: `
<p>Every sales team we meet already has a CRM. Almost none of them have a pipeline that runs itself, and the reason is rarely a tooling problem.</p>
<h2>Start at the handoff, not the form</h2>
<p>The instinct is to automate capture. But capture is already cheap — the expensive part is what happens <em>after</em> a reply lands. Automate the qualification, then work backwards.</p>
<blockquote><p>If a step needs a human to read a full email body to decide something, it is not a scoring problem. It is a routing problem.</p></blockquote>
<h3>The sequence that worked</h3>
<ol>
  <li>Route by declared region, not by enrichment.</li>
  <li>Enrich asynchronously — never block the reply.</li>
  <li>Score on behaviour, not on firmographics alone.</li>
</ol>
<pre><code>if (reply.body.length &gt; 400) route('sales'); else route('ae');</code></pre>
<p>The <a href="https://example.com/report" target="_blank" rel="noopener noreferrer nofollow">full teardown</a> is longer than this post.</p>
    `,
  },
  {
    title: 'Retrieval, not memorisation: grounding internal AI assistants',
    slug: 'retrieval-not-memorisation',
    excerpt:
      'Why we almost always reach for retrieval over fine-tuning when an assistant needs to know anything specific to your business.',
    coverImage: '',
    publishedAt: '2026-02-19T09:00:00.000Z',
    updatedAt: null,
    author: 'Kodsol',
    tags: ['ai'],
    minutes: 5,
    contentHtml: '<p>A grounded assistant can cite its source. A fine-tuned one cannot, and that difference decides whether anyone trusts it in production.</p>',
  },
  {
    title: 'Markdown, not HTML: what we store in the database',
    slug: 'markdown-not-html',
    excerpt: null,
    coverImage: '',
    publishedAt: '2026-01-28T09:00:00.000Z',
    author: null,
    tags: null,
    minutes: 0,
    contentHtml: `## Why we stopped storing HTML

Storing rendered HTML in a database means the presentation layer can never change without a migration. Markdown keeps content portable and lets the renderer own the design.

- Content stays portable
- Styling is the renderer's job
- **Bold** and _italics_ keep working

> A note that survived the round trip.`,
  },
  {
    title: 'A CDN cache invalidation bug that cost us a day',
    slug: 'cdn-cache-invalidation-bug',
    excerpt:
      'A postmortem. A stale-while-revalidate edge cache, a deploy ordering mistake, and the debugging step that finally explained it.',
    coverImage: '',
    publishedAt: '2026-01-09T09:00:00.000Z',
    author: 'Kodsol',
    tags: ['engineering'],
    minutes: 6,
    contentHtml: '<p>Short post. The cache was doing exactly what we asked; we had just asked for the wrong thing.</p>',
  },
];
