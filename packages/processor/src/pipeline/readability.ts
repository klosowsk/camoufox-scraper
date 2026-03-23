/**
 * Mozilla Readability wrapper.
 *
 * Extracts the "main content" from a web page, stripping navigation,
 * sidebars, ads, footers, and other boilerplate.
 *
 * Includes a pre-clean step that strips heavy tags (script, style, svg,
 * noscript, iframe) before feeding to JSDOM — critical for large pages
 * where JSDOM parsing would otherwise take 20-30+ seconds.
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export interface ReadabilityResult {
  title: string;
  content: string; // cleaned HTML
  textContent: string;
  excerpt: string;
  byline: string | null;
  siteName: string | null;
  length: number;
}

/**
 * Strip heavy/noisy tags via regex BEFORE feeding to JSDOM.
 * This avoids JSDOM parsing megabytes of inline scripts and SVG paths.
 */
function preClean(html: string): string {
  // Remove script, style, svg, noscript, iframe tags and their contents
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
}

/**
 * Run Mozilla Readability on raw HTML to extract the main article content.
 *
 * Returns cleaned HTML (in the `content` field) suitable for Turndown conversion.
 * Returns null if Readability can't identify main content (e.g., non-article pages).
 */
export function extractContent(html: string, url?: string): ReadabilityResult | null {
  const cleaned = preClean(html);
  const dom = new JSDOM(cleaned, { url });
  const reader = new Readability(dom.window.document);
  const result = reader.parse();

  if (!result) return null;

  return {
    title: result.title,
    content: result.content,
    textContent: result.textContent,
    excerpt: result.excerpt,
    byline: result.byline,
    siteName: result.siteName,
    length: result.length,
  };
}
