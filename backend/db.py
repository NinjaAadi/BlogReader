import sqlite3
import os
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

_raw_db_path = os.getenv("DATABASE_URL", "./blog_notifier.db")
if os.path.isabs(_raw_db_path):
    DB_PATH = _raw_db_path
else:
    # Resolve relative paths against the project root (parent of this backend/ dir)
    # so the DB is always created at <project_root>/blog_notifier.db regardless of CWD
    _project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DB_PATH = os.path.normpath(os.path.join(_project_root, _raw_db_path))


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS articles (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                title          TEXT NOT NULL,
                url            TEXT UNIQUE NOT NULL,
                summary        TEXT,
                source_name    TEXT,
                topic          TEXT,
                published_at   DATETIME,
                fetched_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_seen        BOOLEAN  DEFAULT 0,
                is_notified    BOOLEAN  DEFAULT 0,
                is_bookmarked  BOOLEAN  DEFAULT 0,
                seen_at        DATETIME
            );

            CREATE TABLE IF NOT EXISTS sources (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                name         TEXT NOT NULL,
                url          TEXT NOT NULL UNIQUE,
                topic        TEXT NOT NULL,
                type         TEXT DEFAULT 'rss',
                active       BOOLEAN DEFAULT 1,
                last_fetched DATETIME,
                error_count  INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_articles_topic     ON articles(topic);
            CREATE INDEX IF NOT EXISTS idx_articles_seen      ON articles(is_seen);
            CREATE INDEX IF NOT EXISTS idx_articles_notified  ON articles(is_notified);
            CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
            CREATE INDEX IF NOT EXISTS idx_articles_source    ON articles(source_name);
        """)
        # Migrate existing DBs: add columns if they don't exist yet
        for col, definition in [
            ("is_bookmarked", "BOOLEAN DEFAULT 0"),
            ("seen_at",       "DATETIME"),
        ]:
            try:
                conn.execute(f"ALTER TABLE articles ADD COLUMN {col} {definition}")
            except Exception:
                pass  # column already exists
        # Create indexes for migrated columns (must run after migration)
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_articles_bookmarked ON articles(is_bookmarked)",
            "CREATE INDEX IF NOT EXISTS idx_articles_seen_at    ON articles(seen_at DESC)",
        ]:
            try:
                conn.execute(idx_sql)
            except Exception:
                pass
        # Fix articles where the RSS feed provided a future published_at date
        # (e.g. pre-published release notes). Clamp to fetched_at so filters work correctly.
        try:
            conn.execute(
                "UPDATE articles SET published_at = fetched_at WHERE published_at > CURRENT_TIMESTAMP"
            )
        except Exception:
            pass
    logger.info("Database initialized.")


def load_sources_from_yaml(yaml_path: str = "../sources.yaml"):
    import yaml
    path = os.path.join(os.path.dirname(__file__), yaml_path)
    if not os.path.exists(path):
        path = os.path.join(os.getcwd(), "sources.yaml")
    with open(path) as f:
        data = yaml.safe_load(f)
    inserted = 0
    with get_conn() as conn:
        for src in data.get("sources", []):
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO sources (name, url, topic, type) VALUES (?, ?, ?, ?)",
                    (src["name"], src["url"], src["topic"], src.get("type", "rss")),
                )
                inserted += 1
            except Exception as e:
                logger.warning(f"Could not insert source {src.get('name')}: {e}")
    logger.info(f"Sources loaded from YAML ({inserted} inserted).")


# ── Articles ─────────────────────────────────────────────

def upsert_article(
    title: str,
    url: str,
    summary: str,
    source_name: str,
    topic: str,
    published_at: datetime,
) -> bool:
    """Insert article if URL not seen before. Returns True if new."""
    with get_conn() as conn:
        try:
            conn.execute(
                """INSERT INTO articles (title, url, summary, source_name, topic, published_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (title, url[:2000], summary[:1000] if summary else "", source_name, topic, published_at),
            )
            return True
        except sqlite3.IntegrityError:
            return False


def get_articles(
    topic: Optional[str] = None,
    source: Optional[str] = None,
    seen: Optional[bool] = None,
    search: Optional[str] = None,
    since_days: Optional[int] = None,
    page: int = 1,
    per_page: int = 50,
) -> List[Dict]:
    query = "SELECT * FROM articles WHERE 1=1"
    params: list = []
    if topic and topic.lower() != "all":
        query += " AND topic = ?"
        params.append(topic)
    if source and source.lower() != "all":
        query += " AND source_name = ?"
        params.append(source)
    if seen is not None:
        query += " AND is_seen = ?"
        params.append(1 if seen else 0)
    if search and search.strip():
        q = f"%{search.strip()}%"
        query += " AND (title LIKE ? OR summary LIKE ? OR source_name LIKE ?)"
        params.extend([q, q, q])
    if since_days and since_days > 0:
        from datetime import timedelta
        cutoff = (datetime.utcnow() - timedelta(days=since_days)).isoformat()
        query += " AND published_at >= ?"
        params.append(cutoff)
    query += " ORDER BY published_at DESC, fetched_at DESC"
    query += f" LIMIT {per_page} OFFSET {(page - 1) * per_page}"
    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_article_by_id(article_id: int) -> Optional[Dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM articles WHERE id = ?", (article_id,)).fetchone()
        return dict(row) if row else None


def get_random_unseen() -> Optional[Dict]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM articles WHERE is_seen = 0 ORDER BY RANDOM() LIMIT 1"
        ).fetchone()
        return dict(row) if row else None


def mark_seen(article_id: int):
    with get_conn() as conn:
        conn.execute(
            "UPDATE articles SET is_seen = 1, seen_at = CURRENT_TIMESTAMP WHERE id = ? AND is_seen = 0",
            (article_id,),
        )


def mark_notified(article_id: int):
    with get_conn() as conn:
        conn.execute("UPDATE articles SET is_notified = 1 WHERE id = ?", (article_id,))


def get_unnotified() -> List[Dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM articles WHERE is_notified = 0 ORDER BY fetched_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def get_topics() -> List[str]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT topic FROM articles WHERE topic IS NOT NULL ORDER BY topic"
        ).fetchall()
        return [r[0] for r in rows]


def get_sources_list() -> List[Dict]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM sources ORDER BY topic, name").fetchall()
        return [dict(r) for r in rows]


def update_source_fetched(source_id: int, error: bool = False):
    with get_conn() as conn:
        if error:
            conn.execute(
                "UPDATE sources SET last_fetched = CURRENT_TIMESTAMP, error_count = error_count + 1 WHERE id = ?",
                (source_id,),
            )
        else:
            conn.execute(
                "UPDATE sources SET last_fetched = CURRENT_TIMESTAMP, error_count = 0 WHERE id = ?",
                (source_id,),
            )


def toggle_source(source_id: int, active: bool):
    with get_conn() as conn:
        conn.execute("UPDATE sources SET active = ? WHERE id = ?", (1 if active else 0, source_id))


def get_stats() -> Dict:
    with get_conn() as conn:
        art = conn.execute(
            """SELECT COUNT(*) as total,
                      SUM(CASE WHEN is_seen=0 THEN 1 ELSE 0 END) as unread,
                      SUM(CASE WHEN is_bookmarked=1 THEN 1 ELSE 0 END) as bookmarked
               FROM articles"""
        ).fetchone()
        src = conn.execute(
            "SELECT COUNT(*) as total, SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) as active FROM sources"
        ).fetchone()
        db_size = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
        return {
            "total_articles": art["total"] or 0,
            "unread_articles": art["unread"] or 0,
            "bookmarked_articles": art["bookmarked"] or 0,
            "total_sources": src["total"] or 0,
            "active_sources": src["active"] or 0,
            "db_size_mb": round(db_size / 1024 / 1024, 2),
        }


# ── Cleanup ───────────────────────────────────────────────

def cleanup_old_articles(retain_days: int = 90, keep_unread: bool = True) -> Dict:
    """
    Delete articles older than `retain_days`.
    If keep_unread=True, unread articles are never deleted regardless of age.
    Always keeps the 10 most recent articles per source.
    Returns counts of deleted rows and DB size before/after.
    """
    cutoff = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    from datetime import timedelta
    cutoff -= timedelta(days=retain_days)
    cutoff_str = cutoff.isoformat()

    size_before = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0

    with get_conn() as conn:
        # Build the delete query
        # Never delete: articles newer than cutoff, or unread articles (if keep_unread),
        #               or the 10 most recent per source
        keep_unread_clause = "AND is_seen = 1" if keep_unread else ""

        deleted = conn.execute(f"""
            DELETE FROM articles
            WHERE id IN (
                SELECT a.id FROM articles a
                WHERE a.fetched_at < ?
                {keep_unread_clause}
                AND a.id NOT IN (
                    SELECT id FROM articles a2
                    WHERE a2.source_name = a.source_name
                    ORDER BY a2.published_at DESC
                    LIMIT 10
                )
            )
        """, (cutoff_str,)).rowcount

    # VACUUM must run outside a transaction (autocommit connection)
    vacuum_conn = sqlite3.connect(DB_PATH)
    try:
        vacuum_conn.isolation_level = None
        vacuum_conn.execute("VACUUM")
    finally:
        vacuum_conn.close()

    size_after = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
    freed_mb = round((size_before - size_after) / 1024 / 1024, 2)

    logger.info(
        f"Cleanup: deleted {deleted} articles older than {retain_days} days. "
        f"Freed {freed_mb} MB ({round(size_before/1024/1024,2)} → {round(size_after/1024/1024,2)} MB)."
    )
    return {
        "deleted": deleted,
        "retain_days": retain_days,
        "size_before_mb": round(size_before / 1024 / 1024, 2),
        "size_after_mb": round(size_after / 1024 / 1024, 2),
        "freed_mb": freed_mb,
    }


# ── Bookmarks ─────────────────────────────────────────────

def toggle_bookmark(article_id: int) -> bool:
    """Flip is_bookmarked for the given article. Returns the new state."""
    with get_conn() as conn:
        conn.execute(
            "UPDATE articles SET is_bookmarked = NOT is_bookmarked WHERE id = ?",
            (article_id,),
        )
        row = conn.execute(
            "SELECT is_bookmarked FROM articles WHERE id = ?", (article_id,)
        ).fetchone()
        return bool(row["is_bookmarked"]) if row else False


def get_bookmarks(page: int = 1, per_page: int = 50) -> List[Dict]:
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT * FROM articles WHERE is_bookmarked = 1
               ORDER BY fetched_at DESC
               LIMIT ? OFFSET ?""",
            (per_page, (page - 1) * per_page),
        ).fetchall()
        return [dict(r) for r in rows]


# ── History ───────────────────────────────────────────────

def get_history(page: int = 1, per_page: int = 50) -> List[Dict]:
    """Return articles that have been seen, most recently seen first."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT * FROM articles WHERE is_seen = 1
               ORDER BY seen_at DESC, fetched_at DESC
               LIMIT ? OFFSET ?""",
            (per_page, (page - 1) * per_page),
        ).fetchall()
        return [dict(r) for r in rows]


def clear_history() -> int:
    """Mark all seen articles as unseen and clear seen_at timestamps."""
    with get_conn() as conn:
        result = conn.execute(
            "UPDATE articles SET is_seen = 0, seen_at = NULL WHERE is_seen = 1"
        )
        return result.rowcount


# ── Backup / Restore ──────────────────────────────────────

def export_backup() -> Dict:
    """Export bookmarks and full history as a JSON-serialisable dict."""
    import json
    with get_conn() as conn:
        bookmarks = [dict(r) for r in conn.execute(
            "SELECT * FROM articles WHERE is_bookmarked = 1 ORDER BY fetched_at DESC"
        ).fetchall()]
        history = [dict(r) for r in conn.execute(
            "SELECT * FROM articles WHERE is_seen = 1 ORDER BY seen_at DESC, fetched_at DESC"
        ).fetchall()]
    return {
        "exported_at": datetime.utcnow().isoformat(),
        "bookmarks": bookmarks,
        "history": history,
        "counts": {"bookmarks": len(bookmarks), "history": len(history)},
    }


def restore_backup(data: Dict) -> Dict:
    """
    Re-apply bookmarks and seen state from a backup dict.
    Matches articles by URL. Does not insert new articles.
    """
    bookmarked_urls = {a["url"] for a in data.get("bookmarks", [])}
    seen_urls       = {(a["url"], a.get("seen_at")) for a in data.get("history", [])}

    restored_bookmarks = restored_history = 0
    with get_conn() as conn:
        for url in bookmarked_urls:
            cur = conn.execute(
                "UPDATE articles SET is_bookmarked = 1 WHERE url = ?", (url,)
            )
            restored_bookmarks += cur.rowcount

        for url, seen_at in seen_urls:
            cur = conn.execute(
                """UPDATE articles SET is_seen = 1, seen_at = COALESCE(seen_at, ?)
                   WHERE url = ?""",
                (seen_at, url),
            )
            restored_history += cur.rowcount

    return {
        "restored_bookmarks": restored_bookmarks,
        "restored_history": restored_history,
    }


# ── Mark all seen ─────────────────────────────────────────

def mark_all_seen(
    topic: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    since_days: Optional[int] = None,
) -> int:
    """Mark matching articles as seen. Returns count updated."""
    query = "UPDATE articles SET is_seen = 1, seen_at = CURRENT_TIMESTAMP WHERE is_seen = 0"
    params: list = []
    if topic and topic.lower() != "all":
        query += " AND topic = ?"
        params.append(topic)
    if source and source.lower() != "all":
        query += " AND source_name = ?"
        params.append(source)
    if search and search.strip():
        q = f"%{search.strip()}%"
        query += " AND (title LIKE ? OR summary LIKE ?)"
        params.extend([q, q])
    if since_days and since_days > 0:
        from datetime import timedelta
        cutoff = (datetime.utcnow() - timedelta(days=since_days)).isoformat()
        query += " AND published_at >= ?"
        params.append(cutoff)
    with get_conn() as conn:
        result = conn.execute(query, params)
        return result.rowcount


# ── Source management ────────────────────────────────────

def add_source(name: str, url: str, topic: str, source_type: str = "rss") -> Optional[Dict]:
    """Insert a new source. Returns the new row or None if URL exists."""
    with get_conn() as conn:
        try:
            conn.execute(
                "INSERT INTO sources (name, url, topic, type) VALUES (?, ?, ?, ?)",
                (name, url, topic, source_type),
            )
            row = conn.execute(
                "SELECT * FROM sources WHERE url = ?", (url,)
            ).fetchone()
            return dict(row) if row else None
        except sqlite3.IntegrityError:
            return None  # URL already exists


def delete_source(source_id: int) -> bool:
    """Remove a source by ID. Returns True if deleted."""
    with get_conn() as conn:
        result = conn.execute("DELETE FROM sources WHERE id = ?", (source_id,))
        return result.rowcount > 0


# ── Reading stats ────────────────────────────────────────

def get_reading_stats() -> Dict:
    """Return reading analytics: daily counts, top topics, top sources, streak."""
    with get_conn() as conn:
        # Daily read counts — last 30 days
        daily_rows = conn.execute("""
            SELECT DATE(seen_at) as day, COUNT(*) as count
            FROM articles
            WHERE is_seen = 1 AND seen_at IS NOT NULL
              AND seen_at >= datetime('now', '-30 days')
            GROUP BY day
            ORDER BY day
        """).fetchall()
        daily = [{"day": r["day"], "count": r["count"]} for r in daily_rows]

        # Top topics by reads
        topic_rows = conn.execute("""
            SELECT topic, COUNT(*) as count
            FROM articles WHERE is_seen = 1 AND topic IS NOT NULL
            GROUP BY topic ORDER BY count DESC LIMIT 8
        """).fetchall()
        top_topics = [{"topic": r["topic"], "count": r["count"]} for r in topic_rows]

        # Top sources by reads
        source_rows = conn.execute("""
            SELECT source_name, COUNT(*) as count
            FROM articles WHERE is_seen = 1 AND source_name IS NOT NULL
            GROUP BY source_name ORDER BY count DESC LIMIT 8
        """).fetchall()
        top_sources = [{"source": r["source_name"], "count": r["count"]} for r in source_rows]

        # Total reads and average per active day
        totals = conn.execute("""
            SELECT COUNT(*) as total,
                   COUNT(DISTINCT DATE(seen_at)) as days_active
            FROM articles WHERE is_seen = 1 AND seen_at IS NOT NULL
        """).fetchone()
        total_reads = totals["total"] or 0
        days_active = totals["days_active"] or 1
        avg_per_day = round(total_reads / days_active, 1)

        # Reading streak (consecutive days up to today)
        streak_rows = conn.execute("""
            SELECT DISTINCT DATE(seen_at) as day
            FROM articles
            WHERE is_seen = 1 AND seen_at IS NOT NULL
            ORDER BY day DESC
        """).fetchall()
        streak = 0
        if streak_rows:
            from datetime import date, timedelta
            today = date.today()
            for i, row in enumerate(streak_rows):
                expected = today - timedelta(days=i)
                if row["day"] == str(expected):
                    streak += 1
                else:
                    break

    return {
        "daily": daily,
        "top_topics": top_topics,
        "top_sources": top_sources,
        "total_reads": total_reads,
        "days_active": days_active,
        "avg_per_day": avg_per_day,
        "streak": streak,
    }


# ── Trending ─────────────────────────────────────────────

_STOP_WORDS = {
    "a","an","the","and","or","but","in","on","at","to","for","of","with",
    "is","are","was","were","be","been","being","have","has","had","do","does",
    "did","will","would","could","should","may","might","can","this","that",
    "these","those","it","its","i","you","he","she","we","they","what","how",
    "when","where","why","which","who","from","by","as","up","about","into",
    "through","after","over","between","out","new","your","our","their","my",
    "more","also","just","not","if","than","then","so","no","vs","via",
}

def get_trending(hours: int = 24, limit: int = 25) -> List[Dict]:
    """Return top keywords from article titles in the last N hours."""
    from collections import Counter
    import re
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT title FROM articles WHERE fetched_at >= datetime('now', ? || ' hours')",
            (f"-{hours}",),
        ).fetchall()

    counts: Counter = Counter()
    for row in rows:
        words = re.findall(r"[a-zA-Z]{3,}", row["title"].lower())
        for w in words:
            if w not in _STOP_WORDS:
                counts[w] += 1

    return [{"word": w, "count": c} for w, c in counts.most_common(limit) if c > 1]


# ── Unnotified articles for digest ───────────────────────

def get_top_unread(limit: int = 10) -> List[Dict]:
    """Return most recent unread articles for daily digest."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT * FROM articles WHERE is_seen = 0
               ORDER BY published_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
