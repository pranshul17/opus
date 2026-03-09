# ⚡ Opus — Personal Slack Task Manager

> Monitor your Slack channels, extract tasks with AI, and manage everything from a clean dashboard — without leaving your workflow.

Opus sits quietly in your Slack workspace, reads your channels, and uses AI to surface what actually needs your attention. Tasks get created automatically. @mentions get classified. Your bot understands plain English commands.

**No cloud AI account required.** Opus can run a model fully in-process — just set `AI_PROVIDER=local` and it downloads a model on first run. Or bring your own Anthropic/Groq/OpenAI key.

---

<!-- Replace with an actual screenshot or GIF of your dashboard -->
<!-- ![Opus Dashboard](docs/screenshot-dashboard.png) -->

---

## Features

| | Feature | What it does |
|---|---|---|
| 📡 | **Channel Monitoring** | Polls your Slack channels (P0 every 10 min, P1 every 30 min) |
| ✅ | **AI Task Extraction** | AI reads messages and creates structured tasks automatically |
| 🤖 | **Slack Bot Commands** | Manage tasks in Slack with natural language commands |
| 🔔 | **@Mention Tracking** | Every mention of you is AI-classified as a task, FYI, or noise |
| 📚 | **Reading List** | All shared links captured and catalogued with context |
| ✦ | **Knowledge Graph** | Visual map of how your tasks and links connect |
| 📋 | **Task Templates** | Variable-based templates for recurring task types |
| ⚡ | **Auto-Reply Rules** | Keyword, @mention, or regex triggers → auto-threaded Slack replies |
| 📊 | **AI Channel Digests** | AI-generated summaries on a schedule |
| 📤 | **Push to Slack** | Compose updates in the dashboard and push to selected channels |

---

## Quick Start

### Option A: Docker *(recommended — no Node.js required)*

```bash
git clone https://github.com/your-username/opus.git
cd opus
cp .env.example .env
# Fill in your Slack credentials (see Slack Setup below, or run `bash setup.sh`)
# Choose an AI backend — see "AI Setup" below
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

## AI Setup

Opus supports three AI backends. Pick one and set it in `.env`:

### 🏠 Local — no account, no internet, runs in-process

Uses [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) to run a model directly inside the Node.js process. No external service, no API key. Model downloads automatically on first run.

```bash
AI_PROVIDER=local
# That's it. Phi-3.5-mini (~2.3 GB) downloads on first inference.
```

**Pre-download the model** (recommended — avoids a delay on first use):
```bash
cd server && npm run download-model
```

To use a different model, drop any `.gguf` file into the `models/` directory, or:
```bash
npm run download-model -- hf:bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q4_K_M.gguf
```

**Recommended local models:**

| Model | Size | HuggingFace URI |
|---|---|---|
| **Phi-3.5-mini Q4_K_M** *(default)* | ~2.3 GB | `hf:bartowski/Phi-3.5-mini-instruct-GGUF/Phi-3.5-mini-instruct-Q4_K_M.gguf` |
| Llama 3.2 3B Q4_K_M | ~2.0 GB | `hf:bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q4_K_M.gguf` |
| Qwen 2.5 3B Q4_K_M | ~1.9 GB | `hf:bartowski/Qwen2.5-3B-Instruct-GGUF/Qwen2.5-3B-Instruct-Q4_K_M.gguf` |

> Phi-3.5-mini is the default because it's specifically strong at structured JSON output — critical for reliable task extraction from Slack messages.

---

### ☁️ Anthropic Claude — best quality

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key
ANTHROPIC_MODEL=claude-opus-4-6   # optional, this is the default
```

