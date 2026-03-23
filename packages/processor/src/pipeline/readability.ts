/**
 * Mozilla Readability wrapper.
 *
 * Extracts the "main content" from a web page, stripping navigation,
 * sidebars, ads, footers, and other boilerplate.
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
 * Run Mozilla Readability on raw HTML to extract the main article content.
 *
 * Returns cleaned HTML (in the `content` field) suitable for Turndown conversion.
 * Returns null if Readability can't identify main content (e.g., non-article pages).
 */
export function extractContent(html: string, url?: string): ReadabilityResult | null {
  const dom = new JSDOM(html, { url });
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
