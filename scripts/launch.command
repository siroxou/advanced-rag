#!/bin/zsh
# Advanced RAG - one-click local launcher.
#
# Double-click this (or "Advanced RAG.app" in the repo root). It pulls the latest
# code from GitHub, brings up Postgres + the FastAPI backend + the Next.js UI, and
# opens your browser. Closing this window (or Ctrl-C) stops the servers.
#
# The whole body is wrapped in a function so zsh parses the file fully before
# running it: a `git pull` that rewrites this script mid-launch can't corrupt the
# in-flight run.
# ponytail: pull-on-launch IS the auto-update. For always-on background updates,
# add a LaunchAgent running `git -C <repo> fetch` on a timer (see notes below).

# $0 holds the script path only at top level; inside a function zsh's
# FUNCTION_ARGZERO rebinds it to the function name, so capture the repo root here.
ADVANCED_RAG_REPO="${0:A:h:h}"   # <repo>/scripts/launch.command -> <repo>

launch() {
  set -u
  emulate -L zsh

  local REPO="$ADVANCED_RAG_REPO"
  cd "$REPO" || { print "Cannot cd to repo: $REPO"; return 1; }

  # Finder-launched apps inherit a minimal PATH; restore Homebrew + user bins.
  export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
  # node/pnpm are fnm-managed; activate it the way the interactive shell does.
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env 2>/dev/null)"
    fnm use default >/dev/null 2>&1 || true
  fi
  local PNPM
  if command -v pnpm >/dev/null 2>&1; then PNPM=pnpm
  elif command -v corepack >/dev/null 2>&1; then corepack enable >/dev/null 2>&1; PNPM="corepack pnpm"
  else print "ERROR: pnpm not found (fnm/corepack missing)"; return 1; fi

  local PG_BIN=/opt/homebrew/opt/postgresql@17/bin
  local PG_DATA=/opt/homebrew/var/postgresql@17
  local BACKEND_PORT=8000 FRONTEND_PORT=3000
  local BACK_PID="" FRONT_PID=""

  log()  { print -P "%F{cyan}==>%f $*"; }
  kill_port() { local p=$(lsof -ti tcp:$1 2>/dev/null); [ -n "$p" ] && kill $p 2>/dev/null; }
  stop() {
    log "Stopping backend + frontend"
    [ -n "$BACK_PID" ]  && kill $BACK_PID  2>/dev/null
    [ -n "$FRONT_PID" ] && kill $FRONT_PID 2>/dev/null
    kill_port $BACKEND_PORT; kill_port $FRONTEND_PORT
    exit 0
  }
  trap stop INT TERM

  # Reclaim ports from any previous run so a relaunch is always clean.
  log "Freeing ports $BACKEND_PORT / $FRONTEND_PORT"
  kill_port $BACKEND_PORT; kill_port $FRONTEND_PORT

  # 1. Update from GitHub (best-effort; never blocks the launch).
  log "Updating from GitHub"
  local before=$(git rev-parse HEAD 2>/dev/null)
  git pull --ff-only || log "git pull skipped (offline or local changes) - running current version"
  local after=$(git rev-parse HEAD 2>/dev/null)
  changed() { [ "$before" != "$after" ] && git diff --name-only "$before" "$after" 2>/dev/null | grep -Eq "$1"; }

  # 2. Frontend deps: install on first run or when the pull changed them.
  #    (Backend deps are handled by `uv run --extra ml`, which auto-syncs.)
  if [ ! -d frontend/node_modules ] || changed 'frontend/(package\.json|pnpm-lock\.yaml)'; then
    log "Installing frontend deps"; ( cd frontend && eval "$PNPM install" )
  fi

  # 3. Ensure Postgres is up (LC_ALL fix: PG17 on macOS dies multithreaded without it).
  if ! "$PG_BIN/pg_isready" -h localhost -p 5432 -q 2>/dev/null; then
    log "Starting Postgres@17"
    LC_ALL=en_US.UTF-8 "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_DATA/server.log" start
    for i in {1..30}; do "$PG_BIN/pg_isready" -h localhost -p 5432 -q 2>/dev/null && break; sleep 0.5; done
  fi

  # 4. Apply DB migrations (no-op when already current).
  log "Applying DB migrations"
  ( cd backend && uv run --extra ml alembic upgrade head ) || log "migration step failed - check Postgres"

  # 5. Start the servers (logs stream into this window).
  log "Starting FastAPI backend on :$BACKEND_PORT"
  ( cd backend && uv run --extra ml uvicorn app.main:app --port $BACKEND_PORT ) &
  BACK_PID=$!
  log "Starting Next.js frontend on :$FRONTEND_PORT"
  ( cd frontend && export NEXT_PUBLIC_API_URL="http://localhost:$BACKEND_PORT" && eval "$PNPM dev" ) &
  FRONT_PID=$!

  # 6. Wait for the UI, then open the browser.
  log "Waiting for the UI..."
  for i in {1..60}; do curl -sf "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1 && break; sleep 1; done
  log "Opening http://localhost:$FRONTEND_PORT"
  open "http://localhost:$FRONTEND_PORT"

  log "Advanced RAG is running. Press Ctrl-C or close this window to stop."
  wait
  stop
}

launch "$@"
