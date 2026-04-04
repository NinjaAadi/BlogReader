#!/bin/bash
# Blog Notifier — start backend + frontend together
# Usage: ./start.sh

set -e
cd "$(dirname "$0")"

# ── Colours ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }

BACKEND_PORT=8000
FRONTEND_PORT=5173

# ── Pre-flight checks ──────────────────────────────────────
if [ ! -d "venv" ]; then
  echo -e "${RED}[ERROR]${NC} Virtual environment not found. Run ${CYAN}./setup.sh${NC} first."
  exit 1
fi

if [ ! -d "frontend/node_modules" ]; then
  echo -e "${RED}[ERROR]${NC} Node modules not found. Run ${CYAN}./setup.sh${NC} first."
  exit 1
fi

# ── Kill any existing processes on our ports ───────────────
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    info "Killed existing process on port $port"
  fi
}

info "Clearing ports $BACKEND_PORT and $FRONTEND_PORT..."
kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT
sleep 1

# ── Banner ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  Blog Notifier${NC}"
echo "  ─────────────────────────────────────────"
echo -e "  Frontend  →  ${CYAN}http://localhost:${FRONTEND_PORT}${NC}"
echo -e "  Backend   →  ${CYAN}http://localhost:${BACKEND_PORT}${NC}"
echo -e "  API Docs  →  ${CYAN}http://localhost:${BACKEND_PORT}/docs${NC}"
echo "  ─────────────────────────────────────────"

# ── Telegram check ─────────────────────────────────────────
if [ ! -f ".env" ] || grep -q "your_telegram" .env; then
  echo ""
  warn "Telegram not configured. Edit .env to add BOT_TOKEN + CHAT_ID"
fi
echo ""

# ── Start backend ──────────────────────────────────────────
info "Starting backend..."
nohup venv/bin/python backend/main.py > backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > backend.pid

# Wait until backend is up (up to 15s)
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${BACKEND_PORT}/api/health" &>/dev/null; then
    success "Backend is up (PID $BACKEND_PID)"
    break
  fi
  if [ $i -eq 15 ]; then
    echo -e "${RED}[ERROR]${NC} Backend failed to start. Check backend.log for details."
    exit 1
  fi
  sleep 1
done

# ── Start frontend ─────────────────────────────────────────
info "Starting frontend..."
cd frontend
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..
echo $FRONTEND_PID > frontend.pid

# Wait until frontend is up (up to 15s)
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${FRONTEND_PORT}" &>/dev/null; then
    success "Frontend is up (PID $FRONTEND_PID)"
    break
  fi
  if [ $i -eq 15 ]; then
    warn "Frontend may still be starting — check frontend.log"
    break
  fi
  sleep 1
done

# ── Open browser ───────────────────────────────────────────
echo ""
success "Both services running!"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop both services."
echo ""

# Open browser if on macOS
if command -v open &>/dev/null; then
  sleep 1 && open "http://localhost:${FRONTEND_PORT}" &
fi

# ── Wait and handle Ctrl+C ─────────────────────────────────
cleanup() {
  echo ""
  info "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  # Also kill by port in case PIDs changed
  kill_port $BACKEND_PORT
  kill_port $FRONTEND_PORT
  success "Stopped."
  exit 0
}
trap cleanup INT TERM

# Keep script alive, tail logs
tail -f backend.log &
TAIL_PID=$!
wait $BACKEND_PID 2>/dev/null || true
kill $TAIL_PID 2>/dev/null || true
