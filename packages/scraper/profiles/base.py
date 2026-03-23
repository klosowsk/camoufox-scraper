"""Generic XPath-based extraction profile.

Used when no vendor-specific profile is set.  Takes XPath selectors from the
request payload and extracts results from rendered HTML.
"""

from lxml import html as lxml_html

CAPTCHA_PATTERNS: list[str] = []
WAIT_FOR_SELECTOR = None
WAIT_AFTER_LOAD = 2


def extract(page_html: str, page_url: str, **kwargs) -> dict:
    """Extract results using XPath selectors passed in kwargs.

    Expected kwargs (from the request payload's ``extract`` dict):
        results_xpath, url_xpath, title_xpath, content_xpath,
        thumbnail_xpath (optional), suggestion_xpath (optional)
    """
    results = []
    suggestions = []

    results_xpath = kwargs.get("results_xpath", "")
    url_xpath = kwargs.get("url_xpath", "")
    title_xpath = kwargs.get("title_xpath", "")
    content_xpath = kwargs.get("content_xpath", "")
    thumbnail_xpath = kwargs.get("thumbnail_xpath", "")
    suggestion_xpath = kwargs.get("suggestion_xpath", "")

    if not results_xpath or not url_xpath or not title_xpath:
        return {"results": results, "suggestions": suggestions}

    dom = lxml_html.fromstring(page_html)

    for result in dom.xpath(results_xpath):
        try:
            url_nodes = result.xpath(url_xpath)
            url = url_nodes[0] if url_nodes else ""
            if hasattr(url, "text_content"):
                url = url.text_content()
            url = str(url).strip()

            title_nodes = result.xpath(title_xpath)
            title = _extract_text(title_nodes)

            content_nodes = result.xpath(content_xpath)
            content = _extract_text(content_nodes)

            if not url or not title:
                continue

            item = {"url": url, "title": title, "content": content}

            if thumbnail_xpath:
                thumb_nodes = result.xpath(thumbnail_xpath)
                if thumb_nodes:
                    thumb = str(thumb_nodes[0]).strip()
                    if thumb:
                        item["thumbnail"] = thumb

            results.append(item)
        except Exception:
            continue

    if suggestion_xpath:
        for node in dom.xpath(suggestion_xpath):
            text = _extract_text([node])
            if text:
                suggestions.append(text)

    return {"results": results, "suggestions": suggestions}


def _extract_text(nodes) -> str:
    """Extract text content from lxml nodes."""
    parts = []
    for node in nodes:
        if hasattr(node, "text_content"):
            parts.append(node.text_content())
        else:
            parts.append(str(node))
    return " ".join(parts).strip()
