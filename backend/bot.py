"""
Telegram bot — listens for commands and replies.

Commands:
  /random   — send a random unread article
  /fetch    — trigger a manual feed fetch
  /stats    — article counts, sources, DB size
  /digest   — top 10 unread articles right now
  /topic X  — latest 5 articles from a topic
  /pause    — pause all Telegram notifications
  /resume   — resume Telegram notifications
  /help     — show command list
"""
import os
import time
import logging
import threading
from typing import Optional

import requests

logger = logging.getLogger(__name__)

_running = False
_thread: Optional[threading.Thread] = None
_offset = 0


def _token() -> str:
    return os.getenv("BOT_TOKEN", "")

def _chat_id() -> str:
    return os.getenv("CHAT_ID", "")

def _base() -> str:
    return f"https://api.telegram.org/bot{_token()}"


# ── Outbound ──────────────────────────────────────────────

def _send(text: str, disable_preview: bool = True):
    try:
        requests.post(
            f"{_base()}/sendMessage",
            json={
                "chat_id": _chat_id(),
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": disable_preview,
            },
            timeout=10,
        )
    except Exception as e:
        logger.warning(f"[Bot] send failed: {e}")


# ── Command handlers ──────────────────────────────────────

def _cmd_help():
    _send(
        "🤖 <b>Blog Notifier — Commands</b>\n\n"
        "/random — Random unread article\n"
        "/fetch — Trigger a manual fetch\n"
        "/stats — Article counts &amp; sources\n"
        "/digest — Top 10 unread articles now\n"
        "/topic &lt;name&gt; — Latest from a topic\n"
        "   e.g. <code>/topic AI/ML</code>\n"
        "/pause — Pause notifications\n"
        "/resume — Resume notifications"
    )


def _cmd_random():
    from db import get_random_unseen, mark_seen
    from notifier import TOPIC_EMOJI
    article = get_random_unseen()
    if not article:
        _send("📭 No unread articles right now.")
        return
    mark_seen(article["id"])
    emoji = TOPIC_EMOJI.get(article.get("topic", ""), "📝")
    _send(
        f"{emoji} <b>{article['source_name']}</b>  ·  {article.get('topic','')}\n"
        f"{article['title']}\n\n"
        f'<a href="{article["url"]}">Read article →</a>',
        disable_preview=False,
    )


def _cmd_fetch():
    from fetcher import fetch_all_sources
    _send("🔄 Fetching all sources… I'll notify you of anything new.")
    threading.Thread(target=fetch_all_sources, daemon=True).start()


def _cmd_stats():
    from db import get_stats
    s = get_stats()
    _send(
        "📊 <b>Stats</b>\n\n"
        f"Total articles: <b>{s.get('total_articles', 0):,}</b>\n"
        f"Unread: <b>{s.get('unread_articles', 0):,}</b>\n"
        f"Bookmarked: <b>{s.get('bookmarked_articles', 0):,}</b>\n"
        f"Active sources: <b>{s.get('active_sources', 0)}</b>\n"
        f"DB size: <b>{s.get('db_size_mb', 0)} MB</b>"
    )


def _cmd_digest():
    from db import get_top_unread
    from notifier import send_daily_digest
    articles = get_top_unread(limit=10)
    ok, msg = send_daily_digest(articles)
    if not ok:
        _send(f"❌ {msg}")


def _cmd_topic(arg: str):
    from db import get_articles
    from notifier import TOPIC_EMOJI
    topic = arg.strip()
    if not topic:
        _send("Usage: <code>/topic AI/ML</code>")
        return
    articles = get_articles(topic=topic, per_page=5)
    if not articles:
        _send(f"No articles found for topic: <b>{topic}</b>")
        return
    emoji = TOPIC_EMOJI.get(topic, "📝")
    lines = [f"{emoji} <b>Latest · {topic}</b>\n"]
    for a in articles:
        lines.append(f'• <a href="{a["url"]}">{a["title"]}</a>\n  <i>{a["source_name"]}</i>')
    _send("\n".join(lines))


def _cmd_pause():
    from notifier import pause_notifications
    pause_notifications()
    _send("🔕 Notifications paused. Send /resume to turn them back on.")


def _cmd_resume():
    from notifier import resume_notifications
    resume_notifications()
    _send("🔔 Notifications resumed.")


# ── Router ────────────────────────────────────────────────

def _handle(text: str):
    parts = text.strip().split(None, 1)
    cmd = parts[0].lower().split("@")[0]   # strip @botname suffix
    arg = parts[1] if len(parts) > 1 else ""

    dispatch = {
        "/start":  _cmd_help,
        "/help":   _cmd_help,
        "/random": _cmd_random,
        "/fetch":  _cmd_fetch,
        "/stats":  _cmd_stats,
        "/digest": _cmd_digest,
        "/pause":  _cmd_pause,
        "/resume": _cmd_resume,
    }

    if cmd == "/topic":
        _cmd_topic(arg)
    elif cmd in dispatch:
        dispatch[cmd]()
    else:
        _send(f"Unknown command: <code>{cmd}</code>\nSend /help to see what I can do.")


# ── Polling loop ──────────────────────────────────────────

def _poll():
    global _offset, _running
    logger.info("[Bot] Long-poll started.")
    while _running:
        try:
            resp = requests.get(
                f"{_base()}/getUpdates",
                params={
                    "offset": _offset,
                    "timeout": 30,
                    "allowed_updates": ["message"],
                },
                timeout=35,
            )
            if not resp.ok:
                time.sleep(5)
                continue
            for update in resp.json().get("result", []):
                _offset = update["update_id"] + 1
                msg = update.get("message", {})
                text = msg.get("text", "")
                if text.startswith("/"):
                    try:
                        _handle(text)
                    except Exception as e:
                        logger.error(f"[Bot] handler error: {e}")
        except Exception as e:
            if _running:
                logger.warning(f"[Bot] poll error: {e}")
            time.sleep(5)
    logger.info("[Bot] Long-poll stopped.")


# ── Lifecycle ─────────────────────────────────────────────

def _register_commands():
    commands = [
        {"command": "random",  "description": "Random unread article"},
        {"command": "fetch",   "description": "Trigger a manual fetch"},
        {"command": "stats",   "description": "Article counts and sources"},
        {"command": "digest",  "description": "Top 10 unread articles now"},
        {"command": "topic",   "description": "Latest from a topic  e.g. /topic AI/ML"},
        {"command": "pause",   "description": "Pause notifications"},
        {"command": "resume",  "description": "Resume notifications"},
        {"command": "help",    "description": "Show all commands"},
    ]
    try:
        requests.post(
            f"{_base()}/setMyCommands",
            json={"commands": commands},
            timeout=10,
        )
        logger.info("[Bot] Commands registered with Telegram.")
    except Exception as e:
        logger.warning(f"[Bot] setMyCommands failed: {e}")


def start_bot():
    global _running, _thread
    if not _token() or not _chat_id():
        logger.info("[Bot] Telegram not configured — bot skipped.")
        return
    _register_commands()
    _running = True
    _thread = threading.Thread(target=_poll, daemon=True, name="telegram-bot")
    _thread.start()
    logger.info("[Bot] Started.")


def stop_bot():
    global _running
    _running = False
    logger.info("[Bot] Stop requested.")
