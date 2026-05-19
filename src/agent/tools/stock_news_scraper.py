# -*- coding: utf-8 -*-
"""
Stock News Scraper — 直接抓取东方财富/新浪财经的个股新闻，更真实准确
"""
import logging
import re
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

import requests
from bs4 import BeautifulSoup

from .registry import ToolDefinition, ToolParameter

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def _clean_text(text: str) -> str:
    """Clean up whitespace from text."""
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _scrape_eastmoney_news(stock_code: str, stock_name: str) -> List[Dict[str, Any]]:
    """
    抓取东方财富个股新闻 - 使用更简单的策略
    """
    news = []
    try:
        # 东方财富个股新闻页 URL
        url = f"https://so.eastmoney.com/web/s?keyword={stock_code}"
        
        headers = {"User-Agent": USER_AGENT}
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            return news
        
        soup = BeautifulSoup(response.text, "html.parser")
        
        # 提取所有链接和文本
        all_texts = []
        for a_tag in soup.find_all("a", href=True):
            try:
                text = _clean_text(a_tag.get_text(strip=True))
                if len(text) > 10 and (stock_name in text or stock_code in text):
                    href = a_tag["href"]
                    full_url = href if href.startswith("http") else f"https://so.eastmoney.com{href}"
                    all_texts.append((text, full_url))
                    
                    news.append({
                        "title": text,
                        "snippet": "",
                        "url": full_url,
                        "source": "东方财富",
                        "published_date": ""
                    })
                    
                    if len(news) >= 5:
                        break
            except Exception:
                continue
                
    except Exception as e:
        logger.warning(f"Failed to scrape Eastmoney news: {e}")
        
    return news


def _scrape_sina_news(stock_code: str, stock_name: str) -> List[Dict[str, Any]]:
    """
    抓取新浪财经个股新闻
    """
    news = []
    try:
        url = f"https://search.sina.com.cn/?q={stock_name}&c=news&from=channel&ie=utf-8"
        headers = {"User-Agent": USER_AGENT}
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "html.parser")
        
        for item in soup.select("div.result, .box-result, li.result"):
            try:
                title_elem = item.select_one("h2 a, a.title")
                if not title_elem:
                    continue
                
                title = _clean_text(title_elem.get_text(strip=True))
                if not title:
                    continue
                
                url = title_elem.get("href", "")
                
                summary_elem = item.select_one("p, .content")
                summary = _clean_text(summary_elem.get_text(strip=True)) if summary_elem else ""
                
                date_elem = item.select_one(".time, .fgray, span.fgray")
                date_str = _clean_text(date_elem.get_text(strip=True)) if date_elem else ""
                
                news.append({
                    "title": title,
                    "snippet": summary,
                    "url": url,
                    "source": "新浪财经",
                    "published_date": date_str
                })
                
                if len(news) >= 8:
                    break
                    
            except Exception as e:
                logger.debug(f"Failed to parse Sina news item: {e}")
                continue
                
    except Exception as e:
        logger.warning(f"Failed to scrape Sina news: {e}")
        
    return news


def _scrape_tonghuashun_news(stock_code: str, stock_name: str) -> List[Dict[str, Any]]:
    """
    抓取同花顺财经新闻
    """
    news = []
    try:
        url = f"https://search.10jqka.com.cn/search?w={stock_code}"
        headers = {"User-Agent": USER_AGENT}
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "html.parser")
        
        for item in soup.select(".search-result-item, .result-list li"):
            try:
                title_elem = item.select_one("h3 a, a.title")
                if not title_elem:
                    continue
                
                title = _clean_text(title_elem.get_text(strip=True))
                if not title:
                    continue
                
                url = title_elem.get("href", "")
                
                summary_elem = item.select_one(".desc, .abstract")
                summary = _clean_text(summary_elem.get_text(strip=True)) if summary_elem else ""
                
                date_elem = item.select_one(".time, .date")
                date_str = _clean_text(date_elem.get_text(strip=True)) if date_elem else ""
                
                news.append({
                    "title": title,
                    "snippet": summary,
                    "url": url if url.startswith("http") else f"https://search.10jqka.com.cn{url}" if url else "",
                    "source": "同花顺",
                    "published_date": date_str
                })
                
                if len(news) >= 8:
                    break
                    
            except Exception as e:
                logger.debug(f"Failed to parse Tonghuashun news item: {e}")
                continue
                
    except Exception as e:
        logger.warning(f"Failed to scrape Tonghuashun news: {e}")
        
    return news


def _handle_scrape_stock_news(stock_code: str, stock_name: str) -> Dict[str, Any]:
    """
    直接从东方财富/新浪财经/同花顺抓取个股新闻，不依赖搜索 API
    """
    all_news = []
    sources = []
    
    # 尝试多个来源
    try:
        logger.info(f"Scraping Eastmoney news for {stock_code} ({stock_name})")
        em_news = _scrape_eastmoney_news(stock_code, stock_name)
        if em_news:
            all_news.extend(em_news)
            sources.append("东方财富")
            
    except Exception as e:
        logger.warning(f"Eastmoney scrape failed: {e}")
        
    try:
        logger.info(f"Scraping Sina news for {stock_code} ({stock_name})")
        sina_news = _scrape_sina_news(stock_code, stock_name)
        if sina_news:
            all_news.extend(sina_news)
            sources.append("新浪财经")
            
    except Exception as e:
        logger.warning(f"Sina scrape failed: {e}")
        
    try:
        logger.info(f"Scraping Tonghuashun news for {stock_code} ({stock_name})")
        ths_news = _scrape_tonghuashun_news(stock_code, stock_name)
        if ths_news:
            all_news.extend(ths_news)
            sources.append("同花顺")
            
    except Exception as e:
        logger.warning(f"Tonghuashun scrape failed: {e}")
        
    # 去重（基于标题）
    seen_titles = set()
    unique_news = []
    for n in all_news:
        title_key = n.get("title", "").strip()
        if title_key and title_key not in seen_titles:
            seen_titles.add(title_key)
            unique_news.append(n)
            
    return {
        "query": f"{stock_code} {stock_name}",
        "provider": f"直接抓取 ({', '.join(sources)})" if sources else "直接抓取",
        "success": len(unique_news) > 0,
        "results_count": len(unique_news),
        "results": unique_news[:10]
    }


scrape_stock_news_tool = ToolDefinition(
    name="scrape_stock_news",
    description="直接从东方财富/新浪财经/同花顺抓取个股新闻。真实可靠，不需要搜索 API Key。",
    parameters=[
        ToolParameter(name="stock_code", type="string", description="股票代码，例如 '600519'"),
        ToolParameter(name="stock_name", type="string", description="股票名称，例如 '贵州茅台'")
    ],
    handler=_handle_scrape_stock_news,
    category="research"
)


ALL_SCRAPER_TOOLS = [scrape_stock_news_tool]
