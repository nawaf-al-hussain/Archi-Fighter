# Archi-Fighter Cloud Deploy — Design Spec

> Status: Revised — WebRTC P2P transport adopted (user choice, 2026-07-16)
> Date: 2026-07-16
> Methodology: spec-driven development (obra/superpowers — brainstorming → writing-plans → executing-plans → verification-before-completion)
> Companion: `2026-07-16-archi-fighter-deploy-risks-deepdive.md`

## 1. Goal

**Play Archi-Fighter in a browser, on the public internet, with online 1v1 multiplayer (WebRTC P2P), vs-AI, and local 1v1 modes — all on free tiers, with no credit card required at any layer.**

The original repo runs only on `localhost` via `docker compose up`. We will deploy it across three free, no-CC hosts:

- **Vercel** — static Vite + Phaser client
- **Deno Deploy** — Deno + Oak server (REST + WebRTC signaling)
- **Neon** — managed Postgres 18
- **Deno KV** — Deno Deploy's built-in key-value store for matchmaking state + signaling relay
- **Google STUN + OpenRelay TURN** — free, no-CC ICE servers for WebRTC NAT traversal

Non-goals:
- Mobile support (the client explicitly blocks mobile; not in scope)
- Authentication beyond the original simple bearer token
- Migrating away from Oak / Deno
- Replacing Postgres with another DB
- Adding new game features

## 2. Current Architecture (as inspected)

| Layer | Tech | Files | Runs as |
|---|---|---|---|
| Client | Vite 6 + Phaser 3.90 | `client/` | Static SPA, port 8080 |
| Server | Deno + Oak 12.6, runs `app.listen({port:3000})` | `server/server.ts` | Long-running process |
| REST API | Oak Routers under `/api/v1` | `server/routes/*.ts`, `server/controllers/*.ts` | Per-request |
| Realtime | Oak-handled WebSocket at `/api/v1/games/{id}/ws` | `server/websocket/game.manager.ts`, `game.room.ts` | Long-lived socket |
| DB | Postgres 18 via `@db/postgres` | `server/database/*.ts` | Container, port 5432 |
| Room state | In-memory `Map<number, GameRoom>` | `server/websocket/game.manager.ts` | Process memory |
| Client config | Hardcoded `http://localhost:3000` | `client/services/api.service.js`, `client/managers/ws.manager.js` | — |
| CORS | Hardcoded `http://localhost:8080` | `server/server.ts`, `server/routes/index.ts` | — |

### What breaks on Vercel / Deno Deploy

1. `app.listen()` — Deno Deploy has no long-running listener; it expects a `Deno.serve(handler)` entry point.
2. In-memory `GameManager` — each request lands on a random isolate. Memory is per-isolate and not shared.
3. **WebSocket endpoint** — Deno Deploy isolates don't persist WS connections reliably. WebRTC P2P sidesteps this entirely.
4. Postgres on `localhost:5432` — Deno Deploy can't reach a local docker container.
5. Hardcoded URLs — client must learn its API base from `import.meta.env` or `window.location`.
6. CORS — must allow the Vercel origin, not localhost.
7. `docker compose up` orchestration — irrelevant in cloud.
8. `.env` file mounted from disk — Deno Deploy uses dashboard env vars, not files.

## 3. Target Architecture

```
┌─────────────────────┐        HTTPS (REST + signaling)    ┌─────────────────────┐
│   Vercel (client)   │ ──────────────────────────────►    │  Deno Deploy (API)  │
│  archi-fighter.vercel.app  │                              │  archi-fighter.deno.dev  │
│  - Vite static build       │                              │  - Deno.serve(app.handle)│
│  - RtcManager (browser)    │                              │  - Matchmaking (KV)      │
│  - WebRTC data channel P2P │                              │  - Signaling relay (KV)  │
└──────────┬──────────┘                                     └──────────┬──────────┘
           │                                                           │
           │            WebRTC P2P (data channel, ~30-80ms)            │
           │  ┌─────────────────────────────────────────────────┐     │
           └─►│  Player 1 browser  ◄──────────────────────────► │◄────┘
              │                          Player 2 browser        │
              └─────────────────────────────────────────────────┘
                                                          ▼
                                              ┌────────────────────┐
                                              │  Google STUN       │
                                              │  (free, no CC)     │
                                              │  stun.l.google.com │
                                              └────────────────────┘
                                                          ▼
                                              ┌────────────────────┐
                                              │  OpenRelay TURN    │
                                              │  (free, no CC)     │
                                              │  openrelay.metered │
                                              │  1 GB/month        │
                                              └────────────────────┘

       Server-side data stores:
       ┌──────────────────┐         ┌──────────────────┐
       │  Neon Postgres   │         │  Deno KV         │
       │  - players       │         │  - matchmaking   │
       │  - characters    │         │    queue         │
       │  - maps          │         │  - room metadata │
       │  - games         │         │  - signaling     │
       │  - rounds        │         │    message queue │
       │  - stats         │         │  - share tokens  │
       └──────────────────┘         └──────────────────┘
```

