"""Google News extraction profile.

Extracts structured results from rendered Google News HTML.  Handles:
- Article element extraction
- Base64-encoded URL decoding for ``/articles/`` redirects
- Source and publication time metadata
- CAPTCHA detection
"""

import base64
import logging

from lxml import html as lxml_html

logger = logging.getLogger(__name__)

CAPTCHA_PATTERNS = ["sorry.google", "consent.google"]
WAIT_FOR_SELECTOR = None
WAIT_AFTER_LOAD = 3


def extract(page_html: str, page_url: str, **kwargs) -> dict:
    """Extract news results from rendered Google News HTML."""
    results = []
    suggestions = []

    dom = lxml_html.fromstring(page_html)

    # Google News wraps each result in an <article> element
    for article in dom.xpath("//article"):
        try:
            # Extract the link
            link_nodes = article.xpath(".//a/@href")
            if not link_nodes:
                continue
            link = str(link_nodes[0])

            # Google News uses relative links like ./articles/...
            if link.startswith("./"):
                link = "https://news.google.com" + link[1:]

            # Decode Google's base64-encoded article redirect
            if "/articles/" in link:
                link = _decode_google_news_url(link)

            # Extract title — try several patterns as Google changes layout
            title = _first_text(article, [".//a[1]", ".//h3", ".//h4"])
            if not title:
                continue

            # Extract source and time metadata
            source = _text_from_xpath(article, './/div[@data-n-tid]')
            pub_time = _text_from_xpath(article, ".//time")

            content = " / ".join(x for x in [source, pub_time] if x)

            # Extract thumbnail
            thumb_nodes = article.xpath(".//img/@src")
            thumbnail = str(thumb_nodes[0]) if thumb_nodes else None

            results.append({
                "url": link,
                "title": title,
                "content": content,
                "thumbnail": thumbnail,
            })

        except Exception as e:
            logger.debug("Error parsing Google News result: %s", e)
            continue

    return {"results": results, "suggestions": suggestions}


def _decode_google_news_url(link: str) -> str:
    """Decode base64-encoded article URL from Google News redirect."""
    try:
        path_part = link.split("/articles/")[-1].split("?")[0]
        decoded = base64.urlsafe_b64decode(path_part + "====")
        # The actual URL starts with 'http' inside the decoded bytes
        start = decoded.index(b"http")
        actual_url = decoded[start:].split(b"\xd2")[0].decode()
        return actual_url
    except Exception:
        return link  # Keep the Google News link if decoding fails


def _first_text(node, xpaths: list) -> str:
    """Return text from the first XPath that matches."""
    for xpath in xpaths:
        found = node.xpath(xpath)
        if found:
            text = _text(found[0])
            if text:
                return text
    return ""


def _text_from_xpath(node, xpath: str) -> str:
    """Extract text from an XPath match."""
    found = node.xpath(xpath)
    if found:
        return _text(found[0])
    return ""


def _text(node) -> str:
    """Extract text content from an lxml node."""
    if node is None:
        return ""
    if hasattr(node, "text_content"):
        return node.text_content().strip()
    return str(node).strip()
