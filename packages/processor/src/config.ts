/**
 * Environment-based configuration for the processor.
 */

export interface Config {
  port: number;
  scraperUrl: string;
  ollamaUrl: string;
  ollamaDefaultModel: string;
  logLevel: string;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    scraperUrl: (process.env.SCRAPER_URL || 'http://localhost:8080').replace(/\/$/, ''),
    ollamaUrl: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
    ollamaDefaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'reader-lm:1.5b',
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}

export const config = loadConfig();