Get your key at [console.anthropic.com](https://console.anthropic.com/settings/api-keys). Cost for personal use is typically under $1/week.

---

### 🔌 OpenAI-compatible — Groq, Ollama, LM Studio, OpenAI, vLLM…

Any service that speaks the OpenAI chat-completions API works out of the box:

```bash
AI_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_BASE_URL=https://api.groq.com/openai/v1   # or any endpoint
OPENAI_COMPATIBLE_API_KEY=gsk_your-key
OPENAI_COMPATIBLE_MODEL=llama-3.3-70b-versatile
```

| Service | Base URL | Key |
|---|---|---|
| Groq *(fast, free tier)* | `https://api.groq.com/openai/v1` | Groq API key |
| Ollama *(local)* | `http://localhost:11434/v1` | `ollama` |
| LM Studio *(local)* | `http://localhost:1234/v1` | `lm-studio` |
| OpenAI | `https://api.openai.com/v1` | OpenAI API key |

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
| `AI_PROVIDER` | `anthropic` | `anthropic` · `local` · `openai-compatible` |
| `ANTHROPIC_API_KEY` | — | From console.anthropic.com *(anthropic provider)* |
| `ANTHROPIC_MODEL` | `claude-opus-4-6` | Anthropic model name |
| `LOCAL_MODEL_PATH` | *(auto)* | Path to a `.gguf` file; auto-downloads if blank *(local provider)* |
| `LOCAL_MODEL_HF_URI` | *(Phi-3.5-mini)* | HuggingFace URI to download if no model is found |
| `OPENAI_COMPATIBLE_BASE_URL` | `http://localhost:11434/v1` | API base URL *(openai-compatible provider)* |
| `OPENAI_COMPATIBLE_API_KEY` | `ollama` | API key for that endpoint |
| `OPENAI_COMPATIBLE_MODEL` | `llama3.2` | Model name at that endpoint |
| `OWNER_SLACK_ID` | — | Your Slack user ID — gates write bot commands |
| `CUSTOM_CONTEXT` | *(empty)* | Personal context for AI @mention classification |
| `PORT` | `3001` | Server port |
| `NODE_ENV` | `development` | Set to `production` in Docker |
| `P0_POLL_INTERVAL` | `10` | Minutes between P0 channel polls |
| `P1_POLL_INTERVAL` | `30` | Minutes between P1 channel polls |
| `HISTORY_HOURS` | `24` | Hours of Slack history to fetch on first channel poll |

### `CUSTOM_CONTEXT` tip

This is fed to the AI every time someone @mentions you. The better you describe yourself, the smarter the classification:

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
│       │   ├── ai-provider.ts  # AI router — anthropic / local / openai-compatible
│       │   ├── local-llm.ts    # In-process llama.cpp via node-llama-cpp
│       │   ├── claude.ts       # AI prompts — task extraction, digests, classification
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
├── models/                     # GGUF model files (gitignored, auto-downloaded)
├── data/opus.db                # SQLite database (auto-created, gitignored)
├── .env                        # Your credentials (gitignored)
├── .env.example                # Template — copy to .env
├── setup.sh                    # One-command setup + Slack manifest printer
├── Dockerfile                  # Multi-stage build (client + server → single image)
└── docker-compose.yml          # `docker compose up` and you're running
```

**Stack:** Node.js 20 · TypeScript · Express · SQLite (better-sqlite3) · React 18 · Vite · Slack Bolt SDK · node-llama-cpp · Anthropic SDK

**AI:** Pluggable provider system — swap between local llama.cpp inference, Anthropic Claude, or any OpenAI-compatible API via a single env var.

**Data storage:** Everything lives in a single SQLite file (`data/opus.db`). SQLite runs in WAL mode — crash-safe at the write level. In Docker, `data/` and `models/` are bind-mounted from your host machine so data is just a regular folder, never locked inside Docker.

---

## Running in Production (Docker)

```bash
# Build and start (first run takes ~2 min to build)
docker compose up -d

# View logs
docker compose logs -f

# Stop (data is safe — it lives in ./data on your machine)
docker compose down

# Upgrade (after pulling new code)
docker compose down
docker compose up -d --build
```

The container serves the React frontend as static files on the same port as the API (`:3001`). No need for a separate web server.

### Data persistence

`docker-compose.yml` uses **bind mounts** — your data lives directly on the host machine:

```
./data/opus.db    ← SQLite database  (survives everything)
./models/*.gguf   ← local AI model   (survives everything)
```

This means:
- Container crash → data is fine, container restarts from `restart: unless-stopped`
- `docker compose down` → data is fine (bind mounts are never touched by Docker)
- `docker compose down -v` → data is still fine (no named volumes to delete)
- Manual backup: `cp data/opus.db data/opus.db.bak`

SQLite also runs in **WAL mode** — if a crash happens mid-write, it recovers automatically on next start.

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

# Download a local model for offline AI:
cd server && npm run download-model
```

Migrations run automatically on server start — just add to the `migrations` array in `database.ts`.

---

## FAQ

**Does it work with private channels?**
Yes — invite the bot to any channel with `/invite @Opus`. It needs `groups:history` scope (included in the manifest).

**Does it read my DMs with other people?**
No. Slack's API only lets a bot read conversations it's a part of.

**Do I need an API key?**
No. Set `AI_PROVIDER=local` and Opus runs a model in-process — no account, no key, no internet required for inference. The model (~2.3 GB) downloads once from HuggingFace on first use, then works fully offline.

**How much does the Anthropic API cost?**
Very little for personal use. Task extraction uses ~500 tokens per batch of messages. @mention classification uses ~400 tokens per mention. A typical week of moderate usage is well under $1.

**Can I run multiple instances for different people on the same workspace?**
Yes — create a separate Slack App per person, each with their own `OWNER_SLACK_ID`.

**Where is my data stored?**
Locally, in `data/opus.db` (a SQLite file). With `AI_PROVIDER=local`, nothing leaves your machine at all. With other providers, message text is sent to the respective AI API for analysis.

---

## Contributing

PRs welcome. The codebase is intentionally simple — no ORM, no framework magic, just TypeScript + SQLite + Express.

1. Fork + clone
2. `bash setup.sh` (needs your own Slack app for testing)
3. Make changes
4. Open a PR

---

*Built with [Claude Code](https://claude.ai/claude-code)*