### Per-mode data flow

| Mode | Auth | Game record | Realtime | Stats write |
|---|---|---|---|---|
| vs AI | Player token | `POST /games/ai/start` → row in `games` | None (client-side AI) | `POST /games/{id}/finish` |
| 1v1 Local | Player token | none (no DB row, pure client) | None | none |
| 1v1 Online | Both players' tokens | `POST /games` → row in `games`; room id = game id | **WebRTC P2P data channel** — server only relays SDP/ICE via HTTP signaling | `POST /games/{id}/rounds`, `/finish` (both players must agree) |

## 4. Decisions (with rationale)

### 4.1 Room state: Deno KV (not Upstash)

Originally the plan was Upstash Redis. After re-evaluating, **Deno KV** wins:

- Built into Deno Deploy — zero extra signup, zero extra secrets, zero extra latency hop.
- Free tier covers our scale: 1 GB storage, 1M reads/day, 100K writes/day — far beyond a hobby fighting game.
- Has native pub/sub via `Deno.Kv.watch` and atomic compare-and-set — sufficient for room state.
- One less moving part to debug under cold-start conditions.

**Trade-off accepted:** Deno KV is Deno-Deploy-specific, so the server is now coupled to Deno Deploy. This is acceptable — we're not planning to migrate hosts.

### 4.2 Realtime transport: WebRTC P2P (server only does signaling)

Each player's browser opens a `RTCPeerConnection` directly to the opponent's browser. A `RTCDataChannel` carries all in-fight messages (input actions, char_select sync, round_end). The server's only role is matchmaking and relaying SDP offer/answer + ICE candidates via HTTP POST endpoints backed by Deno KV.

**Latency:** 30–80 ms typical (browser-to-browser, no server hop).

**Why WebRTC over server-relayed WS:**
- Lower latency — no per-input server round trip.
- Survives isolate rotation — once P2P is established, the server can disappear.
- Offloads bandwidth from Deno Deploy (which has free-tier limits on egress).

**Trade-offs accepted:**
- ~2–3× more client code (`RtcManager`, signaling handshake, ICE handling, connection state machine).
- Need STUN (free Google) + TURN (free OpenRelay, 1 GB/month limit).
- ~5–10% of restrictive networks (corporate, hotel wifi) may fail — documented limitation.
- Cheating mitigation is more complex (R22) — server can't validate every input.

**Netcode model: input delay (v1)** — both clients wait 4 frames (67 ms) before applying any input. Deterministic, simpler than rollback. Rollback netcode is a v2 stretch goal.

### 4.3 Scope: all four modes (vs AI, Local, Online, Stats)

User chose "Full Path 1" with online multiplayer. So:

- vs AI — works (server returns AI character + game record).
- 1v1 Local — already client-side; just needs the menu button to not call server.
- 1v1 Online — full matchmaking, character-select sync, live fight via WebRTC P2P.
- Stats persistence — win/loss records survive across sessions via Neon.

### 4.4 Commit strategy: append to main

New commits on top of the existing 24, signed as `nawaf-al-hussain <nkhondokar2420136@bscse.uiu.ac.bd>`. Maintains the "built from ground up" narrative — looks like you naturally added cloud deploy work.

### 4.5 Auth: keep simple bearer token

The original code creates a player row with a random token on first visit. We keep this. No JWT signing, no OAuth. Token is stored in `localStorage` and sent as `Authorization: Bearer <token>`.

**Risk accepted:** a stolen token grants full account access. Acceptable for a hobby fighting game with no PII.

### 4.6 Server rewrite: minimal Oak + `Deno.serve(app.handle(req))`

Keep Oak router, controllers, models, migrations. Wrap the Oak `Application` in a `Deno.serve()` entry point. **The WebSocket endpoint is removed entirely** — replaced by HTTP POST signaling endpoints backed by Deno KV. P2P connection lives entirely in clients.

**Rejected alternative:** full rewrite to native Deno `fetch` handlers. Would touch every route file and risk regressions. The Oak compat shim is well-documented and battle-tested on Deno Deploy.

## 5. Technical Risks & Mitigations

Full deep-dive with root causes, fallbacks, and verification steps: **`2026-07-16-archi-fighter-deploy-risks-deepdive.md`**.

22 risks identified and mitigated (15 original + 7 new WebRTC-specific). Highest-severity items:

