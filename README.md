# ⚡ Opus — Personal Slack Task Manager

> Monitor your Slack channels, extract tasks with AI, and manage everything from a clean dashboard — without leaving your workflow.

Opus sits quietly in your Slack workspace, reads your channels, and uses Claude to surface what actually needs your attention. Tasks get created automatically. @mentions get classified. Your bot understands plain English commands.

---

<!-- Replace with an actual screenshot or GIF of your dashboard -->
<!-- ![Opus Dashboard](docs/screenshot-dashboard.png) -->

---

## Features

| | Feature | What it does |
|---|---|---|
| 📡 | **Channel Monitoring** | Polls your Slack channels (P0 every 10 min, P1 every 30 min) |
| ✅ | **AI Task Extraction** | Claude reads messages and creates structured tasks automatically |
| 🤖 | **Slack Bot Commands** | Manage tasks in Slack with natural language commands |
| 🔔 | **@Mention Tracking** | Every mention of you is AI-classified as a task, FYI, or noise |
| 📚 | **Reading List** | All shared links captured and catalogued with context |
| ✦ | **Knowledge Graph** | Visual map of how your tasks and links connect |
| 📋 | **Task Templates** | Variable-based templates for recurring task types |
| ⚡ | **Auto-Reply Rules** | Keyword, @mention, or regex triggers → auto-threaded Slack replies |
| 📊 | **AI Channel Digests** | Claude-generated summaries on a schedule |
| 📤 | **Push to Slack** | Compose updates in the dashboard and push to selected channels |

---

## Quick Start

### Option A: Docker *(recommended — no Node.js required)*

```bash
git clone https://github.com/your-username/opus.git
cd opus
cp .env.example .env
# Fill in your credentials (see Slack Setup below, or run `bash setup.sh`)
docker compose up
```

Open **http://localhost:3001**

---

### Option B: Manual *(Node.js 20+)*

```bash
git clone https://github.com/your-username/opus.git
cd opus
bash setup.sh          # validates config + installs deps + prints Slack manifest
# Fill in .env with your credentials
npm run dev            # starts both server (:3001) and client (:5173)
```

Open **http://localhost:5173**

---

## Slack App Setup

Opus uses Socket Mode — no public URL or server exposure required. Everything connects outbound through a persistent WebSocket.

---

### Option A — Manifest (fastest, ~2 min)

The `setup.sh` script generates the exact JSON to paste:

```bash
bash setup.sh   # prints the manifest, then follow steps 2–4 below
```

Or copy the manifest manually from [`setup.sh`](./setup.sh) (look for the `MANIFEST` heredoc).

