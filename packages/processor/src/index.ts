/**
 * GhostReader Content Processor
 *
 * Entry point — starts the Hono HTTP server.
 */

import { serve } from '@hono/node-server';
import { app } from './server.js';
import { config } from './config.js';

console.log(`[ghostreader] Starting processor on port ${config.port}`);
console.log(`[ghostreader] Scraper: ${config.scraperUrl}`);
console.log(`[ghostreader] Ollama: ${config.ollamaUrl} (default model: ${config.ollamaDefaultModel})`);

serve({
  fetch: app.fetch,
  port: config.port,
}, (info) => {
  console.log(`[ghostreader] Processor listening on http://localhost:${info.port}`);
});
