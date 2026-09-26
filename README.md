# Kodsol — site + Supabase blog

The marketing homepage is a single self-contained HTML file. The blog is
server-rendered from Supabase by Vercel serverless functions, so article text
is present in the initial HTML response and is crawlable without running
JavaScript.

## Layout

```
index.html                    Homepage served at /  (generated from the original)
Kodsol — ….html              Original homepage, untouched
api/
  blog.js                    /blog
  article.js                 /blog/<slug>
  sitemap.js                 /sitemap.xml
  _lib/
    theme.js                 Design tokens, head, nav, footer, reveal JS
    views.js                 Post objects -> HTML documents
    blog.js                  All SQL; column mapping + publication predicate
    db.js                    Server-only pg pool, timeouts, safe errors
    sanitize.js              allowlist HTML sanitizer (sanitize-html)
    content.js               slug validation, dates, reading time, Markdown
    logo.js                  base64 logo, extracted from the homepage
scripts/
  dev-mock.js              Local server: full site + /blog routes, mock data
  check-schema.js          Read-only schema/connectivity report
  check-links.js           Assert index.html links to /blog
  preview.js               Render /blog + article to .preview/ with mock data
  mock-posts.js            Shared mock content for preview + dev server
  make-index.js            Regenerate index.html from the original
  extract-favicon.js       Write favicon files from the base64 logo
vercel.json                Rewrites, security headers, function config
```

## Setup

### 1. Database

Create the table. Column names below are the ones `api/_lib/blog.js` looks for
first; if yours differ, add them to `CANDIDATES` in that file.

```sql
create table public."Blog" (
  id            uuid primary key default gen_random_uuid(),
  title         text        not null,
  slug          text        not null unique,
  content       text        not null,   -- HTML or Markdown
  excerpt       text,                   -- optional; derived if empty
  cover_image   text,                   -- optional
  tags          text[],                 -- optional
  author        text,
  status        text        not null default 'draft',  -- 'published' | 'draft'
  published_at  timestamptz,
  seo_title     text,
  seo_description text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create index "Blog_published_at_idx" on public."Blog" (published_at desc)
  where status = 'published';
```

Verify read-only before deploying:

```bash
DATABASE_URL="postgresql://..." npm run check:schema
```

It prints the real columns, the resolved field mapping, the publication
predicate, and the published-post count. It never writes.

### 2. Environment

Copy `.env.example` to `.env.local` and fill in both values. Add the same two
variables in Vercel → Project Settings → Environment Variables.

- `DATABASE_URL` — Supabase → Project Settings → Database → Connection string → URI.
  The username must be `postgres.<project-ref>` and `<project-ref>` must match
  your project URL exactly (case-sensitive). URL-encode the password
  (`@` → `%40`, `#` → `%23`, `/` → `%2F`).
- `SITE_URL` — the public origin, no trailing slash. Used for canonical tags,
  `og:url`, `og:image` and `sitemap.xml`. Without it, `/sitemap.xml` returns 503
  rather than emitting a relative sitemap.

### 3. Run

```bash
npm install
npm run dev            # http://localhost:3000 — full site, mock blog data
npm run dev:vercel     # real Vercel runtime (needs DATABASE_URL)
npm run lint           # syntax check all handlers
npm test               # 20 XSS/slug/URL assertions + 20 render assertions
npm run check:schema   # read-only Blog table report
npm run check:links    # assert index.html links to /blog
```

**Do not open `index.html` by double-clicking it.** The nav uses absolute
paths such as `/blog`, which a browser resolves against the filesystem when
the page is loaded over `file://`, producing `ERR_FILE_NOT_FOUND`. Always use
`npm run dev` and browse to `http://localhost:3000`.

`npm run dev` serves the real renderers with mock posts, so `/`, `/blog`,
`/blog/<slug>`, `/sitemap.xml` and 404s all behave as they will in production.

## Behaviour notes

- **Publication.** Rows are served only if the table has a publication signal.
  A `status` column is used when present (`true` for boolean, `'published'`
  when text/enum), otherwise `published_at IS NOT NULL AND published_at <= now()`.
  If the table has neither, every row is treated as public — add a `status`
  column before going live.
- **Content format.** A body containing block-level HTML tags is treated as HTML
  and run through the allowlist sanitizer. Anything else is treated as Markdown
  and escaped before rendering, so Markdown cannot inject markup.
- **Unpublished slugs** return a real `404` with `noindex`, so a removed post
  drops out of the index instead of lingering.
- **Caching.** `/blog` and `/blog/<slug>` send
  `public, s-maxage=600, stale-while-revalidate=86400`, so a new post appears
  within ~10 minutes without a redeploy. `sitemap.xml` revalidates hourly.
- **Payload.** The 71KB base64 logo is declared once as `--logo` and reused by
  the header and footer (~90KB per page instead of ~160KB). Blog pages do not
  load GSAP; reveal-on-scroll is a ~1KB IntersectionObserver matching the
  homepage's `translateY(24px) → 0` / `.9s` / `power3.out` timing and honours
  `prefers-reduced-motion`.

## Before going live

1. Set `SITE_URL` to the real domain. The homepage's `canonical` in
   `index.html` is still the placeholder `https://kodsol.example`.
2. Rotate any database password that has been pasted into a chat, screenshot or
   commit.
3. Add a `status` column if the table has no publication signal.
