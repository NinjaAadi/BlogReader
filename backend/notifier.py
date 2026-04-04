import os
import logging
import requests
from datetime import datetime
from typing import Dict, Tuple

logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
CHAT_ID   = os.getenv("CHAT_ID", "")
# Comma-separated topics to notify about. Empty = notify for all.
_NOTIFY_TOPICS_RAW = os.getenv("NOTIFY_TOPICS", "")
NOTIFY_TOPICS = {t.strip() for t in _NOTIFY_TOPICS_RAW.split(",") if t.strip()} if _NOTIFY_TOPICS_RAW else set()

TOPIC_EMOJI: Dict[str, str] = {
    "AI/ML":              "🤖",
    "AI News":            "📰",
    "AI Research":        "🔬",
    "Big Tech":           "🏢",
    "Streaming":          "🎬",
    "Ride-share":         "🚗",
    "Social":             "💬",
    "E-commerce":         "🛒",
    "Dev Tools":          "🔧",
    "Cloud":              "☁️",
    "Databases":          "🗄️",
    "Data Engineering":   "📊",
    "Observability":      "📡",
    "Security":           "🔒",
    "Fintech":            "💰",
    "Startup Engineering":"🚀",
    "Gaming":             "🎮",
    "Thought Leadership": "💡",
}


def _escape_md(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2."""
    if not text:
        return ""
    special = r"_*[]()~`>#+-=|{}.!"
    return "".join(f"\\{c}" if c in special else c for c in str(text))


def _format_date(pub) -> str:
    if not pub:
        return "Today"
    try:
        dt = datetime.fromisoformat(str(pub).replace("Z", "+00:00"))
        return dt.strftime("%b %d, %Y")
    except Exception:
        return str(pub)[:10]


def send_notification(article: Dict) -> None:
    if not BOT_TOKEN or not CHAT_ID:
        logger.debug("Telegram not configured — skipping notification.")
        return
    # Topic filter: skip if NOTIFY_TOPICS is set and this topic isn't in it
    if NOTIFY_TOPICS and article.get("topic") not in NOTIFY_TOPICS:
        logger.debug(f"Skipping notification for topic '{article.get('topic')}' (not in NOTIFY_TOPICS)")
        return

    emoji = TOPIC_EMOJI.get(article.get("topic", ""), "📝")
    title_escaped = _escape_md(article.get("title", "No Title"))
    source_escaped = _escape_md(article.get("source_name", "Unknown"))
    topic_escaped = _escape_md(article.get("topic", "General"))
    pub_date = _format_date(article.get("published_at"))
    url = article.get("url", "")

    message = (
        f"{emoji} *{source_escaped}*\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"{title_escaped}\n\n"
        f"🏷 Topic: {topic_escaped}\n"
        f"📅 {_escape_md(pub_date)}\n\n"
        f"[🔗 Read Article]({url})"
    )

    api_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": message,
        "parse_mode": "MarkdownV2",
        "disable_web_page_preview": False,
        "disable_notification": False,
    }

    resp = requests.post(api_url, json=payload, timeout=10)
    if not resp.ok:
        logger.error(f"Telegram send failed ({resp.status_code}): {resp.text[:200]}")
        resp.raise_for_status()


def send_daily_digest(articles: list) -> Tuple[bool, str]:
    """Send a daily digest of top unread articles to Telegram."""
    if not BOT_TOKEN or not CHAT_ID:
        return False, "Telegram not configured (BOT_TOKEN / CHAT_ID missing)"
    if not articles:
        return True, "No unread articles to send"

    lines = ["📬 *Daily Digest* — Top Unread Articles\n"]
    for i, a in enumerate(articles[:10], 1):
        emoji = TOPIC_EMOJI.get(a.get("topic", ""), "📝")
        title = _escape_md(a.get("title", "No Title"))
        source = _escape_md(a.get("source_name", ""))
        url = a.get("url", "")
        lines.append(f"{i}\\. {emoji} [{title}]({url})\n   _{source}_\n")

    message = "\n".join(lines)
    api_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    try:
        resp = requests.post(api_url, json={
            "chat_id": CHAT_ID,
            "text": message,
            "parse_mode": "MarkdownV2",
            "disable_web_page_preview": True,
        }, timeout=15)
        if resp.ok:
            return True, f"Digest sent with {len(articles)} articles"
        return False, f"Telegram error {resp.status_code}: {resp.text[:200]}"
    except Exception as e:
        return False, str(e)


def send_test_message() -> Tuple[bool, str]:
    if not BOT_TOKEN:
        return False, "BOT_TOKEN is not set in .env"
    if not CHAT_ID:
        return False, "CHAT_ID is not set in .env"

    api_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    resp = requests.post(api_url, json={
        "chat_id": CHAT_ID,
        "text": (
            "✅ *Blog Notifier Connected\\!*\n\n"
            "You'll receive instant notifications here whenever a new article is published\\."
        ),
        "parse_mode": "MarkdownV2",
    }, timeout=10)

    if resp.ok:
        return True, "Test message sent successfully!"
    return False, f"Error {resp.status_code}: {resp.text[:200]}"
