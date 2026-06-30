#!/bin/zsh
# First-run bootstrap for the DMG-installed app: clone the repo into a managed
# location, then hand off to its launcher (which pulls + starts the stack).
# Override the location with ADVANCED_RAG_HOME or the source with ADVANCED_RAG_REPO_URL.
emulate -L zsh
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

REPO_URL="${ADVANCED_RAG_REPO_URL:-https://github.com/siroxou/advanced-rag.git}"
HOME_REPO="${ADVANCED_RAG_HOME:-$HOME/Advanced RAG}"

if [ ! -d "$HOME_REPO/.git" ]; then
  print -P "%F{cyan}==>%f First run: cloning Advanced RAG into $HOME_REPO"
  if ! git clone "$REPO_URL" "$HOME_REPO"; then
    print -P "%F{red}Clone failed.%f This is a private repo - you need GitHub access on this Mac."
    print "Source: $REPO_URL   (override with ADVANCED_RAG_REPO_URL)"
    print "Press any key to close..."; read -k 1
    exit 1
  fi
else
  print -P "%F{cyan}==>%f Updating managed copy in $HOME_REPO"
  git -C "$HOME_REPO" pull --ff-only || true
fi

if [ ! -f "$HOME_REPO/scripts/launch.command" ]; then
  print -P "%F{red}No launcher found%f at $HOME_REPO/scripts/launch.command"
  print "The repo on GitHub is missing scripts/launch.command - push it first."
  print "Press any key to close..."; read -k 1
  exit 1
fi
exec "$HOME_REPO/scripts/launch.command"
