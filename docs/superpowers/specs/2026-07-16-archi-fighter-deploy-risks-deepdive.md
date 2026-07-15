# Archi-Fighter Cloud Deploy — Risks Deep Dive

> Companion to `2026-07-16-archi-fighter-deploy-design.md`
> Methodology: obra/superpowers — `verification-before-completion` demands concrete mitigations with fallbacks and verification steps, not hand-waves.

This document covers all 15 original risks identified in the spec **plus** 7 new risks introduced by switching the realtime transport from server-relayed-WS to WebRTC P2P.

Each risk follows this structure:
- **Risk** — what goes wrong, in one sentence
- **Why it happens** — root cause
- **Mitigation** — concrete technical fix (with code/commands where useful)
- **Fallback** — what we do if the mitigation fails
- **Verification** — how we prove it works before claiming done

---

## Original 15 Risks

### R1. Deno Deploy isolate cold start

**Risk:** First request after idle takes 1–3 s to spin up an isolate. Players see a "loading..." pause before the menu appears.

**Why:** Deno Deploy spins down idle isolates to free resources. First request after idle must download code, init runtime, open DB pool. With Neon also cold, this compounds.

**Mitigation:**
1. Client `index.html` includes a fire-and-forget `<script>fetch(API_BASE + '/healthz', {mode:'no-cors'})</script>` in `<head>` — happens before user interacts.
2. `/healthz` route does `SELECT 1` against Neon — warms both the isolate and the DB pool.
3. Client `apiFetch` retries with exponential backoff: 1 s, 2 s, 4 s, max 3 retries.
4. UI shows "Connecting..." state instead of failing silently.

**Fallback:** If `/healthz` itself times out (>10 s), the client shows "Server is warming up, please wait..." with a manual "Retry" button.

**Verification:** Use `curl -w "\n%{time_total}\n"` against the deployed URL after 10 min idle. Confirm first response <3 s, second response <200 ms.

---

### R2. WebSocket disconnect on isolate rotation  →  **REVISED for WebRTC**

**Risk:** Originally this was about WS being killed by isolate rotation. With WebRTC P2P, the WS isn't used for fight inputs at all — but the signaling channel (still HTTP) and matchmaking state can still drop.

**Why:** Deno Deploy isolates can be rotated at any time. Any in-flight request to that isolate may fail with a 502/503. Matchmaking state stored only in isolate memory is lost.

**Mitigation:**
1. Matchmaking state lives in Deno KV (`rooms:pending`, `rooms:active`), never in isolate memory.
2. Signaling uses HTTP POST with idempotency keys (`Idempotency-Key: <uuid>`) — retried safely.
3. WebRTC connection itself is P2P — once established, it survives isolate rotation entirely. Only signaling breaks, and signaling is short-lived.
4. Client detects signaling failure (HTTP 5xx or timeout) and retries with backoff.

**Fallback:** If signaling fails 3× in a row, the client shows "Couldn't reach matchmaking server. Return to menu?" with two buttons.

**Verification:** During a 1v1 Online match (post-character-select, fight in progress), force-kill the isolate via Deno Deploy dashboard. Confirm the fight continues uninterrupted (P2P connection survives). Confirm post-fight stats POST retries successfully.

---

### R3. Concurrent writes to the same room (matchmaking race)

**Risk:** Two players click "Find Match" at the same millisecond. Both isolates read the pending-queue, both see it empty, both create new rooms. Players never get paired.

**Why:** Classic check-then-act race. Read-modify-write is not atomic across isolates.

**Mitigation:**
1. Use Deno KV's `kv.atomic().check(versionstamp).set(...)` for queue mutations.
2. Matchmaking flow: player reads queue head; if found, atomically pop + create room; if not found, atomically push self to queue.
3. On atomic-check failure (another isolate won), retry once with fresh state.
4. After 2 retries, fall back to "create new room, wait for opponent."

