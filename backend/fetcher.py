import feedparser
import httpx
import ssl
import time
import logging
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from typing import List, Dict

# Use macOS system keychain (truststore) when available,
# fall back to certifi so it works on any OS.
try:
    import truststore
    truststore.inject_into_ssl()
    _SSL_VERIFY = True
except ImportError:
    import certifi
    _SSL_VERIFY = certifi.where()

from db import (
    upsert_article,
    get_sources_list,
    update_source_fetched,
    get_unnotified,
    mark_notified,
)

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}

MAX_ENTRIES_PER_FEED = 20
REQUEST_DELAY = 0.5  # seconds between requests


# ── Helpers ───────────────────────────────────────────────

def parse_date(entry) -> datetime:
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        val = getattr(entry, attr, None)
        if val:
            try:
                return datetime(*val[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return datetime.now(timezone.utc)


def clean_html(text: str, max_len: int = 500) -> str:
    if not text:
        return ""
    text = str(text)
    # Only parse as HTML if it contains HTML tags, otherwise return as-is
    if "<" in text and ">" in text:
        try:
            return BeautifulSoup(text, "html.parser").get_text(separator=" ").strip()[:max_len]
        except Exception:
            pass
    return text.strip()[:max_len]


# ── RSS Fetcher ───────────────────────────────────────────

def fetch_rss(source: Dict) -> List[Dict]:
    new_articles = []
    try:
        # Use httpx to download with proper timeout + redirect handling,
        # then pass raw content to feedparser to avoid its built-in HTTP issues.
        resp = httpx.get(source["url"], headers=HEADERS, timeout=20,
                         follow_redirects=True, verify=_SSL_VERIFY)
        resp.raise_for_status()
        feed = feedparser.parse(resp.content)

        if feed.bozo and not feed.entries:
            raise ValueError(f"Feed parse error: {feed.bozo_exception}")

        for entry in feed.entries[:MAX_ENTRIES_PER_FEED]:
            title = (entry.get("title") or "Untitled").strip()
            url = (entry.get("link") or "").strip()
            if not url or not title:
                continue

            summary_raw = entry.get("summary") or entry.get("description") or ""
            summary = clean_html(summary_raw)
            published_at = parse_date(entry)

            is_new = upsert_article(
                title=title,
                url=url,
                summary=summary,
                source_name=source["name"],
                topic=source["topic"],
                published_at=published_at,
            )
            if is_new:
                new_articles.append({
                    "id": None,
                    "title": title,
                    "url": url,
                    "source_name": source["name"],
                    "topic": source["topic"],
                    "published_at": published_at.isoformat(),
                })

    except Exception as e:
        logger.warning(f"[RSS] {source['name']}: {e}")
        raise

    return new_articles


# ── Scrapers ──────────────────────────────────────────────

def scrape_page(url: str, selectors: List[str], base_url: str = "") -> List[Dict]:
    items = []
    try:
        r = httpx.get(url, headers=HEADERS, timeout=15, follow_redirects=True, verify=_SSL_VERIFY)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        for sel in selectors:
            for tag in soup.select(sel)[:MAX_ENTRIES_PER_FEED]:
                link = tag if tag.name == "a" else tag.find("a")
                if not link:
                    continue
                href = (link.get("href") or "").strip()
                if not href:
                    continue
                if not href.startswith("http"):
                    href = base_url.rstrip("/") + "/" + href.lstrip("/")
                title = link.get_text(strip=True)
                if title and href:
                    items.append({"title": title, "url": href})
            if items:
                break
    except Exception as e:
        logger.warning(f"[Scrape] {url}: {e}")
        raise
    return items


SCRAPE_CONFIG = {
    "Zomato Tech": {
        "url": "https://www.zomato.com/blog/tech",
        "selectors": ["h2 a", ".post-title a", "article h2 a"],
        "base_url": "https://www.zomato.com",
    },
    "LinkedIn Engineering": {
        "url": "https://engineering.linkedin.com/blog",
        "selectors": [".blog-list-item a", "article a.title", "h2 a", ".entry-title a"],
        "base_url": "https://engineering.linkedin.com",
    },
    "Quora Engineering": {
        "url": "https://quoraengineering.quora.com",
        "selectors": ["a.qu-color--gray_dark", ".story_title a", "h3 a"],
        "base_url": "",
    },
}


def fetch_scrape(source: Dict) -> List[Dict]:
    config = SCRAPE_CONFIG.get(source["name"])
    if not config:
        logger.warning(f"[Scrape] No config for '{source['name']}' — skipping")
        return []

    raw_items = scrape_page(config["url"], config["selectors"], config.get("base_url", ""))
    new_articles = []
    for item in raw_items:
        is_new = upsert_article(
            title=item["title"],
            url=item["url"],
            summary="",
            source_name=source["name"],
            topic=source["topic"],
            published_at=datetime.now(timezone.utc),
        )
        if is_new:
            new_articles.append({**item, "source_name": source["name"], "topic": source["topic"]})
    return new_articles


# ── Main fetch loop ───────────────────────────────────────

def fetch_all_sources(notify: bool = True) -> int:
    from notifier import send_notification  # avoid circular at import time

    sources = get_sources_list()
    active = [s for s in sources if s["active"]]
    total_new = 0

    logger.info(f"Starting fetch for {len(active)} active sources...")

    for source in active:
        try:
            if source["type"] == "rss":
                new_articles = fetch_rss(source)
            elif source["type"] == "scrape":
                new_articles = fetch_scrape(source)
            else:
                new_articles = []

            update_source_fetched(source["id"])
            if new_articles:
                logger.info(f"  [{source['name']}] +{len(new_articles)} new")
                total_new += len(new_articles)

        except Exception:
            update_source_fetched(source["id"], error=True)

        time.sleep(REQUEST_DELAY)

    # Send Telegram notifications for all new unnotified articles
    unnotified = get_unnotified()
    if unnotified:
        if notify:
            logger.info(f"Sending {len(unnotified)} Telegram notification(s)...")
            for article in unnotified:
                try:
                    send_notification(article)
                    mark_notified(article["id"])
                except Exception as e:
                    logger.error(f"Notification failed for article {article['id']}: {e}")
        else:
            # Startup seed: mark all existing articles as notified without sending
            logger.info(f"Seeding {len(unnotified)} existing articles as notified (no Telegram)...")
            for article in unnotified:
                mark_notified(article["id"])

    logger.info(f"Fetch complete. {total_new} new articles total.")
    return total_new
