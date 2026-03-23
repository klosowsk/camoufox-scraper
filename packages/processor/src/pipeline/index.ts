/**
 * Content processing pipeline orchestrator.
 *
 * Routes HTML through the appropriate engine:
 *   - standard (default): Smart DOM extraction + Turndown — fast, no AI
 *   - readerlm: Ollama reader-lm model — best for complex HTML
 *   - qwen-small: Ollama qwen3.5:2b — general purpose
 *   - auto: heuristic selection based on content complexity
 */

import { extractContent } from './readability.js';
import { htmlToMarkdown } from './turndown.js';
import { htmlToMarkdownWithAI, listModels, resolveModel, isOllamaAvailable } from './ollama.js';

export type Engine = 'standard' | 'readerlm' | 'qwen-small' | 'auto' | string;
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
 * The default engine (standard) uses smart DOM extraction (strip nav/header/footer,
 * extract <main>) then Turndown for markdown conversion.
 * AI engines send pre-cleaned HTML to the model directly.
 */
export async function process(options: ProcessOptions): Promise<ProcessResult> {
  const { html, url, format = 'markdown' } = options;
  let engine = options.engine || 'standard';

  // Backward compat: accept 'turndown' as alias for 'standard'
  if (engine === 'turndown') engine = 'standard';

  // Auto-select engine: use AI for complex pages, but only if Ollama is available
  if (engine === 'auto') {
    if (isComplex(html) && (await isOllamaAvailable())) {
      engine = 'readerlm';
    } else {
      engine = 'standard';
    }
  }

  // Smart DOM extraction (used by standard engine and html/json formats)
  const extracted = extractContent(html, url);

  // For HTML format, return the cleaned HTML
  if (format === 'html') {
    return {
      content: extracted.content,
      format: 'html',
      engine: 'standard',
      title: extracted.title,
    };
  }

  // For JSON format, return extracted content as text
  if (format === 'json') {
    const result = {
      title: extracted.title,
      content: extracted.content,
      length: extracted.content.length,
    };
    return {
      content: JSON.stringify(result),
      format: 'json',
      engine: 'standard',
      title: extracted.title,
    };
  }

  // Markdown format with different engines
  if (engine === 'standard') {
    const markdown = htmlToMarkdown(extracted.content);
    return {
      content: markdown,
      format: 'markdown',
      engine: 'standard',
      title: extracted.title,
    };
  }

  // AI engines: send pre-cleaned HTML to the model
  const markdown = await htmlToMarkdownWithAI(extracted.content, engine);
  return {
    content: markdown,
    format: 'markdown',
    engine: resolveModel(engine),
    title: extracted.title,
  };
}

/**
 * List all available engines (built-in + Ollama models).
 */
export async function getAvailableEngines(): Promise<Array<{ name: string; type: string; model?: string; available: boolean }>> {
  const engines: Array<{ name: string; type: string; model?: string; available: boolean }> = [
    { name: 'standard', type: 'fast', available: true },
    { name: 'auto', type: 'auto', available: true },
  ];

  const models = await listModels();

  const aiEngines = [
    { name: 'readerlm', model: 'reader-lm:1.5b' },
    { name: 'qwen-small', model: 'qwen3.5:2b' },
  ];

  for (const e of aiEngines) {
    const available = models.some((m) => m === e.model || m.startsWith(e.model.split(':')[0]));
    engines.push({ name: e.name, type: 'ai', model: e.model, available });
  }

  return engines;
}
