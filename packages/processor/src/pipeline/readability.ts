/**
 * Smart content extraction.
 *
 * Uses JSDOM to parse the HTML, strips noisy elements (nav, header, footer,
 * aside, script, style, svg, noscript, iframe), then extracts the <main>
 * content if available, otherwise falls back to <body>.
 *
 * This approach preserves data-heavy content (tables, charts, indicators)
 * that Mozilla Readability would strip, while still removing navigation
 * chrome and boilerplate.
 */

import { JSDOM } from 'jsdom';

export interface ExtractedContent {
  title: string;
  content: string; // cleaned HTML suitable for Turndown
}

/**
 * Strip heavy tags via regex BEFORE feeding to JSDOM.
 * Avoids JSDOM parsing megabytes of inline scripts and SVG paths.
 */
function preClean(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
}

/**
 * Extract content from rendered HTML using smart DOM extraction.
 *
 * 1. Pre-clean: strip script/style/svg/noscript/iframe via regex (fast)
 * 2. Parse with JSDOM
 * 3. Remove nav, header, footer, aside elements
 * 4. Extract <main> content if present, otherwise <body>
 * 5. Return cleaned HTML + page title
 */
export function extractContent(html: string, url?: string): ExtractedContent {
  const cleaned = preClean(html);
  const dom = new JSDOM(cleaned, { url });
  const doc = dom.window.document;

  // Get title before stripping elements
  const title = doc.querySelector('title')?.textContent?.trim() || '';

  // Remove noisy structural elements
  doc.querySelectorAll('nav, header, footer, aside').forEach((el) => el.remove());

  // Extract <main> if it exists (most modern sites have one), otherwise <body>
  const main = doc.querySelector('main');
  const content = main ? main.innerHTML : doc.body?.innerHTML || cleaned;

  return { title, content };
}