**Fallback:** If both retries fail, the player becomes the "creator" of a new room and waits. Worst case: two players both end up waiting — a 30 s timeout in the lobby kicks in, then both retry matchmaking.

**Verification:** Stress test with a Node script that fires 20 concurrent `POST /matchmaking/join` requests. Confirm exactly 10 rooms are created (no orphans, no duplicates), all 20 players end up paired.

---

### R4. Neon connection pool exhaustion

**Risk:** Each isolate opens its own Postgres connection. Under load, free-tier Neon caps (~100 concurrent) are exceeded, new connections refused.

**Why:** Neon free tier allows 100 concurrent connections to the primary endpoint. Without pooling, each Deno isolate holds 5–10 idle connections; 10 isolates = 50–100 connections; any spike saturates.

**Mitigation:**
1. Use Neon's **pooled connection string** (`-pooler` hostname). This multiplexes many client connections over a fixed pool of Postgres backends.
2. Set `@db/postgres` client with `max_pool_size: 3` and `idle_timeout: 10s` per isolate.
3. Use a single shared `db` instance per isolate (module-level singleton, already done in `database.ts`).
4. Add `connection_timeout: 5s` so a stuck pool fails fast instead of hanging the request.

**Fallback:** If pool still exhausts (we see `ECONNREFUSED` or `too many connections`), the client retries with backoff. Server logs the error to Deno Deploy logs so we can spot the pattern.

**Verification:** Open 20 browser tabs simultaneously, each calling `/players/me`. Confirm no 5xx errors. Check Neon dashboard: peak concurrent connections ≤10.

---

### R5. Migrations on a stateless server

**Risk:** Original code calls `runMigrations()` at server boot. On Deno Deploy, every isolate would run migrations on first request → races, duplicate DDL, possible schema corruption.

**Why:** `server.ts` calls `await runMigrations()` if `NODE_ENV !== "production"`. Even setting `NODE_ENV=production` doesn't fully solve this — migrations would just never run, so schema drifts.

**Mitigation:**
1. Remove `runMigrations()` call from `server.ts`.
2. Migrations become a separate `deno task db:migrate` script, invoked manually or via CI.
3. Make all DDL idempotent: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
4. Add a GitHub Action (`.github/workflows/migrate.yml`) that runs migrations on push to main, using `NEON_DATABASE_URL` secret.
5. Server boot checks schema version via a `schema_version` table; if mismatched, returns 503 with a clear error pointing to the missing migration.

**Fallback:** If a migration fails mid-deploy (network glitch, syntax error), the GitHub Action fails loudly, the deploy is blocked, and the previous server version keeps running. No downtime.

**Verification:** Trigger the migrate workflow on a branch with a new `ALTER TABLE` migration. Confirm it succeeds against a Neon branch DB. Confirm prod DB has the new column. Confirm prod server doesn't 500 after migration.

---

### R6. CORS with dynamic origin

**Risk:** Local dev (`localhost:8080`), Vercel preview deploys (`archi-fighter-git-<branch>-<user>.vercel.app`), and prod (`archi-fighter.vercel.app`) all need different CORS origins. A hardcoded `*` won't work for credentialed requests; a hardcoded list breaks preview deploys.

**Why:** `Access-Control-Allow-Origin` must echo the exact `Origin` header for credentialed requests to work. Browsers reject wildcards.

**Mitigation:**
1. Server reads `ALLOWED_ORIGINS` env var (comma-separated list).
2. CORS middleware checks `Origin` header against the list; if matched, reflects the exact origin in `Access-Control-Allow-Origin`.
3. Support a `ALLOWED_ORIGIN_REGEX` env var for preview-deploy patterns: `^https://archi-fighter-.*-nawaf-al-hussain\.vercel\.app$`.
4. Log unmatched origins so we can spot misconfiguration.

**Fallback:** If neither list nor regex matches, return 403 with `X-Debug-Reason: origin-not-allowed` — fail loud, not silent.

