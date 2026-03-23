import { Link } from "react-router";
import { ArrowLeft, Ghost } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const DOCS = `
# GhostReader

Anti-detect browser rendering proxy with AI-powered content processing. Render any URL to clean markdown through a stealth Camoufox browser, extract structured data, and process content with Ollama AI.

---

## Web UI

You're looking at it. Enter a URL, pick an engine, and hit enter.

| Option | Description |
|--------|-------------|
| **Standard** | Fast extraction via Defuddle — no AI needed |
| **AI** | Ollama reader-lm-v2 restructures content into clean tables/lists |
| **Article** | Aggressive mode — strips sidebars, nav, keeps only main content |
| **Images** | Keep image references in output (off by default) |
| **Format** | markdown, html, or json output |

---

## API

All endpoints are available at the processor URL. The \`/render/\` endpoint embeds the target URL directly in the path (Jina-style).

### Render a URL

\`\`\`
GET /render/https://example.com?engine=standard&format=markdown
\`\`\`

Query params: \`engine\`, \`format\`, \`wait\` (seconds), \`article\`, \`images\`, \`timeout\` (ms).

### Render via POST

\`\`\`bash
curl -X POST /scrape \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com", "engine": "ai"}'
\`\`\`

### Process pre-fetched HTML

\`\`\`bash
curl -X POST /process \\
  -H "Content-Type: application/json" \\
  -d '{"html": "<html>...</html>", "engine": "standard"}'
\`\`\`

### Extract structured results

\`\`\`bash
curl -X POST /extract \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://google.com/search?q=test", "profile": "google_web"}'
\`\`\`

Available profiles: \`google_web\`, \`google_news\`, \`base\`.

### Utility

\`\`\`
GET /health     # {"status":"ok","scraper":"connected"}
GET /engines    # list available engines
GET /profiles   # list extraction profiles
GET /config     # show current configuration
\`\`\`

---

## CLI

Zero-dependency command-line tool. Connects to a GhostReader processor instance.

### Install

\`\`\`bash
npm install -g ghostreader
# or run directly
npx ghostreader render https://example.com
\`\`\`

### Commands

\`\`\`bash
# Render a URL to markdown
ghostreader render https://example.com
ghostreader render https://example.com --engine ai
ghostreader render https://example.com --format json --article

# Extract structured results
ghostreader extract https://google.com/search?q=test --profile google_web
ghostreader extract https://news.google.com --profile google_news --json

# List engines and check health
ghostreader engines
ghostreader health
\`\`\`

### Configuration

\`\`\`bash
export GHOSTREADER_URL=https://ghostreader.example.com
\`\`\`

---

## MCP Server

Model Context Protocol server for AI agents (Claude Desktop, Cursor, OpenCode, etc.).

### Install

\`\`\`bash
npm install -g @ghostreader/mcp
\`\`\`

### Tools

| Tool | Description |
|------|-------------|
| \`ghostreader_scrape\` | Render a URL to markdown via anti-detect browser |
| \`ghostreader_extract\` | Extract structured results using a named profile |

### Configuration

Add to your MCP client config:

**Claude Desktop** (\`claude_desktop_config.json\`):
\`\`\`json
{
  "mcpServers": {
    "ghostreader": {
      "command": "npx",
      "args": ["-y", "@ghostreader/mcp"],
      "env": {
        "GHOSTREADER_URL": "https://ghostreader.example.com"
      }
    }
  }
}
\`\`\`

**OpenCode** (\`opencode.json\`):
\`\`\`json
{
  "mcp": {
    "ghostreader": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@ghostreader/mcp"],
      "env": {
        "GHOSTREADER_URL": "https://ghostreader.example.com"
      }
    }
  }
}
\`\`\`

---

## Engines

| Engine | Speed | Description |
|--------|-------|-------------|
| **standard** | ~2-5s | Defuddle extraction + markdown. No AI required. Best for most pages. |
| **ai** | ~5-15s | Defuddle extraction → Ollama reader-lm-v2 restructuring. Creates clean tables from listings, removes noise. Requires Ollama with reader-lm-v2. |

The AI engine strips images automatically before processing (images waste tokens and add nothing for text models).

---

## Source

[github.com/klosowsk/ghostreader](https://github.com/klosowsk/ghostreader)
`;

export function DocsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Ghost className="size-5 text-foreground" />
          <span className="font-medium text-sm tracking-tight">
            GhostReader
          </span>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-8">
        <div className="w-full max-w-3xl mx-auto prose-ghost">
          <Markdown remarkPlugins={[remarkGfm]}>{DOCS}</Markdown>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-3 px-4 text-center text-xs text-muted-foreground">
        GhostReader v0.1.0
      </footer>
    </div>
  );
}
