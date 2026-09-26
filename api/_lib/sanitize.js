/**
 * sanitize.js — the only gate between database content and rendered HTML.
 *
 * Blog copy is authored in a database, so it is treated as untrusted input.
 * sanitize-html's parser (htmlparser2) is used rather than regexes: a regex
 * sanitizer can be bypassed with malformed markup such as
 * `<img src=x onerror=alert(1)>` split across node boundaries.
 *
 * Default posture is deny — every tag, attribute and URL scheme must be
 * explicitly allowed here to reach the page.
 */
'use strict';

const sanitizeHtml = require('sanitize-html');
const { esc } = require('./theme');

const OPTIONS = {
  // Structural + typographic tags. No script, style, iframe, object, form, input.
  allowedTags: [
    'p', 'br', 'hr', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'blockquote', 'pre', 'code', 'kbd', 'samp',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'span', 'div', 'section', 'article',
  ],

  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
    '*': ['class', 'id'],
  },

  // Only these URL schemes. Blocks javascript:, vbscript:, data: (which can
  // carry text/html), and file:.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },

  // No iframes, no object/embed, no form controls — keep the surface minimal.
  allowProtocolRelative: false,
  enforceHtmlBoundary: true,

  transformTags: {
    // Every external link is hardened and opened in a new tab.
    a: (tagName, attribs) => {
      const href = attribs.href || '';
      const isExternal = /^https?:\/\//i.test(href);
      return {
        tagName,
        attribs: isExternal
          ? { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' }
          : attribs,
      };
    },
    // Lazy-load images so they never block the largest contentful paint.
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: 'lazy', decoding: 'async' },
    }),
  },

  // Keep a small set of author-facing classes for the .prose stylesheet,
  // but drop anything that could collide with site layout classes.
  allowedClasses: {
    '*': ['language-*', 'highlight', 'callout', 'lead'],
  },
};

/** Sanitize a full article body. */
function sanitizeBody(html) {
  if (!html) return '';
  return sanitizeHtml(String(html), OPTIONS);
}

/**
 * Build a safe plain-text excerpt for meta descriptions and card summaries.
 * Strips all markup AND Markdown syntax, collapses whitespace, and escapes the
 * result — so a Markdown-stored post never leaks "##" or "**" into a <meta>.
 */
function toPlainText(html, maxLen = 165) {
  if (!html) return '';
  let text = sanitizeHtml(String(html), { allowedTags: [], allowedAttributes: {} });
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Markdown: images -> alt, links -> label
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Markdown: fences and inline code
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    // Markdown: emphasis, headings, quotes, list markers, rules
    .replace(/(\*\*\*|\*\*\*|___|__|\*\*|\*|_|~~)/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s{0,3}(?:---|\*\*\*|___)\s*$/gm, ' ')
    // Headings that survived inline stripping still read better with a space.
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLen) return esc(text);

  // Prefer cutting at a word boundary, and never leave a dangling entity.
  let cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.6) cut = cut.slice(0, lastSpace);
  cut = cut.replace(/&[a-z#0-9]+$/i, '').replace(/[^\w\s.]$/, '');
  return esc(cut) + '…';
}

/**
 * Validate an image URL for use in og:image / twitter:image.
 * Same-origin paths and http(s) URLs only; data: URIs are rejected so a
 * multi-megabyte image can never bloat a social preview.
 */
function safeImageUrl(url) {
  if (!url) return '';
  const raw = String(url).trim();
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

module.exports = { sanitizeBody, toPlainText, safeImageUrl };
