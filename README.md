# camoufox-scraper

Small HTTP service that renders pages with Camoufox and returns HTML.

It is meant to be used as a browser backend for SearXNG custom engines (or any crawler that needs rendered DOM).

## API

- `GET /health`
- `POST /scrape`

Request body:

```json
{
  "url": "https://example.com",
  "wait_after_load": 2,
  "timeout": 30000,
  "wait_for_selector": "a h3",
  "wait_until": "domcontentloaded"
}
```

Response:

```json
{
  "html": "...",
  "status": 200,
  "url": "https://example.com"
}
```

## Run

```bash
docker build -t camoufox-scraper .
docker run --rm -p 8080:8080 camoufox-scraper
```

## Intended usage

- Internal cluster service (e.g. `camoufox-svc.searxng:8080`)
- Called by search/crawl workers through `POST /scrape`
- Return rendered HTML, then parse results in your app/engine

## Environment

- `PORT` (default `8080`)
- `CAMOUFOX_HEADLESS` (default `virtual`)
