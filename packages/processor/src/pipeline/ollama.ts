/**
 * Ollama client for AI-powered HTML-to-Markdown conversion.
 *
 * Supports dynamic model selection at request time.
 * Ollama is entirely optional — if unreachable, AI engines are unavailable
 * and the 'auto' engine falls back to 'turndown'.
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

// ---------------------------------------------------------------------------
// Cached Ollama availability (avoids hitting Ollama on every request)
// ---------------------------------------------------------------------------

let cachedModels: string[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

async function getCachedModels(): Promise<string[]> {
  const now = Date.now();
  if (cachedModels !== null && now < cacheExpiry) {
    return cachedModels;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await getClient().list();
    clearTimeout(timeout);

    cachedModels = response.models.map((m) => m.name);
    cacheExpiry = now + CACHE_TTL_MS;
    return cachedModels;
  } catch {
    cachedModels = [];
    cacheExpiry = now + CACHE_TTL_MS;
    return [];
  }
}

/**
 * Resolve an engine name to an Ollama model name.
 */
export function resolveModel(engine: string): string {
  return ENGINE_MODELS[engine] || engine;
}

/**
 * Check if Ollama is reachable and has any models.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  const models = await getCachedModels();
  return models.length > 0;
}

/**
 * Check if a specific engine/model is available.
 */
export async function isModelAvailable(engine: string): Promise<boolean> {
  const model = resolveModel(engine);
  const models = await getCachedModels();
  return models.some((m) => m === model || m.startsWith(model.split(':')[0]));
}

/**
 * Convert HTML to markdown using an Ollama model.
 *
 * Throws a descriptive error if Ollama is unreachable or the model is unavailable.
 *
 * For reader-lm: send raw HTML directly (it's trained for this).
 * For general models (qwen): use a system prompt.
 */
export async function htmlToMarkdownWithAI(
  html: string,
  engine: string,
): Promise<string> {
  const model = resolveModel(engine);

  // Pre-flight check: is Ollama reachable?
  const available = await isModelAvailable(engine);
  if (!available) {
    const ollamaUp = await isOllamaAvailable();
    if (!ollamaUp) {
      throw new Error(
        `AI engine '${engine}' requires Ollama at ${config.ollamaUrl} which is unreachable. ` +
          `Set OLLAMA_URL to a running Ollama instance, or use engine 'turndown' (no AI required).`,
      );
    }
    throw new Error(
      `Model '${model}' is not available in Ollama. ` +
        `Run 'ollama pull ${model}' to download it, or use engine 'turndown'.`,
    );
  }

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
  return getCachedModels();
}
