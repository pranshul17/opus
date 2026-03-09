# ─────────────────────────────────────────────────────────────────────────────
# Opus — Multi-stage Docker build
# Produces a single container that serves both the API and the React frontend.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build React frontend ─────────────────────────────────────────────
FROM node:20-alpine AS client-builder
WORKDIR /app

COPY client/package*.json ./client/
RUN npm ci --prefix client

COPY client ./client
RUN npm run build --prefix client


# ── Stage 2: Compile TypeScript server ────────────────────────────────────────
FROM node:20-alpine AS server-builder
WORKDIR /app

COPY server/package*.json ./server/
RUN npm ci --prefix server

COPY server ./server
RUN npm run build --prefix server


# ── Stage 3: Lean runtime image ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Production server dependencies only
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev

# Compiled server JS
COPY --from=server-builder /app/server/dist ./server/dist

# Built React app (Express serves this as static files)
COPY --from=client-builder /app/client/dist ./client/dist

# SQLite data directory — mount a volume here to persist data
RUN mkdir -p /app/data

EXPOSE 3001
ENV NODE_ENV=production

CMD ["node", "server/dist/index.js"]
