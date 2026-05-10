from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict
from urllib.request import Request, urlopen
from urllib.error import URLError

from .registry import ToolDefinition, ToolParameter

logger = logging.getLogger(__name__)


def _handle_web_search(query: str, search_type: str = "general", max_results: int = 5) -> Dict[str, Any]:
    """Search the web for information."""
    import os

    tavily_key = os.getenv("TAVILY_API_KEY", "")
    serpapi_key = os.getenv("SERPAPI_KEY", "")

    if tavily_key:
        return _tavily_search(tavily_key, query, search_type, max_results)
    if serpapi_key:
        return _serpapi_search(serpapi_key, query, max_results)

    return {
        "results": [],
        "error": "No search API configured. Set TAVILY_API_KEY or SERPAPI_KEY environment variable.",
        "query": query,
    }


def _tavily_search(api_key: str, query: str, search_type: str, max_results: int) -> Dict[str, Any]:
    """Search using Tavily API."""
    try:
        data = json.dumps({
            "api_key": api_key,
            "query": query,
            "search_depth": "advanced" if search_type == "financial" else "basic",
            "max_results": max_results,
            "include_answer": True,
        }).encode()

        req = Request(
            "https://api.tavily.com/search",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        with urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode())

        answer = result.get("answer", "")
        results = []
        for r in result.get("results", [])[:max_results]:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", "")[:500],
            })

        return {"answer": answer, "results": results, "query": query, "source": "tavily"}
    except Exception as e:
        logger.warning("Tavily search failed: %s", e)
        return {"results": [], "error": str(e), "query": query}


def _serpapi_search(api_key: str, query: str, max_results: int) -> Dict[str, Any]:
    """Search using SerpAPI."""
    try:
        url = (
            f"https://serpapi.com/search.json?q={query}&api_key={api_key}"
            f"&num={max_results}&hl=zh-cn"
        )
        with urlopen(url, timeout=15) as resp:
            result = json.loads(resp.read().decode())

        results = []
        for r in result.get("organic_results", [])[:max_results]:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("link", ""),
                "snippet": r.get("snippet", "")[:500],
            })

        return {"results": results, "query": query, "source": "serpapi"}
    except Exception as e:
        logger.warning("SerpAPI search failed: %s", e)
        return {"results": [], "error": str(e), "query": query}


def _handle_web_scrape(url: str, extract_mode: str = "summary") -> Dict[str, Any]:
    """Scrape and extract text content from a URL."""
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; StockAnalysis/1.0)"})
        with urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

        from html.parser import HTMLParser

        class _TextExtractor(HTMLParser):
            SKIP_TAGS = {"script", "style", "nav", "footer", "header", "aside", "form"}

            def __init__(self):
                super().__init__()
                self.text_parts = []
                self._skip_depth = 0

            def handle_starttag(self, tag, attrs):
                if tag in self.SKIP_TAGS:
                    self._skip_depth += 1

            def handle_endtag(self, tag):
                if tag in self.SKIP_TAGS and self._skip_depth > 0:
                    self._skip_depth -= 1

            def handle_data(self, data):
                if self._skip_depth == 0:
                    stripped = data.strip()
                    if stripped:
                        self.text_parts.append(stripped)

        extractor = _TextExtractor()
        extractor.feed(html)
        full_text = " ".join(extractor.text_parts)

        if extract_mode == "full_text":
            content = full_text[:8000]
        else:
            sentences = re.split(r'[。！？.!?\n]', full_text)
            content = " ".join(s for s in sentences[:20] if len(s.strip()) > 5)[:3000]

        return {
            "url": url,
            "content": content,
            "length": len(full_text),
            "mode": extract_mode,
        }
    except Exception as e:
        logger.warning("Web scrape failed for %s: %s", url, e)
        return {"url": url, "error": str(e), "content": ""}


web_search_tool = ToolDefinition(
    name="web_search",
    description=(
        "Search the web for stock-related news, financial reports, market analysis, "
        "and other real-time information. Supports general, news, and financial search types."
    ),
    parameters=[
        ToolParameter(name="query", type="string", description="Search query string"),
        ToolParameter(name="search_type", type="string", description="Type of search", required=False, enum=["general", "news", "financial"]),
        ToolParameter(name="max_results", type="integer", description="Maximum number of results to return", required=False),
    ],
    handler=_handle_web_search,
    category="research",
)

web_scrape_tool = ToolDefinition(
    name="web_scrape",
    description=(
        "Scrape and extract text content from a web page URL. "
        "Useful for reading full articles, financial reports, or news pages found via web_search."
    ),
    parameters=[
        ToolParameter(name="url", type="string", description="The URL to scrape"),
        ToolParameter(name="extract_mode", type="string", description="Extraction mode: 'summary' (first 20 sentences) or 'full_text'", required=False, enum=["summary", "full_text"]),
    ],
    handler=_handle_web_scrape,
    category="research",
)


def register_web_tools(tool_registry):
    """Register web search and scrape tools with a ToolRegistry."""
    tool_registry.register(web_search_tool)
    tool_registry.register(web_scrape_tool)
