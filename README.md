# Blog Notifier

A self-hosted engineering blog aggregator that pulls the latest posts from **270+ sources**, stores them in a local SQLite database, and sends **instant Telegram notifications** for every new article. Comes with a fast React UI featuring topic filters, search, unread tracking, and a random-unread picker.

---

## Features

| Feature | Details |
|---|---|
| **270+ sources** | Big Tech, AI/ML, AI News, TLDR, The Batch, Security, Cloud, DevOps and 10 more topics |
| **Auto-fetch** | Every 5 hours via APScheduler |
| **Telegram alerts** | Instant message for every new article (requires VPN in some regions) |
| **Telegram bot commands** | Control the app from Telegram — `/random`, `/fetch`, `/stats`, `/digest`, `/topic`, `/pause`, `/resume` |
| **React UI** | Topic/source filter, full-text search, unread toggle, pagination, random-unread |
| **PWA** | Install as a home screen app on Android, iPhone, or desktop |
| **Daily DB cleanup** | Articles older than 90 days deleted at 03:00 UTC; unread & 10 most recent per source kept |
| **REST API** | Full FastAPI backend with interactive docs at `/docs` |

---

## Prerequisites

| Requirement | Minimum version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |

---

## Quick Start

### macOS / Linux

```bash
git clone https://github.com/NinjaAadi/BlogReader.git
cd BlogReader

bash setup.sh     # install everything
nano .env         # add Telegram credentials (optional)
./start.sh        # start both services
```

### Windows

```
git clone https://github.com/NinjaAadi/BlogReader.git
cd BlogReader

setup.bat         # install everything
notepad .env      # add Telegram credentials (optional)
start.bat         # start both services
stop.bat          # stop both services
```

Open **http://localhost:5173** in your browser.

---

## Step-by-Step Setup

### Step 1 — Clone the repo

```bash
git clone https://github.com/NinjaAadi/BlogReader.git
cd BlogReader
```

### Step 2 — Run setup

```bash
bash setup.sh
```