**Verification:** Curl the API with various `Origin` headers. Confirm correct reflection for allowed, 403 for disallowed. Open the deployed client in browser, confirm no CORS errors in console.

---

### R7. WebSocket on Deno Deploy — Oak compatibility  →  **OBSOLETE for WebRTC**

**Risk:** Oak's `ctx.upgrade()` doesn't work on Deno Deploy — it relies on Oak's request/response cycle, but Deploy's WS upgrade must happen via `Deno.upgradeWebSocket()` on the raw `Request`.

**Why:** Oak's `ctx.upgrade()` synchronously creates a `WebSocket` and returns it, but Deno Deploy's WS lifecycle is asynchronous and tied to the raw `Request`/`Response` pair.

**Mitigation:** ~~Bypass Oak for WS routes.~~ **Now obsolete:** with WebRTC P2P, there is no server-side WebSocket. All client-server communication is HTTP REST. Signaling between peers is HTTP POST to `/signal/:gameId/:peerId`.

**Fallback:** If we ever need server-side WS (e.g., for spectator mode), we'll use `Deno.upgradeWebSocket()` directly in a non-Oak route handler.

**Verification:** N/A — no WS to verify. Confirm all routes are HTTP in `routes/*.ts`.

---

### R8. Token in URL query string for WS  →  **OBSOLETE for WebRTC**

**Risk:** Original code passes `?token=<bearer>` in the WS URL. Tokens leak into server logs, browser history, Referer headers.

**Why:** Browser WebSocket API doesn't support custom headers, so auth has to go in the URL.

**Mitigation:** ~~Server-side log scrubber.~~ **Now obsolete:** with WebRTC P2P, there's no WS URL. All auth uses `Authorization: Bearer <token>` in HTTP headers — no URL exposure.

**Fallback:** N/A.

**Verification:** Confirm no `token=` appears in any URL the client constructs. Grep client code for `?token=` → should return zero matches.

---

### R9. Environment variables — local vs Deno Deploy

**Risk:** Original code reads `.env` via `@std/dotenv/load`. Deno Deploy has no `.env` file — env vars come from the dashboard. Local dev breaks if a dev forgets to copy `.env.example` to `.env`.

**Why:** `@std/dotenv/load` silently no-ops if `.env` is missing, so `Deno.env.get("DATABASE_URL")` returns `undefined` and the server crashes with a confusing connection error.

**Mitigation:**
1. Add a `server/config.ts` module that validates all required env vars at startup:
   ```ts
   const required = ["DATABASE_URL", "ALLOWED_ORIGINS"];
   for (const k of required) {
     if (!Deno.env.get(k)) throw new Error(`Missing env var: ${k}`);
   }
   ```
2. Server fails fast with a clear error message on missing vars.
3. `.env.example` lists every var with a description and example value.
4. README has a "First-time setup" section walking through copying `.env.example` to `.env`.

**Fallback:** N/A — fail-fast is the fallback.

**Verification:** Delete `.env`, run `deno task dev`. Confirm server exits with `Missing env var: DATABASE_URL` within 1 s. Restore `.env`, confirm server boots.

---

### R10. Vite build output path

**Risk:** Vite builds to `client/build/` (per `vite.config.js` `outDir: "build"`). Vercel's auto-detection expects `dist/`. Without config, Vercel serves nothing.

**Why:** Vercel's Vite preset assumes `dist/`. Our `vite.config.js` overrides to `build/`.

**Mitigation:**
1. Add `vercel.json` at repo root:
   ```json
   {
     "buildCommand": "cd client && npm install && npm run build",
     "outputDirectory": "client/build",
     "framework": "vite",
     "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   }
   ```
2. SPA rewrite ensures client-side routing (if added later) doesn't 404 on refresh.

**Fallback:** If `vercel.json` is misread, manually set Output Directory in Vercel project settings UI.

**Verification:** Trigger a Vercel deploy. Confirm `Build completed` and the deployed URL loads the game (not a Vercel 404 page).

