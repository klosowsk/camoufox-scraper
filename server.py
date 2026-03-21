"""
Camoufox Scraper HTTP Service

A lightweight HTTP service that renders web pages using Camoufox (anti-detect browser)
and returns either raw HTML or structured extracted results.

Endpoints:

POST /scrape
  Body: {"url": "https://...", "wait_after_load": 2, "timeout": 15000}
  Returns: {"html": "...", "status": 200, "url": "..."}

POST /extract
  Body: {"url": "https://...", "profile": "google_web", "timeout": 30000}
  Returns: {"results": [...], "suggestions": [...], "captcha": false, "error": null}

GET /health
  Returns: {"status": "ok"}
"""

import asyncio
import json
import logging
import os
import sys

from aiohttp import web

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("camoufox-scraper")

# Global browser instance (reused across requests)
_browser = None
_browser_lock = asyncio.Lock()


async def get_browser():
    """Get or create a shared Camoufox browser instance."""
    global _browser

    async with _browser_lock:
        if _browser is None or not _browser.is_connected():
            logger.info("Launching Camoufox browser...")
            from camoufox.async_api import AsyncCamoufox

            # Use virtual display (Xvfb) for headless operation
            headless_mode = os.environ.get("CAMOUFOX_HEADLESS", "virtual")
            if headless_mode == "true":
                headless_mode = True

            ctx_manager = AsyncCamoufox(
                headless=headless_mode,
                block_images=False,
                block_webrtc=True,
                block_webgl=False,
                os="windows",
                locale="en-US",
            )
            _browser = await ctx_manager.__aenter__()
            # Store the context manager so we can clean up later
            _browser._ctx_manager = ctx_manager
            logger.info("Camoufox browser launched successfully")

        return _browser


async def render_page(url, wait_after_load=2, timeout=15000, headers=None,
                      wait_for_selector=None, wait_until="domcontentloaded"):
    """Render a page in the browser and return (html, status_code, final_url).

    This is the shared rendering logic used by both /scrape and /extract.
    """
    browser = await get_browser()
    page = await browser.new_page()

    try:
        if headers:
            await page.set_extra_http_headers(headers)

        response = await page.goto(url, wait_until=wait_until, timeout=timeout)

        if wait_for_selector:
            try:
                await page.wait_for_selector(
                    wait_for_selector,
                    timeout=min(timeout, 10000),
                )
            except Exception:
                logger.warning("Selector %s not found, continuing...", wait_for_selector)

        if wait_after_load > 0:
            await page.wait_for_timeout(int(wait_after_load * 1000))

        page_html = await page.content()
        status_code = response.status if response else 0
        final_url = page.url

        return page_html, status_code, final_url

    finally:
        await page.close()


async def handle_scrape(request: web.Request) -> web.Response:
    """Handle a scrape request. Renders a URL and returns the raw HTML."""
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    url = body.get("url")
    if not url:
        return web.json_response({"error": "Missing 'url' field"}, status=400)

    logger.info("Scraping: %s", url)

    try:
        page_html, status_code, final_url = await render_page(
            url=url,
            wait_after_load=body.get("wait_after_load", 2),
            timeout=body.get("timeout", 15000),
            headers=body.get("headers"),
            wait_for_selector=body.get("wait_for_selector"),
            wait_until=body.get("wait_until", "domcontentloaded"),
        )

        logger.info("Scraped %s -> %d (%d bytes)", url, status_code, len(page_html))

        return web.json_response({
            "html": page_html,
            "status": status_code,
            "url": final_url,
        })

    except Exception as e:
        logger.error("Error scraping %s: %s", url, e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_extract(request: web.Request) -> web.Response:
    """Handle an extract request.

    Renders a URL, then extracts structured results using a profile or
    XPath selectors.  Returns a JSON response with results, suggestions,
    and CAPTCHA status.
    """
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    url = body.get("url")
    if not url:
        return web.json_response({"error": "Missing 'url' field"}, status=400)

    profile_name = body.get("profile")
    timeout = body.get("timeout", 15000)

    logger.info("Extracting: %s (profile=%s)", url, profile_name or "none")

    # Load the profile (or fall back to base for generic XPath extraction)
    from profiles import load_profile

    profile = None
    if profile_name:
        profile = load_profile(profile_name)
        if profile is None:
            return web.json_response(
                {"error": f"Unknown profile: {profile_name}"}, status=400
            )

    # Determine rendering options from the profile or defaults
    wait_for_selector = getattr(profile, "WAIT_FOR_SELECTOR", None) if profile else None
    wait_after_load = getattr(profile, "WAIT_AFTER_LOAD", 2) if profile else body.get("wait_after_load", 2)
    headers = body.get("headers")

    try:
        page_html, status_code, final_url = await render_page(
            url=url,
            wait_after_load=wait_after_load,
            timeout=timeout,
            headers=headers,
            wait_for_selector=wait_for_selector,
        )
    except Exception as e:
        logger.error("Error rendering %s: %s", url, e)
        return web.json_response({
            "results": [],
            "suggestions": [],
            "captcha": False,
            "error": str(e),
        })

    logger.info("Rendered %s -> %d (%d bytes)", url, status_code, len(page_html))

    # Check for CAPTCHA patterns in the final URL
    captcha_patterns = getattr(profile, "CAPTCHA_PATTERNS", []) if profile else []
    is_captcha = any(pattern in final_url.lower() for pattern in captcha_patterns)

    if is_captcha:
        logger.warning("CAPTCHA detected at %s", final_url)
        return web.json_response({
            "results": [],
            "suggestions": [],
            "captcha": True,
            "error": None,
        })

    # Extract results
    try:
        if profile and hasattr(profile, "extract"):
            data = profile.extract(page_html, final_url)
        elif body.get("extract"):
            # Generic XPath extraction from request payload
            base_profile = load_profile("base")
            data = base_profile.extract(page_html, final_url, **body["extract"])
        else:
            # No profile and no XPath config — return raw HTML
            return web.json_response({
                "html": page_html,
                "url": final_url,
                "captcha": False,
                "error": None,
            })
    except Exception as e:
        logger.error("Error extracting results from %s: %s", url, e)
        return web.json_response({
            "results": [],
            "suggestions": [],
            "captcha": False,
            "error": f"Extraction failed: {e}",
        })

    result_count = len(data.get("results", []))
    logger.info("Extracted %d results from %s", result_count, url)

    return web.json_response({
        "results": data.get("results", []),
        "suggestions": data.get("suggestions", []),
        "captcha": False,
        "error": None,
    })


async def handle_health(request: web.Request) -> web.Response:
    """Health check endpoint."""
    return web.json_response({"status": "ok"})


async def on_shutdown(app: web.Application):
    """Clean up browser on shutdown."""
    global _browser
    if _browser and _browser.is_connected():
        logger.info("Shutting down Camoufox browser...")
        try:
            await _browser._ctx_manager.__aexit__(None, None, None)
        except Exception:
            pass
        _browser = None


def create_app() -> web.Application:
    """Create the aiohttp application."""
    app = web.Application()
    app.router.add_post("/scrape", handle_scrape)
    app.router.add_post("/extract", handle_extract)
    app.router.add_get("/health", handle_health)
    app.on_shutdown.append(on_shutdown)
    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app = create_app()
    logger.info("Starting Camoufox Scraper on port %d", port)
    web.run_app(app, host="0.0.0.0", port=port)
