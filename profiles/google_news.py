"""Google News extraction profile.

Extracts structured results from rendered Google News HTML.  Handles:
- Result extraction via ``./read/`` link anchors (current Google News layout)
- Base64-encoded URL decoding for ``/read/`` and ``/articles/`` redirects
- Source and publication time metadata
- CAPTCHA detection
"""

import base64
import logging

from lxml import html as lxml_html

logger = logging.getLogger(__name__)

CAPTCHA_PATTERNS = ["/sorry", "consent.google", "recaptcha"]
WAIT_FOR_SELECTOR = None
WAIT_AFTER_LOAD = 3


def extract(page_html: str, page_url: str, **kwargs) -> dict:
    """Extract news results from rendered Google News HTML."""
    results = []
    suggestions = []

    dom = lxml_html.fromstring(page_html)

    # Google News no longer uses <article> tags.  Results are anchors with
    # href starting with "./read/" inside <c-wiz> components.  Each result
    # link has meaningful text (the headline).
    seen_urls = set()

    for link_node in dom.xpath('//a[starts-with(@href, "./read/")]'):
        try:
            href = link_node.get("href", "")
            title = _text(link_node)

            if not title or len(title) < 10:
                continue

            # Build absolute URL
            link = "https://news.google.com" + href[1:]  # strip leading "."

            # Try to decode the base64-encoded actual URL
            decoded_link = _decode_google_news_url(link)

            # Deduplicate by decoded URL
            if decoded_link in seen_urls:
                continue
            seen_urls.add(decoded_link)

            # Walk up to find source/time metadata near this link
            source = ""
            pub_time = ""
            container = link_node
            for _ in range(5):
                container = container.getparent()
                if container is None:
                    break
                # Source is often in a data-n-tid div
                source = source or _text_from_xpath(container, './/div[@data-n-tid]')
                # Time element
                pub_time = pub_time or _text_from_xpath(container, ".//time")
                if source and pub_time:
                    break

            content = " / ".join(x for x in [source, pub_time] if x)

            # Thumbnail — look for nearby img
            thumbnail = None
            parent = link_node.getparent()
            if parent is not None:
                for _ in range(3):
                    thumb_nodes = parent.xpath(".//img/@src")
                    if thumb_nodes:
                        thumb = str(thumb_nodes[0])
                        if thumb.startswith("http"):
                            thumbnail = thumb
                            break
                    parent = parent.getparent()
                    if parent is None:
                        break

            results.append({
                "url": decoded_link,
                "title": title,
                "content": content,
                "thumbnail": thumbnail,
            })

        except Exception as e:
            logger.debug("Error parsing Google News result: %s", e)
            continue

    return {"results": results, "suggestions": suggestions}


def _decode_google_news_url(link: str) -> str:
    """Decode base64-encoded article URL from Google News redirect.

    Google News encodes the real article URL in the path using base64.
    Works for both ``/read/`` and ``/articles/`` URL patterns.
    """
    try:
        # Extract the base64 part from either /read/ or /articles/ pattern
        for prefix in ("/read/", "/articles/"):
            if prefix in link:
                path_part = link.split(prefix)[-1].split("?")[0]
                break
        else:
            return link

        decoded = base64.urlsafe_b64decode(path_part + "====")
        # The actual URL starts with 'http' inside the decoded bytes
        start = decoded.index(b"http")
        actual_url = decoded[start:].split(b"\xd2")[0].decode()
        return actual_url
    except Exception:
        return link  # Keep the Google News link if decoding fails


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
