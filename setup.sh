#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Opus Setup Script
# Validates your .env config and prints the Slack App manifest to copy-paste.
# Usage: bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"

ok()   { echo -e "${GREEN}  ✓${RESET} $1"; }
warn() { echo -e "${YELLOW}  ⚠${RESET}  $1"; }
fail() { echo -e "${RED}  ✗${RESET} $1"; }
info() { echo -e "${CYAN}  →${RESET} $1"; }

echo ""
echo -e "${BOLD}⚡ Opus Setup${RESET}"
echo "────────────────────────────────────────"

# ── 1. .env file ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}1. Environment file${RESET}"

if [ ! -f ".env" ]; then
  warn ".env not found — creating from .env.example"
  cp .env.example .env
  info "Edit .env with your credentials, then re-run this script."
  exit 0
else
  ok ".env exists"
fi

# Load .env (skip comment lines and empty lines)
set -o allexport
# shellcheck disable=SC1091
source <(grep -v '^\s*#' .env | grep -v '^\s*$') 2>/dev/null || true
set +o allexport

# ── 2. Required env vars ──────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}2. Required environment variables${RESET}"

MISSING=0
check_var() {
  local var_name="$1"
  local var_val="${!var_name}"
  if [ -z "$var_val" ] || [[ "$var_val" == *"your-"* ]] || [[ "$var_val" == *"XXXXXXXXX"* ]]; then
    fail "$var_name — not set"
    MISSING=$((MISSING + 1))
  else
    ok "$var_name"
  fi
}

check_var "SLACK_BOT_TOKEN"
check_var "SLACK_APP_TOKEN"
check_var "SLACK_SIGNING_SECRET"
check_var "ANTHROPIC_API_KEY"
check_var "OWNER_SLACK_ID"

if [ $MISSING -gt 0 ]; then
  echo ""
  warn "$MISSING variable(s) still need to be set in .env"
  info "See section 3 below for Slack setup, then re-run this script."
fi

# Optional vars
echo ""
echo -e "${BOLD}   Optional variables${RESET}"
if [ -z "$CUSTOM_CONTEXT" ]; then
  warn "CUSTOM_CONTEXT — not set (AI mention classification will use no personal context)"
  info "Add a description of your role to .env → CUSTOM_CONTEXT=..."
else
  ok "CUSTOM_CONTEXT"
fi

# ── 3. Node version ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}3. Node.js version${RESET}"

if command -v node &>/dev/null; then
  NODE_VER=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
  if [ "$NODE_VER" -ge 18 ] 2>/dev/null; then
    ok "Node.js $(node --version)"
  else
    fail "Node.js $(node --version) — requires 18+. Use nvm: nvm install 20 && nvm use 20"
  fi
else
  warn "node not found — install Node.js 20 from https://nodejs.org or via nvm"
fi

# ── 4. Dependencies ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}4. Dependencies${RESET}"

if [ ! -d "node_modules" ] || [ ! -d "server/node_modules" ] || [ ! -d "client/node_modules" ]; then
  info "Installing dependencies (npm run install:all)…"
  npm run install:all
  ok "Dependencies installed"
else
  ok "node_modules present"
fi

# ── 5. Slack App Manifest ─────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}5. Slack App Setup${RESET}"
echo ""
echo "  Go to ${CYAN}https://api.slack.com/apps${RESET} → Create New App → From an app manifest"
echo "  Select your workspace, then paste the JSON below:"
echo ""
echo "────────────────────────────────────────────────────────────────────────────"

cat <<'MANIFEST'
{
  "display_information": {
    "name": "Opus",
    "description": "Personal Slack task manager — monitors channels, extracts tasks with AI.",
    "background_color": "#1a1a2e"
  },
  "features": {
    "bot_user": {
      "display_name": "Opus",
      "always_online": true
    },
    "app_home": {
      "home_tab_enabled": false,
      "messages_tab_enabled": true,
      "messages_tab_read_only_enabled": false
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read",
        "channels:history",
        "channels:read",
        "chat:write",
        "groups:history",
        "groups:read",
        "im:history",
        "im:read",
        "im:write",
        "mpim:history",
        "mpim:read",
        "mpim:write",
        "users:read"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "bot_events": [
        "app_mention",
        "message.channels",
        "message.groups",
        "message.im",
        "message.mpim"
      ]
    },
    "interactivity": {
      "is_enabled": false
    },
    "org_deploy_enabled": false,
    "socket_mode_enabled": true,
    "token_rotation_enabled": false
  }
}
MANIFEST

echo "────────────────────────────────────────────────────────────────────────────"
echo ""
echo "  After creating the app:"
echo ""
echo "  ${BOLD}SLACK_BOT_TOKEN${RESET}   → OAuth & Permissions → Bot User OAuth Token (xoxb-…)"
echo "  ${BOLD}SLACK_APP_TOKEN${RESET}   → Basic Information → App-Level Tokens → Generate Token"
echo "                      (name it anything, add ${CYAN}connections:write${RESET} scope) (xapp-…)"
echo "  ${BOLD}SLACK_SIGNING_SECRET${RESET} → Basic Information → Signing Secret → Show"
echo "  ${BOLD}OWNER_SLACK_ID${RESET}    → Slack → your profile → ⋯ → Copy Member ID (U0XXXXXXX)"
echo ""
echo "  Then: ${CYAN}Install to Workspace${RESET} and invite the bot to channels:"
echo "        /invite @Opus"
echo ""

# ── 6. Summary ────────────────────────────────────────────────────────────────
echo "────────────────────────────────────────"
if [ $MISSING -eq 0 ]; then
  echo ""
  echo -e "${GREEN}${BOLD}  All set! Start Opus with:${RESET}"
  echo ""
  echo "    npm run dev          # dev mode (server :3001 + client :5173)"
  echo ""
  echo "    — or —"
  echo ""
  echo "    docker compose up    # production build, single container on :3001"
  echo ""
else
  echo ""
  warn "Fill in the $MISSING missing variable(s) in .env, then re-run: ${CYAN}bash setup.sh${RESET}"
  echo ""
fi