This script automatically:
- Checks Python 3 and Node.js are installed
- Creates a Python virtual environment at `./venv`
- Installs all Python dependencies (`pip install -r requirements.txt`)
- Installs all frontend npm packages (`npm install`)
- Creates `.env` from `.env.example` (only if `.env` doesn't exist yet)

### Step 3 — Configure Telegram notifications

> Skip this step if you don't want Telegram notifications — the app works without them.

Open `.env` in any editor:

```bash
nano .env
```

Fill in these two values:

```env
BOT_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CHAT_ID=891673831
```

How to get them — see the **Telegram Setup** section below.

### Step 4 — Start the app

```bash
./start.sh
```

The script will:
1. Kill any existing processes on ports `8000` and `5173`
2. Start the FastAPI backend
3. Wait until backend responds on `/api/health`
4. Start the Vite frontend
5. Open the browser automatically (macOS)
6. Print logs to the terminal — press **Ctrl+C** to stop both

---

## Access from Phone or Other Devices

The app runs on your Mac. To access it from your phone, tablet, or another PC — on any network, not just home WiFi — use **Tailscale** (free, no public exposure).

### How it works

```
Android / iPhone / Windows PC (Tailscale)
        ──private encrypted tunnel──▶ Mac (Tailscale)
                                        ├── Vite  :5173
                                        └── FastAPI :8000
```

- No port forwarding, no router changes
- Mac gets a stable private IP (`100.x.x.x`) that never changes
- Works on any WiFi, mobile data, anywhere in the world

### One-time setup

**Step 1 — Install Tailscale on your Mac**

```bash
brew install tailscale
sudo tailscale up    # opens browser to sign in (Google / GitHub / email)
```

**Step 2 — Install Tailscale on your other device**

| Device | Install |
|---|---|
| **Android** | Play Store → search **Tailscale** → Install |
| **iPhone / iPad** | App Store → search **Tailscale** → Install |
| **Windows** | [tailscale.com/download](https://tailscale.com/download) → Install |

Sign in with the **same account** you used on the Mac.

**Step 3 — Get the Mac's Tailscale IP**

```bash
tailscale ip -4
# prints: 100.x.x.x
```

**Step 4 — Open the app**

Run `./start.sh` on the Mac — it will print the URL automatically:

```
  ─────────────────────────────────────────
  On your phone (any network, via Tailscale):
  http://100.x.x.x:5173

  On your phone (same WiFi only):
  http://192.168.x.x:5173
  ─────────────────────────────────────────
```

Open the Tailscale URL in Chrome on your phone. Works from anywhere.

---

## Install as a Webapp (PWA)

The app is a Progressive Web App — you can add it to your home screen so it opens like a native app (no browser chrome, full screen).

**Android (Chrome):**
1. Open the Tailscale URL in Chrome
2. Tap the **⋮** menu → **Add to Home screen**
3. Tap **Add** — an icon appears on your home screen

**iPhone (Safari):**
1. Open the URL in Safari (Chrome won't allow PWA install on iOS)
2. Tap the **Share** button → **Add to Home Screen**
3. Tap **Add**

**Windows / PC (Chrome):**
1. Open `http://localhost:5173` in Chrome
2. Click the install icon in the address bar (or **⋮** → **Install Blog Notifier**)

---

## Mobile Tips

| Gesture | Action |
|---|---|
| **Tap** a card | Opens the article in an external browser tab |
| **Long press** a card (500ms) | Opens the article in the in-app reader |
| **Tap the book icon** on a card | Opens in-app reader |
| **Tap the bookmark icon** on a card | Bookmarks / unbookmarks |

The in-app reader fetches and displays the full article text inside the app — no need to leave BlogReader.

---

## Telegram Setup (Detailed)

### Part A — Create your Telegram bot

1. Open Telegram on your phone or desktop
2. In the search bar, type **@BotFather** and open the official bot (blue tick)
3. Tap **Start** if you haven't used it before
4. Send the command:
   ```
   /newbot
   ```
5. BotFather asks: *"Alright, a new bot. How are we going to call it?"*
   - Enter a display name, e.g. `My Blog Feed`
6. BotFather asks: *"Now let's choose a username for your bot."*
   - Must end in `bot`, e.g. `myblogfeed_bot` or `aaditya_blogs_bot`
7. BotFather replies with your **API token**:
   ```
   Done! Congratulations on your new bot.
   Use this token to access the HTTP API:
   7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
8. Copy this token into `.env` as `BOT_TOKEN`

### Part B — Get your Chat ID

1. Open a new chat with **your newly created bot** in Telegram
2. Send any message (e.g. `hi` or `/start`)
   *(This is required — getUpdates only returns updates after you message the bot)*
3. Open this URL in your browser, replacing `<TOKEN>` with your actual token:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
   Example:
   ```
   https://api.telegram.org/bot7123456789:AAFxxx.../getUpdates
   ```
4. You'll see a JSON response like this:
   ```json
   {
     "ok": true,
     "result": [
       {
         "message": {
           "chat": {
             "id": 891673831,
             "first_name": "Aaditya",
             "type": "private"
           },
           "text": "hi"
         }
       }
     ]
   }
   ```
5. Copy the number from `"id"` — that is your `CHAT_ID`
6. Paste it into `.env` as `CHAT_ID=891673831`

### Part C — Test the connection

After starting the backend, run:

```bash
curl -X POST http://localhost:8000/api/test-telegram
```

Expected response:
```json
{"ok": true, "message": "Test message sent successfully!"}
```

You'll receive a test message in your Telegram chat.

> **Note:** If you get a 403 error, your network/ISP is blocking `api.telegram.org`. Connect to a VPN and try again. This is common with some Indian ISPs.

---

## Telegram Bot Commands

Once Telegram is configured, the bot listens for commands — just open your chat with the bot and type `/`.

The command menu auto-populates in Telegram (tap `/` to see all options).

| Command | What it does |
|---|---|
| `/random` | Sends a random unread article and marks it as read |
| `/fetch` | Triggers a manual fetch of all sources in the background |
| `/stats` | Replies with total articles, unread count, bookmarks, active sources, DB size |
| `/digest` | Sends the top 10 unread articles right now |
| `/topic <name>` | Sends the latest 5 articles from a specific topic |
| `/pause` | Pauses all incoming Telegram notifications |
| `/resume` | Resumes Telegram notifications |
| `/help` | Shows all available commands |

**Examples:**

```
/topic AI/ML
/topic Big Tech
/topic Security
```

> **Note:** The bot starts automatically with `./start.sh`. No extra setup needed beyond the existing `BOT_TOKEN` and `CHAT_ID` in `.env`.

### How it works

The backend runs a background thread that long-polls Telegram's `getUpdates` API. When you send a command, the bot processes it instantly and replies in the same chat. It coexists with outbound notifications — both work simultaneously.

### `/pause` and `/resume`

Useful when you want to focus without interruptions:

1. Send `/pause` → all new-article notifications stop
2. You can still use `/random`, `/stats`, etc. — only outbound alerts are paused
3. Send `/resume` → notifications come back on

> Pause state resets when the backend restarts.

---

## Scheduled Jobs (Cron Details)

The backend runs two background jobs automatically:

### Job 1 — Fetch all sources

| Property | Value |
|---|---|
| **What it does** | Polls all 270+ RSS/blog sources for new articles |
| **Frequency** | Every **5 hours** |
| **Configurable** | `POLL_INTERVAL_MINUTES=300` in `.env` |
| **On startup** | Also runs once immediately when the backend starts |
| **Telegram** | Sends a notification for every **new** article found |

You can trigger it manually anytime:
```bash
# Via UI: click "Fetch Now" button
# Via API:
curl -X POST http://localhost:8000/api/fetch
```

Check the next scheduled run:
```bash
curl http://localhost:8000/api/scheduler/jobs
```

### Job 2 — Database cleanup

| Property | Value |
|---|---|
| **What it does** | Deletes old articles to keep the DB lean |
| **Frequency** | Daily at **03:00 UTC** |
| **Configurable** | `RETAIN_DAYS=90` in `.env` |
| **Never deletes** | Unread articles (regardless of age) |
| **Never deletes** | The 10 most recent articles per source |
| **After delete** | Runs SQLite `VACUUM` to reclaim disk space |

You can run it manually anytime:
```bash
# Default (90 days)
curl -X POST http://localhost:8000/api/cleanup

# Custom retention
curl -X POST "http://localhost:8000/api/cleanup?retain_days=30"
```

---

## Configuration Reference

All settings live in `.env` at the project root:

| Variable | Default | Description |
|---|---|---|
| `BOT_TOKEN` | — | Telegram bot token from @BotFather |
| `CHAT_ID` | — | Your Telegram user/chat ID |
| `POLL_INTERVAL_MINUTES` | `300` | How often to fetch all sources (minutes) |
| `DATABASE_URL` | absolute path | Path to the SQLite DB file |
| `RETAIN_DAYS` | `90` | Articles older than this are deleted daily |
| `BACKEND_PORT` | `8000` | Port for the FastAPI server |

---

## Adding Sources

Edit `sources.yaml` in the project root. Each entry:

```yaml
sources:
  - name: My Blog
    url: https://example.com/feed
    topic: Dev Tools     # matches one of the 18 topics
    type: rss            # rss or scrape
```

Restart the backend — sources load at startup with `INSERT OR IGNORE` (existing ones are not overwritten).

**Available topics:** `Big Tech` · `AI/ML` · `AI Research` · `AI News` · `Streaming` · `Ride-share` · `Social` · `E-commerce` · `Dev Tools` · `Cloud` · `Databases` · `Data Engineering` · `Observability` · `Security` · `Fintech` · `Startup Engineering` · `Gaming` · `Thought Leadership`

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/articles` | List articles (`topic`, `source`, `seen`, `page`, `per_page`) |
| `GET` | `/api/articles/random/unseen` | Random unread article (auto-marks seen) |
| `POST` | `/api/articles/{id}/seen` | Mark as seen |
| `GET` | `/api/topics` | All topics |
| `GET` | `/api/sources` | All sources |
| `PATCH` | `/api/sources/{id}/toggle?active=true` | Enable/disable a source |
| `GET` | `/api/stats` | Article count, unread, DB size |
| `POST` | `/api/fetch` | Trigger manual fetch |
| `POST` | `/api/cleanup?retain_days=90` | Run DB cleanup now |
| `GET` | `/api/scheduler/jobs` | Next run times for scheduled jobs |
| `POST` | `/api/test-telegram` | Send a test Telegram message |
| `GET` | `/api/health` | Health check |

Interactive docs: **http://localhost:8000/docs**

---

## Building for Production

By default `./start.sh` runs the frontend in **dev mode** (Vite dev server on port 5173).
For a production build served by the FastAPI backend:

```bash
# 1. Build the frontend
cd frontend
npm run build        # outputs to frontend/dist/

# 2. Serve static files via FastAPI (add to main.py if needed)
#    or serve with any static file server:
npx serve dist -p 5173
```

The built files are in `frontend/dist/` — you can deploy them to any CDN or static host and point the API calls at your backend URL.

---

## Backup & Restore

The app supports two backup formats — both accessible from the **Settings** tab in the UI or via API.

### Option A — JSON backup (bookmarks + read history only)

```bash
# Download
curl http://localhost:8000/api/backup -o backup.json

# Restore (merges into existing data)
curl -X POST http://localhost:8000/api/restore \
  -H "Content-Type: application/json" \
  -d @backup.json
```

### Option B — Full database backup (everything)

```bash
# Download the entire SQLite DB
curl http://localhost:8000/api/backup/db -o backup.sqlite

# Restore (replaces the entire DB — restart required after)
curl -X POST http://localhost:8000/api/restore/db \
  -F "file=@backup.sqlite"
```

> After a full DB restore, restart the backend: `./start.sh`

---

## Scheduling

Fetch and cleanup intervals are configured in `.env`:

```env
POLL_INTERVAL_MINUTES=300   # fetch all sources every 5 hours (default)
RETAIN_DAYS=90              # delete articles older than 90 days (default)
```

Check when jobs are next scheduled to run:

```bash
curl http://localhost:8000/api/scheduler/jobs
```

Trigger manually without waiting:

```bash
# Fetch all sources now
curl -X POST http://localhost:8000/api/fetch

# Run DB cleanup now
curl -X POST http://localhost:8000/api/cleanup

# Send daily Telegram digest now
curl -X POST http://localhost:8000/api/digest
```

---

## Project Structure

```
BlogReader/
├── setup.sh              ← macOS/Linux: run once to install everything
├── start.sh              ← macOS/Linux: start both services
├── setup.bat             ← Windows: run once to install everything
├── start.bat             ← Windows: start both services
├── stop.bat              ← Windows: stop both services
├── .env                  ← Your local config (not committed)
├── .env.example          ← Template
├── sources.yaml          ← All 312+ blog sources
├── requirements.txt      ← Python dependencies
├── backend/
│   ├── main.py           ← FastAPI app + startup
│   ├── db.py             ← SQLite helpers + cleanup
│   ├── fetcher.py        ← RSS + HTML scraper
│   ├── notifier.py       ← Telegram notifications
│   └── scheduler.py      ← APScheduler jobs
└── frontend/
    └── src/
        ├── App.jsx
        └── components/
            ├── BlogCard.jsx
            ├── TopicFilter.jsx
            └── StatsBar.jsx
```

---

## Troubleshooting

**`./setup.sh: Permission denied`**
```bash
chmod +x setup.sh start.sh
```

**Backend fails to start**
```bash
# Check the log
tail -50 backend.log
# Common cause: port already in use — start.sh handles this automatically
```

**No articles appearing after start**
- The initial fetch runs in the background on startup — wait 2–3 minutes
- Click **Fetch Now** in the UI to trigger immediately
- Check `backend.log` for fetch errors

**Telegram test returns 403**
- Your ISP/network is blocking `api.telegram.org`
- Connect to a VPN and restart the backend, then test again

**Articles count dropped after restart**
- Make sure `DATABASE_URL` in `.env` is set to an absolute path (already done if you used `setup.sh`)
- Never run the backend from inside the `backend/` directory directly

**SSL errors on macOS**
- The project uses `truststore` to pull certs from the macOS system keychain automatically — no manual fix needed
- If errors persist: System Preferences → Software Update

**Windows — `setup.bat` or `start.bat` won't open / says "Access Denied"**
- Right-click the `.bat` file → **Run as Administrator**

**Windows — "Python is not found" even after installing**
- During Python install, tick **"Add Python to PATH"**
- After installing, close and reopen the terminal/file explorer, then try again

**Windows — "Node.js is not found" even after installing**
- Restart your PC after installing Node.js — it needs a fresh PATH

**Windows — backend starts but articles don't load**
- Open `backend.log` in the project folder to see the error
- Most common cause: `DATABASE_URL` not set correctly — run `setup.bat` again to fix it

**Windows — port already in use**
- Run `stop.bat` first, then `start.bat` again

---



## 🔧 Logging Configuration (Console vs File)

The backend supports configurable logging via the `.env` file.

### 1. Set Logging Mode

In your `.env` file:

LOG_MODE=console   # logs to terminal (development)
# OR
LOG_MODE=file      # logs to backend.log (production)

---

### 2. Important: Load `.env` in `start.sh`

Bash does NOT automatically read `.env`, so we explicitly load it:

set -a
source .env
set +a

Place this near the top of `start.sh` (after cd "$(dirname "$0")").

---

### 3. Backend Startup Logic

Update backend start in `start.sh`:

if [ "$LOG_MODE" = "console" ]; then
  venv/bin/python backend/main.py &
else
  nohup venv/bin/python backend/main.py > backend.log 2>&1 </dev/null &
fi

---

### 4. How It Works

- LOG_MODE=console → logs printed in terminal
- LOG_MODE=file → logs written to backend.log
- Python switches between StreamHandler and FileHandler

---

### ✅ Summary

- `.env` controls logging behavior
- `start.sh` loads `.env` and decides output
- `main.py` configures logging handlers accordingly



## Contributing

Contributions are welcome! To add sources, fix broken RSS feeds, or improve the UI:

1. Fork the repo
2. Create a feature branch: `git checkout -b my-feature`
3. Commit your changes: `git commit -m "Add feature"`
4. Push and open a Pull Request

To add or fix RSS sources, edit `sources.yaml` and open a PR — no code changes needed.

---

## License

MIT — free to use, fork, and self-host.

---

> Built with FastAPI · SQLite · React · Vite · APScheduler · Telegram Bot API
> If this project is useful to you, consider giving it a ⭐ on GitHub!