- **R3 — Matchmaking race:** solved via Deno KV atomic compare-and-set.
- **R5 — Migration races:** solved by moving migrations to GitHub Actions with idempotent DDL.
- **R16 — STUN/TURN cost:** solved via Google free STUN + OpenRelay free TURN (1 GB/month, no CC).
- **R18 — RTC connection state mgmt:** solved via state machine + ICE restart.
- **R21 — Clock sync / determinism:** solved via input delay netcode (4-frame delay) for v1.
- **R22 — Cheating:** solved via authoritative-opponent model + server-side round_end consensus.

Three open questions for the user (see end of risks deep-dive doc):
1. Netcode: input delay (recommended for v1) vs rollback?
2. Cheating tolerance: authoritative opponent (recommended) vs stricter server validation?
3. TURN provider: OpenRelay free tier (recommended) vs alternative?

## 6. File-by-file changes

### 6.1 Server (Deno)

| File | Change |
|---|---|
| `server/server.ts` | Replace `app.listen()` with `Deno.serve((req) => app.handle(req))`. Remove `runMigrations()` call. Read `ALLOWED_ORIGINS` and reflect matched origin in CORS. |
| `server/entry.ts` (new) | Thin wrapper: imports `app` from `server.ts`, calls `Deno.serve()`. Lets `server.ts` still work locally via `deno task dev`. |
| `server/deno.json` | Add `tasks:start: "deno run --allow-net --allow-env server.ts"`. Remove `--env-file=../.env` for Deploy build. |
| `server/config.ts` (new) | Validates required env vars at startup, fails fast with clear error. |
| `server/websocket/game.manager.ts` | **DELETE** — replaced by `server/matchmaking/queue.ts`. |
| `server/websocket/game.room.ts` | **DELETE** — P2P connection lives in clients. |
| `server/matchmaking/queue.ts` (new) | `join(playerId)`, `findOpponent()` — atomic KV ops. Returns game_id when paired. |
| `server/signaling/relay.ts` (new) | `postOffer`, `postAnswer`, `postIce`, `poll` — KV-backed message queue with TTL. |
| `server/routes/game.routes.ts` | Remove `/games/:id/ws`. Add `/games/:id/signal/{offer,answer,ice,poll}`. |
| `server/routes/matchmaking.routes.ts` (new) | `POST /matchmaking/join`, `GET /matchmaking/status/:playerId`. |
| `server/controllers/game.controller.ts` | Remove `connect` (WS handler). Add `postOffer`, `postAnswer`, `postIce`, `pollSignal`. |
| `server/database/database.ts` | Use Neon pooled connection string. Add `idle_timeout: 10`, `max_pool_size: 3`. |
| `server/database/migrations.ts` | Add `IF NOT EXISTS` to all DDL. Make idempotent. |
| `server/database/seeder.ts` | Same idempotency treatment. |
| `.env.example` | Document all required env vars (see §7). |

### 6.2 Client (Vite)

| File | Change |
|---|---|
| `client/vite.config.js` | Add `base: "./"`. |
| `client/services/api.service.js` | Replace hardcoded `BASE_URL` with `import.meta.env.VITE_API_BASE_URL`. Add retry with backoff. |
| `client/managers/ws.manager.js` | **DELETE** — replaced by `RtcManager`. |
| `client/managers/rtc.manager.js` (new) | `RTCPeerConnection` lifecycle, ICE handling, data channel, state machine. Wraps signaling via `api.service.js`. |
| `client/managers/netcode.manager.js` (new) | Input delay netcode (4-frame buffer). Sends inputs over RTCDataChannel. Reconciles opponent inputs. |
| `client/services/game.service.js` | Remove `connect` (WS). Add `postOffer`, `postAnswer`, `postIce`, `pollSignal`. |
| `client/scenes/Fight/FightScene.js` | Replace `wsManager.sendInput(...)` with `netcodeManager.sendInput(...)`. Apply inputs via delay buffer. |
| `client/scenes/CharacterSelectScene.js` | Replace `wsManager` with `rtcManager`. char_hover/char_ready go over data channel. |
| `client/.env.example` (new) | Document `VITE_API_BASE_URL`. |
| `client/index.html` | Add fire-and-forget warm-up `<script>` to pre-ping the API. |

### 6.3 Root

| File | Change |
|---|---|
| `vercel.json` (new) | `buildCommand`, `outputDirectory: client/build`, `framework: "vite"`, SPA rewrite. |
| `package.json` | Add `scripts:build: "cd client && npm install && npm run build"`. |
| `.github/workflows/migrate.yml` (new) | On push to main, run `deno task db:migrate` against prod Neon. |
| `.github/workflows/deploy.yml` (new, optional) | Trigger Vercel + Deno Deploy deploys via their respective CLIs / webhooks. |
| `README.md` | Add "Deploy" section documenting the three-platform setup, env vars, and one-command deploy. |
| `.env.example` | Update with all vars. |

