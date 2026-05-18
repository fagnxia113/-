# -*- coding: utf-8 -*-
import logging
from typing import Any, Dict, Optional
import time

from .registry import ToolDefinition, ToolParameter

logger = logging.getLogger(__name__)

class PlaywrightBrowserSession:
    """Singleton-like manager for a persistent Playwright browser session."""
    _instance = None
    
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
        
    def start(self):
        if self.playwright is None:
            try:
                from playwright.sync_api import sync_playwright
                self.playwright = sync_playwright().start()
                self.browser = self.playwright.chromium.launch(headless=True)
                self.context = self.browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
                self.page = self.context.new_page()
                logger.info("Playwright browser session started.")
            except ImportError:
                logger.error("Playwright not installed. run: pip install playwright && playwright install")
                raise
            except Exception as e:
                logger.error(f"Failed to start Playwright: {e}")
                raise

    def close(self):
        if self.page:
            self.page.close()
        if self.context:
            self.context.close()
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()
            
        self.page = None
        self.context = None
        self.browser = None
        self.playwright = None

def _ensure_browser():
    session = PlaywrightBrowserSession.get_instance()
    if session.page is None:
        session.start()
    return session.page

def _handle_browser_navigate(url: str, wait_for_timeout: int = 2000) -> Dict[str, Any]:
    """Navigate to a URL and return the page title and basic status."""
    try:
        page = _ensure_browser()
        response = page.goto(url, wait_until="domcontentloaded", timeout=30000)
        # Wait a bit for JS to render
        page.wait_for_timeout(wait_for_timeout)
        
        return {
            "success": True,
            "url": page.url,
            "title": page.title(),
            "status": response.status if response else "unknown"
        }
    except Exception as e:
        logger.warning(f"Browser navigate failed: {e}")
        return {"success": False, "error": str(e), "url": url}

def _handle_browser_read() -> Dict[str, Any]:
    """Read and extract text content from the current page."""
    try:
        page = _ensure_browser()
        html = page.content()
        
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        
        # Remove noisy elements
        for script in soup(["script", "style", "nav", "footer", "header", "aside", "form", "iframe", "noscript"]):
            script.decompose()
            
        text = soup.get_text(separator="\n", strip=True)
        # Clean up excessive newlines
        import re
        text = re.sub(r'\n{3,}', '\n\n', text)
        
        # Truncate if too long to avoid LLM context overflow
        if len(text) > 15000:
            text = text[:15000] + "... [TRUNCATED]"
            
        return {
            "success": True,
            "url": page.url,
            "title": page.title(),
            "content": text,
            "length": len(text)
        }
    except Exception as e:
        logger.warning(f"Browser read failed: {e}")
        return {"success": False, "error": str(e)}

def _handle_browser_click(selector: str) -> Dict[str, Any]:
    """Click an element on the current page."""
    try:
        page = _ensure_browser()
        page.click(selector, timeout=5000)
        page.wait_for_timeout(1000)
        return {
            "success": True,
            "message": f"Clicked {selector}",
            "current_url": page.url
        }
    except Exception as e:
        logger.warning(f"Browser click failed: {e}")
        return {"success": False, "error": str(e)}

browser_navigate_tool = ToolDefinition(
    name="browser_navigate",
    description="Navigate a real web browser to a URL. Use this to open a page before reading it.",
    parameters=[
        ToolParameter(name="url", type="string", description="The URL to navigate to."),
        ToolParameter(name="wait_for_timeout", type="integer", description="Milliseconds to wait for JS to render after load (default 2000)", required=False)
    ],
    handler=_handle_browser_navigate,
    category="research"
)

browser_read_tool = ToolDefinition(
    name="browser_read",
    description="Extract readable text content from the CURRENT browser page. Must navigate first.",
    parameters=[],
    handler=_handle_browser_read,
    category="research"
)

browser_click_tool = ToolDefinition(
    name="browser_click",
    description="Click an element on the CURRENT browser page using a CSS selector (e.g. 'button.read-more').",
    parameters=[
        ToolParameter(name="selector", type="string", description="CSS selector for the element to click.")
    ],
    handler=_handle_browser_click,
    category="research"
)

def register_playwright_tools(tool_registry):
    tool_registry.register(browser_navigate_tool)
    tool_registry.register(browser_read_tool)
    tool_registry.register(browser_click_tool)
