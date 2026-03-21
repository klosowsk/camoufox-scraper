"""Google Web Search extraction profile.

Extracts structured results from rendered Google search HTML.  Handles:
- Robust result extraction via ``a[h3]`` anchor pattern
- URL de-tracking (strips Google redirect wrappers)
- Script tag removal before content extraction
- Suggestion parsing
- CAPTCHA detection (sorry.google.com, consent.google.com)
"""

import logging
import re

from lxml import html as lxml_html

logger = logging.getLogger(__name__)

CAPTCHA_PATTERNS = ["sorry.google", "consent.google"]
WAIT_FOR_SELECTOR = "a h3"
WAIT_AFTER_LOAD = 2

# Google sometimes wraps URLs in /url?q=<actual_url>&...
RE_GOOGLE_REDIRECT = re.compile(r"/url\?q=([^&]+)")

SUGGESTION_XPATH = '//div[contains(@class, "ouy7Mc")]//a'
SNIPPET_CLASSES = ("VwiC3b", "IsZvec", "s3v9rd")


def extract(page_html: str, page_url: str, **kwargs) -> dict:
    """Extract search results from rendered Google HTML."""
    results = []
    suggestions = []

    dom = lxml_html.fromstring(page_html)

    # Remove all script tags to avoid noise in text extraction
    for script in dom.xpath("//script"):
        parent = script.getparent()
        if parent is not None:
            parent.remove(script)

    # Google layouts change frequently; the most robust pattern is
    # finding <a> tags that contain an <h3> (the result title).
    seen_urls = set()

    for h3 in dom.xpath("//a[h3]/h3"):
        try:
            title = _text(h3)
            if not title:
                continue

            link_node = h3.getparent()
            if link_node is None:
                continue

            url = link_node.get("href", "")
            url = _clean_google_url(url)

            if not url or not url.startswith("http"):
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)

            # Walk up the DOM to find a snippet container near this result
            content = _find_snippet(link_node)

            results.append({
                "url": url,
                "title": title,
                "content": content,
            })

        except Exception as e:
            logger.debug("Error parsing Google result: %s", e)
            continue

    # Parse suggestions
    for node in dom.xpath(SUGGESTION_XPATH):
        text = _text(node)
        if text:
            suggestions.append(text)

    return {"results": results, "suggestions": suggestions}


def _clean_google_url(url: str) -> str:
    """Strip Google's /url?q= redirect wrapper if present."""
    match = RE_GOOGLE_REDIRECT.match(url)
    if match:
        from urllib.parse import unquote
        return unquote(match.group(1))
    return url


def _find_snippet(link_node) -> str:
    """Walk up the DOM from the link to find a nearby snippet div."""
    container = link_node
    for _ in range(4):
        container = container.getparent()
        if container is None:
            break
        for cls in SNIPPET_CLASSES:
            snippet_nodes = container.xpath(
                f'.//div[contains(@class, "{cls}")]'
            )
            if snippet_nodes:
                text = _text(snippet_nodes[0])
                if text:
                    return text
    return ""


def _text(node) -> str:
    """Extract text content from an lxml node."""
    if node is None:
        return ""
    if hasattr(node, "text_content"):
        return node.text_content().strip()
    return str(node).strip()
