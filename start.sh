#!/bin/bash
# Blog Notifier — start backend + frontend together
# Usage: ./start.sh

set -e
cd "$(dirname "$0")"

set -a
source .env
set +a

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
  # lsof works on macOS and most Linux distros with lsof installed
  if command -v lsof &>/dev/null; then
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
      info "Killed existing process on port $port"
    fi
  # fuser is available on most Linux systems without lsof
  elif command -v fuser &>/dev/null; then
    fuser -k "${port}/tcp" 2>/dev/null && info "Killed existing process on port $port" || true
  # fallback: ss + awk (always available on modern Linux)
  else
    pids=$(ss -tlnp "sport = :$port" 2>/dev/null | awk 'NR>1 {match($6,/pid=([0-9]+)/,a); if(a[1]) print a[1]}' || true)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
      info "Killed existing process on port $port"
    fi
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
echo "LOG_MODE=$LOG_MODE"
if [ "$LOG_MODE" = "console" ]; then
  venv/bin/python backend/main.py &
else
  nohup venv/bin/python backend/main.py > backend.log 2>&1 </dev/null &
fi

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

TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null \
  || ipconfig getifaddr en1 2>/dev/null \
  || hostname -I 2>/dev/null | awk '{print $1}' || echo "")

echo ""
echo "  ─────────────────────────────────────────"
if [ -n "$TAILSCALE_IP" ]; then
  echo -e "  On your phone (any network, via Tailscale):"
  echo -e "  ${CYAN}http://$TAILSCALE_IP:$FRONTEND_PORT${NC}"
fi
if [ -n "$LOCAL_IP" ]; then
  echo -e "  On your phone (same WiFi only):"
  echo -e "  ${CYAN}http://$LOCAL_IP:$FRONTEND_PORT${NC}"
fi
echo "  ─────────────────────────────────────────"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop both services."
echo ""

# Open browser (macOS: open, Linux: xdg-open)
if command -v open &>/dev/null; then
  sleep 1 && open "http://localhost:${FRONTEND_PORT}" &
elif command -v xdg-open &>/dev/null; then
  sleep 1 && xdg-open "http://localhost:${FRONTEND_PORT}" &
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

wait $BACKEND_PID