---

### R11. Client-side API base URL

**Risk:** `client/services/api.service.js` hardcodes `http://localhost:3000/api/v1`. On Vercel, the client can't reach localhost.

**Why:** Original code assumed dev-only deployment.

**Mitigation:**
1. Replace hardcoded URL with `import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1"`.
2. Replace `ws://localhost:3000/api/v1` in `ws.manager.js` — but since we're going WebRTC, this file is being replaced entirely with a `RtcManager`.
3. Add `client/.env.example` documenting `VITE_API_BASE_URL=https://archi-fighter.deno.dev/api/v1`.
4. Set the var in Vercel project settings → Environment Variables.

**Fallback:** If env var is missing, the client falls back to localhost with a console warning: `[CONFIG] VITE_API_BASE_URL not set, falling back to localhost — this will not work in production`.

**Verification:** Run `cd client && VITE_API_BASE_URL=https://example.com/api/v1 npm run build && grep -r "example.com" build/`. Confirm the URL is baked in. Confirm localhost is NOT in the production bundle.

---

### R12. Phaser asset paths

**Risk:** Vite's `base` defaults to `/`. If Vercel serves the build at a subpath (rare, but happens with preview deploys on legacy projects), asset URLs break.

**Why:** Absolute asset paths (`/assets/foo.webp`) only work when the app is served from root.

**Mitigation:** Set `base: "./"` in `vite.config.js` so all asset URLs are relative (`./assets/foo.webp`). Safer for any deploy path.

**Fallback:** If relative paths break (some bundlers handle `./` poorly), switch to `base: "/"` and configure Vercel to always serve from root.

**Verification:** Open the deployed URL, open DevTools Network tab, confirm all assets load with 200 (not 404). Confirm asset URLs are relative (`./assets/...`) in the built HTML.

---

### R13. Deno Deploy subrequest limits  →  **RELAXED for WebRTC**

**Risk:** Free tier caps at 50 subrequests per request. A single WS message that triggers KV read + DB write + KV write could blow through this.

**Why:** Each `fetch()`, KV op, or DB query counts as a subrequest.

**Mitigation:** With WebRTC P2P, the server no longer processes per-input messages. Subrequests per request:
- `/matchmaking/join`: 1 KV read + 1 KV write = 2 subrequests. ✅
- `/signal/:gameId`: 1 KV read + 1 KV write = 2. ✅
- `/games` (create): 1 DB write = 1. ✅
- `/games/:id/finish`: 2 DB writes = 2. ✅

All well under 50. No special mitigation needed.

**Fallback:** If we ever add a complex endpoint that exceeds 50, split it into multiple requests or use a Deno Deploy background task.

**Verification:** Read the Deno Deploy logs after a full game (match → select → fight → finish). Confirm no `SubrequestLimitExceeded` errors.

---

### R14. Token theft via shared link

**Risk:** If a player shares their game's URL (which contains their token in the original code), they leak their account.

**Why:** Original code's invite URL is `https://host/?game_id=X&token=Y`. Sharing it shares the token.

**Mitigation:**
1. Separate "share token" from "auth token": `POST /games/:id/share-link` returns a one-time share token scoped to "join this game only".
2. Share URL: `https://host/?join=<share_token>` — contains share token, not auth token.
3. Recipient visits URL → client calls `POST /games/join?share_token=<token>` → server creates a new auth token for player 2, returns it.
4. Share token is single-use (deleted from KV after first use).

**Fallback:** If share token is reused (already consumed), server returns 410 Gone with "This invite link has expired. Ask for a new one."

**Verification:** Create a game, get share link. Visit it in two browsers simultaneously. Confirm first browser joins successfully, second gets 410. Confirm share token is not the same as auth token.

---

### R15. Cleanup of stale rooms

**Risk:** A player disconnects mid-fight. Room metadata lingers in Deno KV forever. Free tier storage fills up.

**Why:** KV has no automatic cleanup unless we set a TTL.

