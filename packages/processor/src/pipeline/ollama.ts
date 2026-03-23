/**
 * Ollama client for AI-powered HTML-to-Markdown conversion.
 *
 * Supports dynamic model selection at request time.
 */

import { Ollama } from 'ollama';
import { config } from '../config.js';

let client: Ollama | null = null;

function getClient(): Ollama {
  if (!client) {
    client = new Ollama({ host: config.ollamaUrl });
  }
  return client;
}

/**
 * Known engine-to-model mappings. Users can also pass a model name directly.
 */
const ENGINE_MODELS: Record<string, string> = {
  readerlm: 'reader-lm:1.5b',
  'qwen-small': 'qwen3.5:2b',
  'qwen-medium': 'qwen3.5:4b',
  'qwen-large': 'qwen3.5:9b',
};

/**
 * Resolve an engine name to an Ollama model name.
 */
export function resolveModel(engine: string): string {
  return ENGINE_MODELS[engine] || engine;
}

/**
 * Convert HTML to markdown using an Ollama model.
 *
 * For reader-lm: send raw HTML directly (it's trained for this).
 * For general models (qwen): use a system prompt.
 */
export async function htmlToMarkdownWithAI(
  html: string,
  engine: string,
): Promise<string> {
  const model = resolveModel(engine);
  const isReaderLM = model.startsWith('reader-lm');

  const messages = isReaderLM
    ? [{ role: 'user' as const, content: html }]
    : [
        {
          role: 'system' as const,
          content:
            'You are a precise HTML-to-Markdown converter. Extract the main content from the provided HTML and convert it to clean, well-formatted Markdown. Omit navigation, ads, footers, and boilerplate. Preserve all meaningful content, links, headings, lists, tables, and code blocks.',
        },
        { role: 'user' as const, content: html },
      ];

  const response = await getClient().chat({
    model,
    messages,
    options: { temperature: 0 },
  });

  return response.message.content.trim();
}

/**
 * List available Ollama models. Returns model names or empty array if Ollama is unreachable.
 */
export async function listModels(): Promise<string[]> {
  try {
    const response = await getClient().list();
    return response.models.map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Check if Ollama is reachable and a specific model is available.
 */
export async function isModelAvailable(engine: string): Promise<boolean> {
  const model = resolveModel(engine);
  const models = await listModels();
  return models.some((m) => m === model || m.startsWith(model.split(':')[0]));
}