1. Go to **https://api.slack.com/apps** → **Create New App** → **From an app manifest**
2. Select your workspace → paste the JSON → **Next** → **Create**
3. Skip to [step 3 (credentials)](#3-copy-credentials-into-env) below

---

### Option B — Manual setup (step by step)

#### 1. Create the app
1. Go to **https://api.slack.com/apps** → **Create New App** → **From scratch**
2. Give it a name (e.g. `Opus`) and select your workspace → **Create App**

#### 2. Enable Socket Mode
1. Left sidebar → **Settings** → **Socket Mode** → toggle **Enable Socket Mode** ON
2. You'll be prompted to create an App-Level Token — name it anything (e.g. `opus-socket`)
3. Add the scope **`connections:write`** → **Generate**
4. Copy the token (starts with `xapp-`) → this is your `SLACK_APP_TOKEN`

#### 3. Add Bot Token Scopes
Left sidebar → **Features** → **OAuth & Permissions** → scroll to **Bot Token Scopes** → **Add an OAuth Scope**

Add all of the following:

| Scope | Why Opus needs it |
|---|---|
| `app_mentions:read` | Receive events when someone @mentions the bot |
| `channels:history` | Read messages from public channels the bot is in |
| `channels:read` | List public channels (for channel setup UI) |
| `chat:write` | Post messages and replies |
| `groups:history` | Read messages from private channels the bot is in |
| `groups:read` | List private channels |
| `im:history` | Read DMs sent directly to the bot |
| `im:read` | View DM metadata |
| `im:write` | Send DMs (for bot replies) |
| `mpim:history` | Read group DMs that include the bot |
| `mpim:read` | View group DM metadata |
| `mpim:write` | Send messages in group DMs |
| `users:read` | Look up user display names |

#### 4. Subscribe to Bot Events
Left sidebar → **Features** → **Event Subscriptions** → toggle **Enable Events** ON

Under **Subscribe to bot events** → **Add Bot User Event**, add:

| Event | Triggers when… |
|---|---|
| `app_mention` | Someone @mentions the bot in any channel or DM |
| `message.channels` | A message is posted in a public channel the bot is in |
| `message.groups` | A message is posted in a private channel the bot is in |
| `message.im` | Someone sends a DM directly to the bot |
| `message.mpim` | A message is posted in a group DM with the bot |

Click **Save Changes**.

#### 5. Enable the Messages Tab (for DMs)
Left sidebar → **Features** → **App Home** → scroll to **Show Tabs**
Toggle ON: **"Allow users to send Slash commands and messages from the messages tab"**

This makes the bot DM-able from the Slack UI.

---

### 3. Copy credentials into `.env`

| `.env` variable | Where to find it |
|---|---|
| `SLACK_BOT_TOKEN` | **OAuth & Permissions** → *Bot User OAuth Token* (`xoxb-…`) |
| `SLACK_APP_TOKEN` | **Basic Information** → *App-Level Tokens* → your token (`xapp-…`) |
| `SLACK_SIGNING_SECRET` | **Basic Information** → *App Credentials* → *Signing Secret* → **Show** |
| `OWNER_SLACK_ID` | In Slack: click your name → **View Profile** → **⋯** → **Copy Member ID** (`U0XXXXXXX`) |

### 4. Install to workspace and invite the bot

1. Left sidebar → **Settings** → **Install App** → **Install to Workspace** → **Allow**
2. Copy the **Bot User OAuth Token** → paste into `.env` as `SLACK_BOT_TOKEN`
3. In each Slack channel you want to monitor: `/invite @Opus`

> **That's it.** Add channels in the Opus dashboard (Channels → Add Channel), and the bot starts monitoring immediately.

---

## Bot Commands

All commands start with `@Opus` in any channel or DM where the bot is present.

### Owner Commands *(only you)*

| Command | Example | What it does |
|---|---|---|
| `task: <title>` | `task: Fix login bug by Friday high` | Create a task with optional due date and priority |
| `done: <title>` | `done: login bug` | Close a task by fuzzy title match |
| `blocker: <text>` | `blocker: waiting on infra team` | Add a blocker to the most recent open task |
| `assign: <title> → @user` | `assign: login bug → @alice` | Reassign a task |
| `status` | `status` | Channel overview — open tasks, blockers, high-priority |
| `status <title>` | `status login bug` | Deep-dive on a specific task (all fields + history) |
| `digest` | `digest` | Trigger an AI channel digest right now |
| `summary` | `summary` | Show the latest AI channel summary |
| `help` | `help` | List all commands |

**Date formats:** `today` · `tomorrow` · `Friday` · `next week` · `2026-03-15`
**Priority words:** `high` / `urgent` / `asap` / `critical` → 🔴 · `low` → 🟢 · everything else → 🟡

### Public Commands *(anyone in the channel)*

| Command | What it does |
|---|---|
| `@Opus status` | See open tasks and blockers for this channel |
| `@Opus status <title>` | Look up a specific task |
| `@Opus help` | Show available commands |

---

## Configuration

All configuration lives in `.env`. Copy `.env.example` to get started.

| Variable | Default | Description |
|---|---|---|
| `SLACK_BOT_TOKEN` | — | `xoxb-…` from OAuth & Permissions |
| `SLACK_APP_TOKEN` | — | `xapp-…` from App-Level Tokens (Socket Mode) |
| `SLACK_SIGNING_SECRET` | — | From Basic Information |
| `ANTHROPIC_API_KEY` | — | From console.anthropic.com |
| `OWNER_SLACK_ID` | — | Your Slack user ID — gates write commands |
| `CUSTOM_CONTEXT` | *(empty)* | Personal context for AI @mention classification |
| `PORT` | `3001` | Server port |
| `NODE_ENV` | `development` | Set to `production` in Docker |
| `P0_POLL_INTERVAL` | `10` | Minutes between P0 channel polls |
| `P1_POLL_INTERVAL` | `30` | Minutes between P1 channel polls |
| `HISTORY_HOURS` | `24` | Hours of Slack history to fetch on first channel poll |

### `CUSTOM_CONTEXT` tip

This is fed to Claude every time someone @mentions you. The better you describe yourself, the smarter the classification:

```
I'm a backend engineer at a 20-person startup. My manager is @alice and my team
is @bob and @carol. Treat anything from my manager or the #incidents channel as
high-priority. Bug reports and requests for my review are tasks. Status updates,
FYIs, and general chatter are not tasks.
```

You can set this in the **Settings → AI** section of the dashboard too.

---

## Architecture

```
opus/
├── server/                     # Node.js + Express API (port 3001)
│   └── src/
│       ├── db/database.ts      # SQLite schema, migrations, all queries
│       ├── slack/bot.ts        # Slack Bolt app (Socket Mode)
│       ├── services/
│       │   ├── claude.ts       # Anthropic API — task extraction, digests, classification
│       │   ├── channel-monitor.ts  # Slack polling + AI extraction pipeline
│       │   ├── bot-commands.ts # Bot command dispatch + owner mention handling
│       │   ├── auto-responder.ts   # Auto-reply rule evaluation
│       │   └── scheduler.ts    # Cron jobs (polling + digest scheduling)
│       └── routes/             # REST API endpoints (/api/*)
│
├── client/                     # React + Vite frontend (port 5173 in dev)
│   └── src/
│       ├── pages/              # Dashboard, Channels, Tasks, Mentions, Links, …
│       └── api/client.ts       # Typed fetch wrapper for all API calls
│
├── data/opus.db                # SQLite database (auto-created, gitignored)
├── .env                        # Your credentials (gitignored)
├── .env.example                # Template — copy to .env
├── setup.sh                    # One-command setup + Slack manifest printer
├── Dockerfile                  # Multi-stage build (client + server → single image)
└── docker-compose.yml          # `docker compose up` and you're running
```

**Stack:** Node.js 20 · TypeScript · Express · SQLite (better-sqlite3) · React 18 · Vite · Slack Bolt SDK · Anthropic Claude API

**Data storage:** Everything lives in a single SQLite file (`data/opus.db`). No external database needed. The Docker volume keeps it persistent.

---

## Running in Production (Docker)

```bash
# Build and start (first run takes ~2 min to build)
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Upgrade (after pulling new code)
docker compose down
docker compose up -d --build
```

The container serves the React frontend as static files on the same port as the API (`:3001`). No need for a separate web server.

---

## DM the Bot

To let users DM Opus (highly recommended — useful for personal task management):

1. Slack App dashboard → **App Home**
2. Under **Show Tabs**, toggle **"Allow users to send Slash commands and messages from the messages tab"** → ON

After reinstalling, users can open a DM with the bot and use all commands directly.

---

## Development

```bash
npm run install:all   # install root + server + client deps
npm run dev           # run both (concurrently)

# Or separately:
npm run dev --prefix server   # API on :3001, watches src/ with tsx
npm run dev --prefix client   # Vite dev server on :5173, proxies /api → :3001
```

Migrations run automatically on server start — just add to the `migrations` array in `database.ts`.

---

## FAQ

**Does it work with private channels?**
Yes — invite the bot to any channel with `/invite @Opus`. It needs `groups:history` scope (included in the manifest).

**Does it read my DMs with other people?**
No. Slack's API only lets a bot read conversations it's a part of.

**How much does the Anthropic API cost?**
Very little for personal use. Task extraction uses ~500 tokens per batch of messages. @mention classification uses ~400 tokens per mention. A typical week of moderate usage is well under $1.

**Can I run multiple instances for different people on the same workspace?**
Yes — create a separate Slack App per person, each with their own `OWNER_SLACK_ID`.

**Where is my data stored?**
Locally, in `data/opus.db` (a SQLite file). Nothing is sent to third parties except:
- Slack messages → Slack API (to read them)
- Message text → Anthropic API (for AI analysis)

---

## Contributing

PRs welcome. The codebase is intentionally simple — no ORM, no framework magic, just TypeScript + SQLite + Express.

1. Fork + clone
2. `bash setup.sh` (needs your own Slack app for testing)
3. Make changes
4. Open a PR

---

*Built with [Claude Code](https://claude.ai/claude-code)*
