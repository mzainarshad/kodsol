/**
 * content.js — pure helpers for turning a blog row into renderable values.
 * No database access, so this is testable without Supabase.
 */
'use strict';

const { esc } = require('./theme');
const { toPlainText, safeImageUrl } = require('./sanitize');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 120;

/**
 * Slugs arrive from the URL, so they are validated before being used in a query
 * or a link. Rejecting everything outside this pattern removes SQL, traversal
 * and cache-poisoning concerns at the boundary.
 */
function isValidSlug(slug) {
  return typeof slug === 'string' && slug.length > 0 && slug.length <= SLUG_MAX && SLUG_RE.test(slug);
}

/** Normalise a slug for comparison/lookup (lowercase, collapse separators). */
function normalizeSlug(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
}

/** ISO 8601 (UTC) for <time datetime> and JSON-LD. */
function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Human-readable absolute date, e.g. "March 4, 2026". */
function formatDate(value) {
  const iso = toIso(value);
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Approximate reading time. ~225 words/min, minimum 1 minute. */
function readingTime(text) {
  const words = toPlainText(text, 100000).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 225));
}

/**
 * A minimal, deliberately small Markdown subset for content stored as plain
 * text. Input is HTML-escaped *before* any transformation, so no author input
 * can become markup. Anything not recognised stays as escaped text.
 *
 * If your Blog table already stores HTML, the renderer uses the sanitizer
 * path instead and this function is not involved.
 */
function renderMarkdown(src) {
  if (!src) return '';
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  let fence = null;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const inline = (t) =>
    esc(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, (m, label, href) => {
        const external = /^https?:/i.test(href);
        return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ''}>${label}</a>`;
      });

  for (const raw of lines) {
    const line = raw.trimEnd();

    const fenceMatch = line.match(/^\s*(```|~~~)\s*([\w+-]*)\s*$/);
    if (fenceMatch) {
      if (fence === null) {
        flushPara();
        flushList();
        fence = fenceMatch[2] || '';
        out.push(`<pre><code${fence ? ` class="language-${esc(fence)}"` : ''}>`);
      } else {
        out.push('</code></pre>');
        fence = null;
      }
      continue;
    }
    if (fence !== null) {
      out.push(esc(line));
      continue;
    }

    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      const level = Math.min(6, Math.max(2, h[1].length)); // h1 is the page title
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      flushPara();
      flushList();
      out.push(`<blockquote><p>${inline(bq[1])}</p></blockquote>`);
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushPara();
      flushList();
      out.push('<hr>');
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (list !== 'ul') {
        flushList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (list !== 'ol') {
        flushList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    para.push(line.trim());
  }

  if (fence !== null) out.push('</code></pre>'); // tolerate an unclosed fence
  flushPara();
  flushList();
  return out.join('\n');
}

/** Normalise tags into a de-duplicated array of short, safe strings. */
function cleanTags(tags) {
  let list = tags;
  if (typeof list === 'string') {
    try {
      const parsed = JSON.parse(list);
      list = Array.isArray(parsed) ? parsed : list.split(',');
    } catch {
      list = list.split(',');
    }
  }
  if (!Array.isArray(list)) return [];
  return [...new Set(
    list
      .map((t) => String(t == null ? '' : t).trim().slice(0, 40))
      .filter((t) => t && /^[\w\s&+.-]+$/.test(t))
      .map((t) => esc(t)),
  )].slice(0, 8);
}

/**
 * Decide how a row's body should be rendered.
 * A body containing block-level tags is treated as HTML and run through the
 * sanitizer; anything else is treated as Markdown/plain text.
 */
function renderBody(row, { sanitizeBody }) {
  const raw = row.contentHtml != null ? row.contentHtml : row.content;
  if (!raw) return '';
  const looksLikeHtml = /<\s*(p|h[1-6]|ul|ol|blockquote|div|figure|pre|table|img)\b/i.test(String(raw));
  return looksLikeHtml ? sanitizeBody(String(raw)) : renderMarkdown(String(raw));
}

/** Card/hero image URL, validated. Empty string when unusable. */
function coverImage(row) {
  return safeImageUrl(row.coverImage || row.cover_image || row.image || row.thumbnail);
}

/** Meta description: use the stored excerpt if present, else derive one. */
function description(row) {
  const provided = String(row.excerpt || row.summary || '').trim();
  if (provided) return toPlainText(provided, 180);
  return toPlainText(row.contentHtml || row.content || '', 165);
}

/**
 * Normalise a tags column to a plain array of strings, WITHOUT escaping.
 *
 * Needed because the shape depends on the column type: `text[]` and `jsonb`
 * arrive as arrays, but a plain `text` or `varchar` column arrives as a string.
 * Code that did `tags.map(...)` therefore threw a TypeError on a string, and in
 * the feed that call sat outside the try block, which surfaced to visitors as a
 * bare 500 FUNCTION_INVOCATION_FAILED. cleanTags() cannot be used for XML
 * because it HTML-escapes its output.
 */
function toTagList(raw) {
  let list = raw;
  if (typeof list === 'string') {
    const trimmed = list.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      list = Array.isArray(parsed) ? parsed : trimmed.split(',');
    } catch {
      list = trimmed.split(',');
    }
  }
  if (!Array.isArray(list)) {
    // A single scalar (jsonb value, number, object) is treated as one tag.
    list = list == null ? [] : [list];
  }
  return list
    .map((t) => (t && typeof t === 'object' ? t.name || t.title || '' : String(t == null ? '' : t)))
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 8);
}

module.exports = {
  isValidSlug,
  normalizeSlug,
  toIso,
  formatDate,
  readingTime,
  renderMarkdown,
  renderBody,
  cleanTags,
  coverImage,
  description,
  toTagList,
  SLUG_RE,
};