**Mitigation:**
1. Every KV room entry is written with `kv.set(key, value, { expireIn: 3600_000 })` (1 hour TTL).
2. On game finish, `kv.delete(key)` explicitly.
3. On 10-min inactivity (no signaling messages), the next signaling attempt returns 410 Gone, and both clients are told to return to menu.
4. Daily cron via Deno Deploy's scheduled functions sweeps any orphans (defensive — TTL should handle it).

**Fallback:** If a room survives 1 hour (TTL didn't fire), the daily cron catches it. Worst case: storage has a few orphan rooms taking <1 KB each — free tier is 1 GB, so even 1000 orphans is fine.

**Verification:** Start a 1v1 game, disconnect both clients abruptly. After 1 hour, query Deno KV via `deno kv` CLI — confirm the room key is gone.

---

## New WebRTC-Specific Risks

### R16. STUN/TURN availability and cost

**Risk:** WebRTC needs STUN (for NAT traversal) and ideally TURN (relay fallback for restrictive NATs). Most TURN providers charge or require a credit card.

**Why:** Without STUN, peers can't discover their public IP — WebRTC connection fails. Without TURN, peers behind symmetric NAT (corporate wifi, some mobile carriers) can't connect.

**Mitigation:**
1. **STUN:** Use Google's free public STUN servers (`stun:stun.l.google.com:19302`). No auth, no CC, no rate limit documented for hobby use.
2. **TURN:** Use OpenRelay by Metered.ca — free tier offers 1 GB/month TURN relay, no credit card required. Configure:
   ```js
   iceServers: [
     { urls: "stun:stun.l.google.com:19302" },
     { urls: "turn:openrelay.metered.ca:80",   username: "openrelay", credential: "openrelay" },
     { urls: "turn:openrelay.metered.ca:443",  username: "openrelay", credential: "openrelay" },
     { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelay", credential: "openrelay" },
   ]
   ```
3. Document that 1 GB/month is roughly 60–80 fights (each fight = ~15 MB of relayed data, since most fights don't relay — only ~20% of NAT scenarios need TURN).

**Fallback:** If OpenRelay is down or rate-limits us, players behind symmetric NAT see "Couldn't connect to opponent. Try a different network." The game still works for the ~80% of players on home wifi (where STUN alone suffices).

**Verification:** Use `https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/` with our ICE config. Confirm at least one STUN server returns candidates. Confirm TURN server returns a relay candidate. Manually test from a corporate network (if accessible) — confirm TURN relay works.

---

### R17. ICE negotiation failures on restrictive NAT

**Risk:** Even with STUN+TURN, some networks (hotel wifi, strict corporate firewalls) block UDP entirely. WebRTC connection never establishes.

**Why:** WebRTC prefers UDP. Some networks block outbound UDP. We need TCP fallback via TURN.

**Mitigation:**
1. Include TCP TURN endpoint in ICE config (already in R16 — `?transport=tcp`).
2. Set `iceTransportPolicy: "all"` (default) so relay candidates are accepted.
3. Set a 15 s ICE timeout — if no connection, fail with a clear message.
4. On ICE failure, the client shows: "Couldn't connect P2P. Possible causes: restrictive firewall, VPN, corporate network. Try a different network or use 1v1 Local mode."

**Fallback:** Document that 1v1 Online may not work on ~5–10% of networks. Recommend vs AI or 1v1 Local as fallback modes.

**Verification:** Test from three networks: home wifi, mobile hotspot, corporate VPN. Confirm connection establishes on at least 2/3. Document any failures in the README.

---

### R18. WebRTC connection state management

**Risk:** RTC peer connection has 8+ states (`new`, `connecting`, `connected`, `disconnected`, `failed`, `closed`, etc.). Client code that doesn't handle all of them hangs or crashes.

**Why:** Browsers fire `iceconnectionstatechange` and `connectionstatechange` at different times. Naive code only checks `connected` and `failed`.

**Mitigation:**
1. Centralize state handling in a `RtcManager` class with a state machine.
2. Map raw states to three logical states: `connecting`, `connected`, `disconnected`.
3. On `disconnected` (transient — e.g., wifi blip), start a 5 s timer; if state returns to `connected`, cancel timer; if timer fires, treat as `failed`.
4. On `failed`, attempt ICE restart once (`pc.setConfiguration({...}); pc.restartIce()`). If still failed after 10 s, give up.
5. UI shows: green dot = connected, yellow = connecting, red = failed.

**Fallback:** If ICE restart fails, offer "Return to Menu" or "Wait for Opponent" (in case they're reconnecting).

**Verification:** During a fight, unplug ethernet on player 1. Confirm player 2 sees "Opponent disconnected..." within 5 s. Replug. Confirm state returns to connected within 10 s. Kill the tab entirely. Confirm player 2 sees "Opponent left the match" within 5 s.

---

### R19. Tab-switching / visibility change causing connection freezes

**Risk:** Browsers throttle `setTimeout`/`setInterval` in background tabs. WebRTC's keepalive pings may stop, connection drops, fight freezes when player returns.

**Why:** Chrome/Firefox throttle JS timers to ~1 Hz in background tabs. WebRTC's data channel keepalives are browser-managed (not throttled), but our app-level heartbeat is throttled.

**Mitigation:**
1. Rely on WebRTC's built-in data channel keepalives (handled by the browser, not throttled).
2. On `visibilitychange` → visible, immediately send a "I'm back" ping. If no response in 3 s, assume disconnect.
3. Pause the fight (don't simulate) when tab is hidden — both clients pause, so no desync.
4. Show "Game paused (opponent tab inactive)" overlay on the other player's screen.

**Fallback:** If a player stays hidden >30 s, treat as disconnect and end the match.

**Verification:** Start a fight, switch tabs for 60 s, switch back. Confirm fight resumes without desync (both players' HP bars match). Confirm no JavaScript errors in console.

---

### R20. WebRTC data channel message size limits

**Risk:** RTCDataChannel has a max message size (16 KB default, up to 256 KB with negotiation). Sending a large payload (e.g., character sprite preload) crashes the channel.

**Why:** SCTP protocol underlying WebRTC has a MTU. Large messages must be chunked.

**Mitigation:**
1. Keep all P2P messages small — they're only: input actions (`{type:"input", action:"punch", t:12345}`), char_select sync (`{type:"char_ready", char_id:3}`), and round_end (`{type:"round_end", winner:1}`).
2. All messages < 200 bytes. No chunking needed.
3. Assert message size before send: `if (JSON.stringify(msg).length > 1000) throw new Error("Message too large")`.

**Fallback:** N/A — messages are tiny by design.

**Verification:** Add a debug counter for max message size sent. After a full game, confirm max < 1 KB.

---

### R21. Clock sync between peers for hit detection determinism

**Risk:** Each client runs its own physics simulation. Without clock sync, "I punched you at t=5000" might arrive at the opponent who's at t=5050 — punch misses or hits late.

**Why:** WebRTC has ~30–80 ms latency. Naive "send my state" approach causes hit detection to disagree between clients.

**Mitigation:**
1. **Lockstep model:** Both clients simulate at the same fixed timestep (60 Hz). Each client sends input + frame number. Opponent queues inputs and applies them at `frame + 3` (180 ms lookahead) to absorb latency.
2. If an input arrives late, the opponent rewinds and re-simulates the last N frames (rollback netcode, simplified).
3. Use `performance.now()` for frame timestamps; sync clocks at connection start via a 3-way ping-pong.
4. Cap rollback at 6 frames (100 ms) to avoid CPU spikes.

**Fallback:** If rollback is too complex for v1, use **input delay netcode**: both clients wait 4 frames (67 ms) before applying any input. Simpler, slightly laggier feel, but deterministic.

**Verification:** Two clients on different networks. Player 1 throws a punch at frame 100. Player 2's client receives it. Confirm player 2's HP bar decreases at frame 103–104 (within rollback window). Confirm both clients' HP bars agree at the end of the match.

---

### R22. Cheating via client-side input manipulation

**Risk:** Since the server no longer validates inputs (P2P), a malicious player can send fake "round_end: I win" messages or manipulate their client to always win hit detection.

**Why:** Server-relayed architecture lets the server arbitrate; P2P architecture trusts both clients.

**Mitigation:**
1. **Authoritative opponent model:** Each client is authoritative over its own fighter's HP. Player 1's HP is decided by Player 1's client; Player 2's HP is decided by Player 2's client. Incoming "I hit you" messages from the opponent are advisory — your client re-validates the hit against its own simulation.
2. **Round-end consensus:** Both clients must send `round_end` for the same winner. If they disagree, the server (contacted at end of round) is the tiebreaker.
3. **Final game result is server-validated:** `POST /games/:id/finish` requires both players' tokens to confirm the result; mismatched results are flagged as `disputed` and not counted in stats.

**Fallback:** If we detect a disputed result, both players see "Match result disputed — not counted in stats." Real cheaters get nothing; honest players just see a weird message.

**Verification:** Manually craft a malicious client that sends `round_end: winner=1` immediately. Confirm the honest client's `POST /finish` is rejected by the server (no consensus). Confirm no stats are written.

---

## Summary: risk→mitigation matrix

| # | Risk | Severity | Mitigation cost | Status |
|---|---|---|---|---|
| R1 | Cold start | Medium | Low | Warm-up ping + retries |
| R2 | Isolate rotation | Low (WebRTC) | Low | KV state + P2P survives |
| R3 | Matchmaking race | High | Medium | Deno KV atomic ops |
| R4 | DB pool exhaustion | Medium | Low | Neon pooler + small pools |
| R5 | Migration races | High | Medium | Move to CI, idempotent DDL |
| R6 | Dynamic CORS | Medium | Low | Env-driven origin reflection |
| R7 | Oak WS compat | N/A | 0 | Obsolete (WebRTC) |
| R8 | Token in URL | N/A | 0 | Obsolete (WebRTC) |
| R9 | Env var management | Low | Low | Fail-fast validation |
| R10 | Vite output path | Low | Low | vercel.json |
| R11 | Client API URL | Medium | Low | import.meta.env |
| R12 | Phaser asset paths | Low | Low | base: "./" |
| R13 | Subrequest limits | Low (WebRTC) | 0 | All endpoints ≤2 subrequests |
| R14 | Token theft via link | High | Medium | Single-use share tokens |
| R15 | Stale room cleanup | Low | Low | KV TTL + cron |
| R16 | STUN/TURN cost | High | Low | Google STUN + OpenRelay TURN |
| R17 | Restrictive NAT | Medium | Low | TCP TURN + clear error msg |
| R18 | RTC state mgmt | High | Medium | State machine + ICE restart |
| R19 | Tab-switch freezes | Medium | Low | Visibility API + pause |
| R20 | Message size limits | Low | 0 | All msgs <1 KB |
| R21 | Clock sync / determinism | High | High | Lockstep + rollback (or input delay) |
| R22 | Client-side cheating | Medium | Medium | Authoritative opponent + server consensus |

## Open questions for the user

1. **R21 — netcode model:** Rollback (better feel, harder code) or input delay (simpler, laggier)? My recommendation: **input delay for v1**, rollback as a v2 stretch goal.
2. **R22 — cheating tolerance:** Are you OK with the "authoritative opponent + server consensus" model, or do you want stricter server-side validation? My recommendation: keep it simple for a hobby demo.
3. **R16 — TURN provider:** OpenRelay free tier (1 GB/month, no CC) works for ~60–80 fights/month. If you expect more traffic, we'd need to revisit. My recommendation: start with OpenRelay, monitor usage.
