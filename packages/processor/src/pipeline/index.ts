/**
 * Content processing pipeline orchestrator.
 *
 * Routes HTML through the appropriate engine:
 *   - turndown (default): Readability + Turndown — fast, algorithmic
 *   - readerlm: Ollama reader-lm model — best for complex HTML
 *   - qwen-small/medium/large: Ollama qwen models — general purpose
 *   - auto: heuristic selection based on content complexity
 */

import { extractContent } from './readability.js';
import { htmlToMarkdown } from './turndown.js';
import { htmlToMarkdownWithAI, listModels, resolveModel, isOllamaAvailable } from './ollama.js';

export type Engine = 'turndown' | 'readerlm' | 'qwen-small' | 'qwen-medium' | 'qwen-large' | 'auto' | string;
export type OutputFormat = 'markdown' | 'html' | 'json';

export interface ProcessOptions {
  html: string;
  url?: string;
  engine?: Engine;
  format?: OutputFormat;
}

export interface ProcessResult {
  content: string;
  format: OutputFormat;
  engine: string;
  title?: string;
  excerpt?: string;
}

/**
 * Detect if HTML is complex enough to warrant AI processing.
 * Simple heuristic: look for tables, math, deeply nested structures.
 */
function isComplex(html: string): boolean {
  const tableCount = (html.match(/<table[\s>]/gi) || []).length;
  const mathPresent = /<math[\s>]/i.test(html) || /\$\$/.test(html) || /\\begin\{/i.test(html);
  const preCount = (html.match(/<pre[\s>]/gi) || []).length;

  return tableCount >= 3 || mathPresent || preCount >= 5;
}

/**
 * Process HTML through the content pipeline.
 *
 * The default engine (turndown) runs Readability first to extract main content,
 * then Turndown to convert to markdown. AI engines skip Readability and send
 * raw HTML to the model (which handles content extraction itself).
 */
export async function process(options: ProcessOptions): Promise<ProcessResult> {
  const { html, url, format = 'markdown' } = options;
  let engine = options.engine || 'turndown';

  // Auto-select engine: use AI for complex pages, but only if Ollama is available
  if (engine === 'auto') {
    if (isComplex(html) && (await isOllamaAvailable())) {
      engine = 'readerlm';
    } else {
      engine = 'turndown';
    }
  }

  // For HTML format, just run Readability to clean up and return HTML
  if (format === 'html') {
    const article = extractContent(html, url);
    return {
      content: article?.content || html,
      format: 'html',
      engine: 'readability',
      title: article?.title,
      excerpt: article?.excerpt,
    };
  }

  // For JSON format, return Readability metadata
  if (format === 'json') {
    const article = extractContent(html, url);
    const result = {
      title: article?.title || '',
      content: article?.textContent || '',
      excerpt: article?.excerpt || '',
      byline: article?.byline || null,
      siteName: article?.siteName || null,
      length: article?.length || html.length,
    };
    return {
      content: JSON.stringify(result),
      format: 'json',
      engine: 'readability',
      title: article?.title,
    };
  }

  // Markdown format with different engines
  if (engine === 'turndown') {
    // Readability first (extract main content), then Turndown
    const article = extractContent(html, url);
    const sourceHtml = article?.content || html;
    const markdown = htmlToMarkdown(sourceHtml);

    return {
      content: markdown,
      format: 'markdown',
      engine: 'turndown',
      title: article?.title,
      excerpt: article?.excerpt,
    };
  }

  // AI engines: send raw HTML directly to the model
  const markdown = await htmlToMarkdownWithAI(html, engine);
  return {
    content: markdown,
    format: 'markdown',
    engine: resolveModel(engine),
  };
}

/**
 * List all available engines (built-in + Ollama models).
 */
export async function getAvailableEngines(): Promise<Array<{ name: string; type: string; model?: string; available: boolean }>> {
  const engines: Array<{ name: string; type: string; model?: string; available: boolean }> = [
    { name: 'turndown', type: 'algorithmic', available: true },
    { name: 'auto', type: 'auto', available: true },
  ];

  const models = await listModels();

  const aiEngines = [
    { name: 'readerlm', model: 'reader-lm:1.5b' },
    { name: 'qwen-small', model: 'qwen3.5:2b' },
    { name: 'qwen-medium', model: 'qwen3.5:4b' },
    { name: 'qwen-large', model: 'qwen3.5:9b' },
  ];

  for (const e of aiEngines) {
    const available = models.some((m) => m === e.model || m.startsWith(e.model.split(':')[0]));
    engines.push({ name: e.name, type: 'ollama', model: e.model, available });
  }

  return engines;
}
