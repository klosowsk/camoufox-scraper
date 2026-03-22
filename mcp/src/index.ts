#!/usr/bin/env node
/**
 * MCP server for camoufox-scraper.
 *
 * Provides two tools:
 *   camoufox_scrape   – render any URL through the anti-detect browser, return markdown
 *   camoufox_extract  – extract structured results using a named profile
 *
 * Configuration via environment variables:
 *   CAMOUFOX_URL  – base URL of the camoufox-scraper service (default: http://localhost:8080)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import TurndownService from "turndown";
import { z } from "zod";

const CAMOUFOX_URL = process.env.CAMOUFOX_URL?.replace(/\/$/, "") || "http://localhost:8080";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Remove script, style, nav, footer, header tags before converting
turndown.remove(["script", "style", "nav", "footer", "header", "noscript"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const url = `${CAMOUFOX_URL}${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`camoufox-scraper ${endpoint} returned ${res.status}: ${text}`);
  }

  return res.json();
}

function htmlToMarkdown(html: string): string {
  // Strip everything before <body> and after </body> to reduce noise
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : html;
  return turndown.turndown(bodyHtml);
}

function truncate(text: string, maxLen: number = 50000): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `\n\n... [truncated, ${text.length - maxLen} chars omitted]`;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "camoufox",
  version: "0.1.0",
});

// Tool: camoufox_scrape
server.tool(
  "camoufox_scrape",
  "Render a URL using an anti-detect browser (Camoufox) and return the page content as markdown. " +
    "Use this for JS-heavy sites, SPAs, or pages that block normal HTTP fetches. " +
    "The browser has a persistent identity (fingerprint, cookies, cache) that avoids bot detection.",
  {
    url: z.string().url().describe("The URL to render and return as markdown"),
    wait_after_load: z
      .number()
      .min(0)
      .max(30)
      .default(2)
      .describe("Seconds to wait after page load for JS to execute (default: 2)"),
  },
  async ({ url, wait_after_load }) => {
    try {
      const data = (await post("/scrape", {
        url,
        wait_after_load,
        timeout: 30000,
      })) as { html: string; status: number; url: string };

      const markdown = htmlToMarkdown(data.html);

      return {
        content: [
          {
            type: "text" as const,
            text: truncate(markdown),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error scraping ${url}: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: camoufox_extract
server.tool(
  "camoufox_extract",
  "Extract structured results from a URL using a named extraction profile. " +
    "Profiles know how to parse specific sites (e.g., 'google_web' for Google Search, " +
    "'google_news' for Google News). Returns titles, URLs, and content snippets. " +
    "Available profiles: google_web, google_news, base (generic XPath).",
  {
    url: z.string().url().describe("The URL to render and extract results from"),
    profile: z
      .string()
      .describe("Extraction profile name (e.g., 'google_web', 'google_news', 'base')"),
    timeout: z
      .number()
      .min(1000)
      .max(120000)
      .default(30000)
      .describe("Render timeout in milliseconds (default: 30000)"),
  },
  async ({ url, profile, timeout }) => {
    try {
      const data = (await post("/extract", {
        url,
        profile,
        timeout,
      })) as {
        results: Array<{ url: string; title: string; content: string }>;
        suggestions: string[];
        captcha: boolean;
        error: string | null;
      };

      if (data.captcha) {
        return {
          content: [
            {
              type: "text" as const,
              text: `CAPTCHA detected at ${url}. The target site blocked the request. Try again later or use a different query.`,
            },
          ],
          isError: true,
        };
      }

      if (data.error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Extraction error: ${data.error}`,
            },
          ],
          isError: true,
        };
      }

      // Format results as readable text
      const lines: string[] = [];
      lines.push(`Found ${data.results.length} results from ${profile} profile:\n`);

      for (const [i, r] of data.results.entries()) {
        lines.push(`${i + 1}. ${r.title}`);
        lines.push(`   URL: ${r.url}`);
        if (r.content) {
          lines.push(`   ${r.content}`);
        }
        lines.push("");
      }

      if (data.suggestions.length > 0) {
        lines.push("Related searches:");
        for (const s of data.suggestions) {
          lines.push(`  - ${s}`);
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n"),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error extracting from ${url}: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`mcp-camoufox connected (CAMOUFOX_URL=${CAMOUFOX_URL})`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