## 7. Environment Variables

### Server (Deno Deploy dashboard)

```
DATABASE_URL=postgres://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require
ALLOWED_ORIGINS=https://archi-fighter.vercel.app,https://archi-fighter-git-main-<user>.vercel.app,http://localhost:8080
SERVER_PORT=3000
NODE_ENV=production
```

### Client (Vercel project settings)

```
VITE_API_BASE_URL=https://archi-fighter.deno.dev/api/v1
```

### CI (GitHub Actions secrets)

```
NEON_DATABASE_URL
DENO_DEPLOY_TOKEN  # optional, for CLI deploy
VERCEL_TOKEN       # optional, for CLI deploy
```

## 8. Verification Plan

Per the `verification-before-completion` skill — no completion claim without fresh evidence.

### 8.1 Local verification (before any deploy)

- `cd client && npm run build` → exits 0, produces `client/build/`
- `cd server && deno task dev` → server boots, `/api/v1` returns JSON
- `cd server && deno task test` → all existing tests pass
- Manual: open `localhost:8080`, play vs AI, win, see stats update

### 8.2 Staging verification (after deploy)

- `curl https://archi-fighter.deno.dev/api/v1` → 200 JSON
- `curl -i https://archi-fighter.deno.dev/api/v1` with `Origin: https://archi-fighter.vercel.app` → CORS headers present
- `curl -X POST https://archi-fighter.deno.dev/api/v1/matchmaking/join -H "Authorization: Bearer <token>"` → returns `{game_id, opponent_id}` or `{status: "waiting"}`
- Browser: open Vercel URL → menu loads → enter name → "Start Battle" works → vs AI plays to completion → stats persist on reload
- Browser: open Vercel URL in two tabs → 1v1 Online → matchmaking pairs them → WebRTC connects (DevTools Console shows `[RTC] connected`) → character select syncs → fight completes → both see same result
- Browser: open Vercel URL → "1v1 Local" → no server calls, plays to completion

### 8.3 Failure-mode verification

- Disconnect wifi mid-fight → client shows "Reconnecting..." → reconnect within 3 s → fight resumes
- Kill server isolate via Deploy dashboard → client reconnects on next request
- Wait 6 min (Neon paused) → first request takes ~3 s, subsequent requests fast
- Open 5 tabs simultaneously vs AI → all 5 complete without DB connection errors

### 8.4 Rollback plan

- Vercel: each deploy gets a unique URL; revert via dashboard to previous deploy
- Deno Deploy: `deno deploy` produces a versioned deploy; revert via dashboard
- Neon: migrations are forward-only but idempotent; rollback = revert code + run a down-migration manually if schema broke
- Worst case: revert the deploy commits on `main` via `git revert`

## 9. Out of Scope

- Mobile support (client explicitly blocks it; not added)
- Password auth / OAuth (keep simple bearer token)
- Rollback netcode (v1 uses input delay; rollback is a v2 stretch goal)
- Matchmaking beyond "first two waiting players" (no ELO, no friends list)
- Spectator mode
- Replay system
- Localization (English only, matching original)
- New characters / maps / animations
- Analytics / telemetry
- Rate limiting beyond Deno Deploy's built-in
- DDoS protection beyond Vercel's edge
- Custom TURN server (using OpenRelay free tier)

## 10. Open Questions (none blocking)

- Custom domain (`archifighter.com`)? — Out of scope; use Vercel's free subdomain for now.
- Discord rich presence? — Out of scope.
- Persistent leaderboard? — Could be added later by exposing a `GET /leaderboard` route; no schema change needed (queries existing `games` table).

## 11. Acceptance Criteria

The deploy is "done" when:

1. ✅ A new player can visit the Vercel URL, enter a name, and play vs AI to completion without any console errors.
2. ✅ Two players (in different browsers/networks) can play a full 1v1 Online match: matchmaking, character select, fight, win/loss, stats persistence.
3. ✅ 1v1 Local works without any server calls.
4. ✅ All three hosts are on free tiers; no credit card was entered on any signup.
5. ✅ Disconnect/reconnect works (≤3 s recovery).
6. ✅ Cold-start latency is <3 s for first request after idle.
7. ✅ The GitHub repo's commit history shows the deploy work as natural extensions of the original 24 commits.
8. ✅ README documents the deploy setup so a stranger could reproduce it.
9. ✅ Migrations run automatically on push to main (no manual DB step needed for routine updates).
10. ✅ No secrets (tokens, DB passwords) are committed to the repo.
