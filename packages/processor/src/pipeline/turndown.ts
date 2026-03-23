/**
 * Turndown HTML-to-Markdown converter.
 *
 * Configured to produce clean, readable markdown from web content.
 */

import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
});

// Remove noisy tags before converting
turndown.remove(['script', 'style', 'noscript', 'iframe']);

/**
 * Convert HTML to clean markdown using Turndown.
 */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim();
}
