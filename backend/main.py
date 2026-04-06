import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import json
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Request, UploadFile, File
from pydantic import BaseModel
from fastapi.responses import JSONResponse, Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

from db import (
    init_db,
    load_sources_from_yaml,
    get_articles,
    get_random_unseen,
    mark_seen,
    get_topics,
    get_sources_list,
    get_stats,
    toggle_source,
    cleanup_old_articles,
    toggle_bookmark,
    get_bookmarks,
    get_history,
    clear_history,
    export_backup,
    restore_backup,
    mark_all_seen,
    add_source,
    delete_source,
    get_reading_stats,
    get_trending,
    get_top_unread,
    get_article_by_id,
)
from fetcher import fetch_all_sources
from scheduler import start_scheduler, stop_scheduler, get_scheduler_jobs
from notifier import send_test_message

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────
    logger.info("Initializing database...")
    init_db()
    load_sources_from_yaml()

    logger.info("Running initial fetch in background (no notifications)...")
    import threading
    t = threading.Thread(target=lambda: fetch_all_sources(notify=False), daemon=True)
    t.start()

    start_scheduler(fetch_all_sources)
    yield

    # ── Shutdown ─────────────────────────────────────
    stop_scheduler()


app = FastAPI(
    title="Blog Notifier API",
    description="Real-time blog feed aggregator with Telegram notifications",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════
# Articles
# ═══════════════════════════════════════════════════════

@app.get("/api/articles")
def list_articles(
    topic: Optional[str] = None,
    source: Optional[str] = None,
    seen: Optional[bool] = None,
    search: Optional[str] = None,
    since_days: Optional[int] = Query(default=None, ge=1, le=365),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
):
    articles = get_articles(
        topic=topic, source=source, seen=seen,
        search=search, since_days=since_days,
        page=page, per_page=per_page,
    )
    return {"articles": articles, "page": page, "per_page": per_page, "count": len(articles)}


@app.get("/api/articles/random/unseen")
def random_unseen_article():
    article = get_random_unseen()
    if not article:
        raise HTTPException(status_code=404, detail="No unseen articles available")
    # Auto mark as seen when opened randomly
    mark_seen(article["id"])
    return article


@app.post("/api/articles/{article_id}/seen")
def mark_article_seen(article_id: int):
    mark_seen(article_id)
    return {"ok": True}


@app.post("/api/articles/{article_id}/bookmark")
def bookmark_article(article_id: int):
    bookmarked = toggle_bookmark(article_id)
    return {"ok": True, "bookmarked": bookmarked}


# ═══════════════════════════════════════════════════════
# Bookmarks
# ═══════════════════════════════════════════════════════

@app.get("/api/bookmarks")
def list_bookmarks(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
):
    items = get_bookmarks(page=page, per_page=per_page)
    return {"bookmarks": items, "page": page, "count": len(items)}


# ═══════════════════════════════════════════════════════
# History
# ═══════════════════════════════════════════════════════

@app.get("/api/history")
def list_history(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
):
    items = get_history(page=page, per_page=per_page)
    return {"history": items, "page": page, "count": len(items)}


@app.delete("/api/history")
def delete_history():
    cleared = clear_history()
    return {"ok": True, "cleared": cleared}


# ═══════════════════════════════════════════════════════
# Backup / Restore
# ═══════════════════════════════════════════════════════

@app.get("/api/backup")
def download_backup():
    """Download bookmarks + history as a JSON file."""
    data = export_backup()
    content = json.dumps(data, indent=2, default=str)
    filename = f"blog-notifier-backup-{data['exported_at'][:10]}.json"
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/backup/db")
def download_full_db():
    """Download the full SQLite database file."""
    from db import DB_PATH
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    date = __import__("datetime").datetime.utcnow().strftime("%Y-%m-%d")
    return FileResponse(
        DB_PATH,
        media_type="application/octet-stream",
        filename=f"blog-notifier-full-{date}.sqlite",
    )


@app.post("/api/restore")
async def upload_restore(request: Request):
    """Restore bookmarks + history from a previously downloaded backup JSON."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if "bookmarks" not in data and "history" not in data:
        raise HTTPException(status_code=400, detail="Not a valid backup file")
    result = restore_backup(data)
    return {"ok": True, **result}


@app.post("/api/restore/db")
async def upload_restore_db(file: UploadFile = File(...)):
    """Restore the full SQLite database from a previously downloaded .sqlite backup."""
    from db import DB_PATH
    # Validate magic bytes — SQLite files start with "SQLite format 3\x00"
    header = await file.read(16)
    if not header.startswith(b"SQLite format 3"):
        raise HTTPException(status_code=400, detail="Not a valid SQLite database file")
    # Read remainder
    rest = await file.read()
    full_data = header + rest
    # Write to a temporary path first, then atomically replace
    import shutil, tempfile
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".sqlite", dir=os.path.dirname(DB_PATH) or ".")
    try:
        with os.fdopen(tmp_fd, "wb") as f:
            f.write(full_data)
        shutil.move(tmp_path, DB_PATH)
    except Exception as e:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to restore database: {e}")
    return {"ok": True, "message": "Database restored successfully. Restart the server to apply changes."}


# ═══════════════════════════════════════════════════════
# Topics & Sources
# ═══════════════════════════════════════════════════════

@app.get("/api/topics")
def list_topics():
    topics = get_topics()
    return {"topics": ["All"] + topics}


@app.get("/api/sources")
def list_sources(topic: Optional[str] = None):
    sources = get_sources_list()
    if topic and topic.lower() != "all":
        sources = [s for s in sources if s["topic"] == topic]
    return {"sources": sources}


@app.patch("/api/sources/{source_id}/toggle")
def toggle_source_active(source_id: int, active: bool):
    toggle_source(source_id, active)
    return {"ok": True}


# ═══════════════════════════════════════════════════════
# Stats & Utilities
# ═══════════════════════════════════════════════════════

@app.get("/api/stats")
def get_dashboard_stats():
    return get_stats()


@app.post("/api/fetch")
def trigger_manual_fetch(background_tasks: BackgroundTasks):
    """Manually trigger a fetch cycle."""
    background_tasks.add_task(fetch_all_sources)
    return {"ok": True, "message": "Fetch started in background"}


@app.post("/api/cleanup")
def run_cleanup(retain_days: int = Query(default=90, ge=7, le=365)):
    """Delete old articles, keep unread ones, always keep 10 most recent per source."""
    result = cleanup_old_articles(retain_days=retain_days, keep_unread=True)
    return result


@app.get("/api/scheduler/jobs")
def list_scheduler_jobs():
    """Return next-run time and trigger info for all scheduled jobs."""
    return {"jobs": get_scheduler_jobs()}


@app.post("/api/test-telegram")
def test_telegram_connection():
    ok, message = send_test_message()
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"ok": True, "message": message}


@app.post("/api/articles/mark-all-seen")
def mark_articles_all_seen(
    topic: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    since_days: Optional[int] = Query(default=None, ge=1, le=365),
):
    """Mark all matching articles as seen."""
    count = mark_all_seen(topic=topic, source=source, search=search, since_days=since_days)
    return {"ok": True, "marked": count}


@app.get("/api/articles/{article_id}/content")
async def get_article_content(article_id: int):
    """Fetch and extract full article content via trafilatura."""
    article = get_article_by_id(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    try:
        import trafilatura
        downloaded = trafilatura.fetch_url(article["url"])
        content = trafilatura.extract(
            downloaded,
            include_comments=False,
            include_tables=True,
            output_format="markdown",
        )
        return {"ok": True, "content": content or "", "url": article["url"], "title": article["title"]}
    except Exception as e:
        logger.warning(f"Content fetch failed for {article['url']}: {e}")
        return {"ok": False, "content": "", "url": article["url"], "title": article["title"]}


# ═══════════════════════════════════════════════════════
# Source Management
# ═══════════════════════════════════════════════════════

class SourceCreate(BaseModel):
    name: str
    url: str
    topic: str
    type: str = "rss"

@app.post("/api/sources")
def create_source(body: SourceCreate):
    """Add a new RSS source."""
    result = add_source(body.name, body.url, body.topic, body.type)
    if result is None:
        raise HTTPException(status_code=409, detail="A source with this URL already exists")
    return {"ok": True, "source": result}


@app.delete("/api/sources/{source_id}")
def remove_source(source_id: int):
    """Delete a source by ID."""
    deleted = delete_source(source_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"ok": True}


# ═══════════════════════════════════════════════════════
# Analytics & Trending
# ═══════════════════════════════════════════════════════

@app.get("/api/stats/reading")
def reading_stats():
    return get_reading_stats()


@app.get("/api/trending")
def trending_keywords(hours: int = Query(default=24, ge=1, le=168)):
    return {"trending": get_trending(hours=hours), "hours": hours}


@app.post("/api/digest")
def send_digest_now():
    """Manually trigger the daily Telegram digest."""
    from notifier import send_daily_digest
    articles = get_top_unread(limit=10)
    ok, msg = send_daily_digest(articles)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"ok": True, "message": msg}


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("BACKEND_PORT", 8000)),
        reload=True,
        reload_dirs=[os.path.dirname(os.path.abspath(__file__))],
    )
