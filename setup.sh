#!/bin/bash
# Blog Notifier — one-time setup script
# Run once before first use: bash setup.sh

set -e
cd "$(dirname "$0")"

# ── Colours ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}${BLUE}▶ $*${NC}"; }

echo ""
echo -e "${BOLD}  Blog Notifier — Setup${NC}"
echo "  ──────────────────────────────────────────"
echo ""

# ── 1. Check Python ────────────────────────────────────────
step "Checking Python 3..."
if ! command -v python3 &>/dev/null; then
  error "Python 3 is not installed. Install it from https://python.org"
fi
PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
info "Found Python $PY_VERSION"
if python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" 2>/dev/null; then
  success "Python version OK"
else
  warn "Python 3.11+ recommended (found $PY_VERSION). Continuing anyway..."
fi

# ── 2. Check Node ──────────────────────────────────────────
step "Checking Node.js..."
if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Install it from https://nodejs.org"
fi
NODE_VERSION=$(node --version)
info "Found Node.js $NODE_VERSION"
success "Node.js OK"

# ── 3. Python virtual environment ─────────────────────────
step "Setting up Python virtual environment..."
if [ -d "venv" ]; then
  info "Virtual environment already exists — skipping creation"
else
  python3 -m venv venv
  success "Created virtual environment at ./venv"
fi

# ── 4. Python dependencies ─────────────────────────────────
step "Installing Python dependencies..."
venv/bin/pip install --upgrade pip -q
venv/bin/pip install -r requirements.txt -q
success "Python dependencies installed"

# ── 5. Frontend dependencies ───────────────────────────────
step "Installing frontend (npm) dependencies..."
cd frontend
npm install --silent
cd ..
success "Frontend dependencies installed"

# ── 6. Environment file ────────────────────────────────────
step "Setting up .env file..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f ".env" ]; then
  info ".env already exists — skipping creation"
else
  cp .env.example .env
  success "Created .env from .env.example"
  echo ""
  warn "ACTION REQUIRED: Edit .env and fill in your Telegram credentials:"
  echo -e "  ${CYAN}BOT_TOKEN${NC}  — get from @BotFather on Telegram"
  echo -e "  ${CYAN}CHAT_ID${NC}    — your Telegram user/chat ID"
fi

# Always ensure DATABASE_URL is an absolute path for THIS machine.
# Handles: first-time setup, re-runs, and .env copied/cloned from another machine.
CURRENT_DB=$(grep "^DATABASE_URL=" .env | cut -d= -f2-)
CURRENT_DB_DIR=$(dirname "$CURRENT_DB")
if [[ "$CURRENT_DB" != /* ]] || [[ ! -d "$CURRENT_DB_DIR" ]]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=$SCRIPT_DIR/blog_notifier.db|" .env
  else
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$SCRIPT_DIR/blog_notifier.db|" .env
  fi
  success "Set DATABASE_URL → $SCRIPT_DIR/blog_notifier.db"
fi

# ── 7. Initialise database ─────────────────────────────────
step "Initialising database..."
venv/bin/python - << PYEOF
import sys, os
sys.path.insert(0, 'backend')
from dotenv import load_dotenv
load_dotenv('.env')
from db import init_db, load_sources_from_yaml
init_db()
load_sources_from_yaml()
print('Database ready.')
PYEOF
success "Database created and sources loaded"

# ── Done ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  Setup complete!${NC}"
echo ""
echo "  Next steps:"
echo -e "  1. Edit ${CYAN}.env${NC} and add your Telegram BOT_TOKEN + CHAT_ID"
echo -e "  2. Run ${CYAN}./start.sh${NC} to start both services"
echo -e "  3. Open ${CYAN}http://localhost:5173${NC} in your browser"
echo ""
