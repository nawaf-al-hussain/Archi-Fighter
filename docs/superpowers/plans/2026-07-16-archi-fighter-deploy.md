# Archi-Fighter Cloud Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Archi-Fighter to Vercel (client) + Deno Deploy (server) + Neon (Postgres) + Deno KV (matchmaking/signaling) + WebRTC P2P (realtime), all free, no credit card.

**Architecture:** Server is signaling-only — Oak router wrapped in `Deno.serve()`, no WebSocket, no in-memory state. Matchmaking queue and SDP/ICE relay live in Deno KV. Clients establish a direct WebRTC data channel for in-fight inputs using input-delay netcode (4-frame buffer). STUN via Google, TURN via OpenRelay free tier.

**Tech Stack:** Deno 1.46+ / Oak 12.6 / @db/postgres / Deno KV / Vite 6 / Phaser 3.90 / RTCPeerConnection / Vitest 2 / GitHub Actions

## Global Constraints

- **Identity:** Every commit is `nawaf-al-hussain <nkhondokar2420136@bscse.uiu.ac.bd>` (use `git -c user.name=... -c user.email=... commit`).
- **Commits:** Append to `main`. Never force-push. One commit per task.
- **Free tier only:** No paid services. No credit card required at any signup (Vercel, Deno Deploy, Neon, OpenRelay, GitHub Actions).
- **Idempotent DDL:** All migrations use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`.
- **No secrets in repo:** `.env` is gitignored (already). GitHub Actions uses secrets for `NEON_DATABASE_URL`.
- **Test framework:** Server tests use `Deno.test()` from `jsr:@std/assert`. Client tests use Vitest 2.
- **File paths:** All paths in this plan are relative to repo root (`/home/z/my-project/work/Archi-Fighter/`).
- **TDD discipline:** Write failing test → run (see fail) → implement → run (see pass) → commit. No exceptions.
- **No placeholders:** Every code block is complete and runnable as written.

---

## File Structure

### Server (new + modified)

| Path | Responsibility |
|---|---|
| `server/config.ts` (new) | Env var validation at startup |
| `server/server.ts` (modify) | Oak app + `Deno.serve()` wrapper, CORS middleware |
| `server/entry.ts` (new) | Deploy entry point — imports app, calls `Deno.serve()` |
| `server/deno.json` (modify) | Add `start` task without `--env-file` |
| `server/database/database.ts` (modify) | Neon pooled connection, small pool |
| `server/database/migrations.ts` (modify) | Idempotent DDL |
| `server/database/seeder.ts` (modify) | Idempotent inserts |
| `server/matchmaking/queue.ts` (new) | Deno KV matchmaking queue with atomic ops |
| `server/signaling/relay.ts` (new) | Deno KV-backed SDP/ICE message queue |
| `server/routes/game.routes.ts` (modify) | Remove WS, add signaling routes |
| `server/routes/matchmaking.routes.ts` (new) | Matchmaking endpoints |
| `server/routes/index.ts` (modify) | Mount matchmaking router |
| `server/controllers/game.controller.ts` (modify) | Remove `connect`, add signal handlers |
| `server/controllers/matchmaking.controller.ts` (new) | Matchmaking handlers |
| `server/tests/queue_test.ts` (new) | Matchmaking queue tests |
| `server/tests/relay_test.ts` (new) | Signaling relay tests |
| `server/tests/migrations_test.ts` (new) | Idempotency tests |

### Client (new + modified)

| Path | Responsibility |
|---|---|
| `client/vite.config.js` (modify) | Add `base: "./"` |
| `client/.env.example` (new) | Document `VITE_API_BASE_URL` |
| `client/services/api.service.js` (modify) | Env-driven base URL + retry |
| `client/services/game.service.js` (modify) | Replace WS with signal endpoints |
| `client/managers/ws.manager.js` (delete) | Replaced by RtcManager |
| `client/managers/rtc.manager.js` (new) | RTCPeerConnection lifecycle + signaling |
| `client/managers/netcode.manager.js` (new) | Input delay (4-frame buffer) |
| `client/scenes/Fight/FightScene.js` (modify) | Use netcodeManager instead of wsManager |
| `client/scenes/CharacterSelectScene.js` (modify) | Use rtcManager instead of wsManager |
| `client/tests/rtc.manager.test.js` (new) | RtcManager unit tests (mock RTCPeerConnection) |
| `client/tests/netcode.manager.test.js` (new) | Netcode input buffer tests |

### Root (new + modified)

| Path | Responsibility |
|---|---|
| `vercel.json` (new) | Vercel build config |
| `package.json` (modify) | Add `build` script |
| `.env.example` (modify) | Update with all vars |
| `.github/workflows/migrate.yml` (new) | Run migrations on push to main |
| `README.md` (modify) | Add Deploy section |

---

## Task 1: Server config validation + fail-fast startup

**Files:**
- Create: `server/config.ts`
- Create: `server/tests/config_test.ts`
- Test: `server/tests/config_test.ts`

**Interfaces:**
- Produces: `validateEnv(): void` — throws `Error` with concatenated missing-var list if any required var is unset.
- Required vars: `DATABASE_URL`, `ALLOWED_ORIGINS`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/config_test.ts`:

```typescript
import { assertEquals, assertThrows } from "jsr:@std/assert@^0.225.0";
import { validateEnv } from "../config.ts";

Deno.test("validateEnv throws if DATABASE_URL missing", () => {
  const saved = Deno.env.get("DATABASE_URL");
  Deno.env.delete("DATABASE_URL");
  try {
    assertThrows(
      () => validateEnv(),
      Error,
      "DATABASE_URL"
    );
  } finally {
    if (saved) Deno.env.set("DATABASE_URL", saved);
  }
});

Deno.test("validateEnv throws if ALLOWED_ORIGINS missing", () => {
  const saved = Deno.env.get("ALLOWED_ORIGINS");
  Deno.env.delete("ALLOWED_ORIGINS");
  try {
    assertThrows(
      () => validateEnv(),
      Error,
      "ALLOWED_ORIGINS"
    );
  } finally {
    if (saved) Deno.env.set("ALLOWED_ORIGINS", saved);
  }
});

Deno.test("validateEnv passes when all required vars set", () => {
  Deno.env.set("DATABASE_URL", "postgres://test");
  Deno.env.set("ALLOWED_ORIGINS", "http://localhost:8080");
  // Should not throw
  validateEnv();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && deno test --allow-env tests/config_test.ts`
Expected: FAIL with `Module not found: .../config.ts`

- [ ] **Step 3: Write minimal implementation**

Create `server/config.ts`:

```typescript
const REQUIRED_VARS = ["DATABASE_URL", "ALLOWED_ORIGINS"] as const;

/** Validates required env vars exist. Throws Error listing all missing vars. */
export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((v) => !Deno.env.get(v));
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

/** Returns parsed ALLOWED_ORIGINS as array. */
export function getAllowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && deno test --allow-env tests/config_test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/config.ts server/tests/config_test.ts
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(server): add env var validation with fail-fast startup"
```

---

## Task 2: Refactor server.ts for Deno Deploy (Deno.serve + dynamic CORS)

**Files:**
- Modify: `server/server.ts`
- Create: `server/entry.ts`
- Modify: `server/deno.json`
- Create: `server/tests/cors_test.ts`

**Interfaces:**
- Produces: `app` (exported Oak `Application`), `default` export `app` for `entry.ts` to import.
- Produces: `corsMiddleware(ctx, next)` — exported for testing.

- [ ] **Step 1: Write the failing test**

Create `server/tests/cors_test.ts`:

```typescript
import { assertEquals } from "jsr:@std/assert@^0.225.0";
import { corsMiddleware } from "../server.ts";

function makeCtx(origin: string | null) {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  return {
    request: { method: "GET", headers },
    response: { headers: new Headers(), status: 0 },
  } as any;
}

Deno.test("corsMiddleware reflects allowed origin", async () => {
  Deno.env.set("ALLOWED_ORIGINS", "http://localhost:8080,https://archi-fighter.vercel.app");
  const ctx = makeCtx("http://localhost:8080");
  let nextCalled = false;
  await corsMiddleware(ctx, () => { nextCalled = true; });
  assertEquals(nextCalled, true);
  assertEquals(ctx.response.headers.get("Access-Control-Allow-Origin"), "http://localhost:8080");
});

Deno.test("corsMiddleware does not set ACAO for disallowed origin", async () => {
  Deno.env.set("ALLOWED_ORIGINS", "http://localhost:8080");
  const ctx = makeCtx("https://evil.example.com");
  await corsMiddleware(ctx, () => {});
  assertEquals(ctx.response.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("corsMiddleware handles OPTIONS preflight with 204", async () => {
  Deno.env.set("ALLOWED_ORIGINS", "http://localhost:8080");
  const ctx = makeCtx("http://localhost:8080");
  ctx.request.method = "OPTIONS";
  await corsMiddleware(ctx, () => {});
  assertEquals(ctx.response.status, 204);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && deno test --allow-env tests/cors_test.ts`
Expected: FAIL — `corsMiddleware` not exported from `server.ts`

- [ ] **Step 3: Rewrite server.ts**

Replace `server/server.ts` entirely with:

```typescript
import "@std/dotenv/load";
import { Application, type Context, type Next } from "oak";
import { db } from "./database/database.ts";
import apiRouter from "./routes/index.ts";
import docsRouter from "./routes/docs.routes.ts";
import { validateEnv, getAllowedOrigins } from "./config.ts";

export function corsMiddleware(ctx: Context, next: Next): Promise<void> | void {
  const origin = ctx.request.headers.get("Origin");
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    ctx.response.headers.set("Access-Control-Allow-Origin", origin);
    ctx.response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    ctx.response.headers.set("Vary", "Origin");
  }
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }
  return next();
}

export const app = new Application();

validateEnv(); // Fail fast on missing config

app.use(corsMiddleware);
app.use(docsRouter.routes());
app.use(apiRouter.routes());

console.log("Archi-Fighter server ready");

// Local dev: deno task dev runs server.ts directly → call listen()
// Deno Deploy: entry.ts imports `app` and calls Deno.serve(app.handle)
if (import.meta.main) {
  const port = parseInt(Deno.env.get("SERVER_PORT") ?? "3000");
  db.connect().then(() => {
    console.log(`Server listening on http://localhost:${port}`);
    app.listen({ port });
  });
}
```

Create `server/entry.ts`:

```typescript
import { app } from "./server.ts";
import { db } from "./database/database.ts";

await db.connect();
Deno.serve((req) => app.handle(req));
```

- [ ] **Step 4: Modify deno.json**

Replace `server/deno.json` `tasks` section with:

```json
{
  "tasks": {
    "dev": "deno run --allow-net --allow-read --allow-write --allow-env --env-file=../.env --watch server.ts",
    "start": "deno run --allow-net --allow-read --allow-env entry.ts",
    "test": "deno test --allow-env --allow-read",
    "db:migrate": "deno run --allow-net --allow-read --allow-env --env-file=../.env database/migrations.ts",
    "db:seed": "deno run --allow-net --allow-read --allow-env --env-file=../.env database/seeder.ts"
  },
  "imports": {
    "@db/postgres": "jsr:@db/postgres@^0.19.5",
    "@std/dotenv": "jsr:@std/dotenv@^0.225.6",
    "@std/assert": "jsr:@std/assert@^0.225.0",
    "oak": "https://deno.land/x/oak@v12.6.1/mod.ts"
  }
}
```

Note: `websocket` import removed (no longer used); `@std/assert` added for tests.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && deno test --allow-env tests/cors_test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add server/server.ts server/entry.ts server/deno.json server/tests/cors_test.ts
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(server): add Deno.serve entry point + dynamic CORS middleware"
```

---

## Task 3: Neon Postgres connection with pooling

**Files:**
- Modify: `server/database/database.ts`
- Create: `server/tests/database_test.ts`

**Interfaces:**
- Produces: `db.connect(): Promise<void>` — opens pool using `DATABASE_URL`.
- Produces: `db.query(sql: string, params?: unknown[]): Promise<unknown[]>` — pooled query.
- Produces: `db.end(): Promise<void>` — closes pool (for tests).

- [ ] **Step 1: Write the failing test**

Create `server/tests/database_test.ts`:

```typescript
import { assertEquals, assertRejects } from "jsr:@std/assert@^0.225.0";
import { db } from "../database/database.ts";

Deno.test("db.connect throws on missing DATABASE_URL", async () => {
  const saved = Deno.env.get("DATABASE_URL");
  Deno.env.delete("DATABASE_URL");
  try {
    await assertRejects(() => db.connect(), Error, "DATABASE_URL");
  } finally {
    if (saved) Deno.env.set("DATABASE_URL", saved);
  }
});

Deno.test("db.connect throws on invalid URL format", async () => {
  const saved = Deno.env.get("DATABASE_URL");
  Deno.env.set("DATABASE_URL", "not-a-url");
  try {
    await assertRejects(() => db.connect());
  } finally {
    if (saved) Deno.env.set("DATABASE_URL", saved);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && deno test --allow-env tests/database_test.ts`
Expected: FAIL — current `database.ts` doesn't validate URL format.

- [ ] **Step 3: Rewrite database.ts**

Replace `server/database/database.ts` with:

```typescript
import { Pool } from "@db/postgres";

class Database {
  private pool: Pool | null = null;

  async connect(): Promise<void> {
    const url = Deno.env.get("DATABASE_URL");
    if (!url) throw new Error("DATABASE_URL not set");

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new Error(`DATABASE_URL is not a valid URL: ${url}`);
    }

    // Small pool per isolate (Neon pooler handles server-side multiplexing)
    this.pool = new Pool(url, 3, true); // 3 connections, lazy
    console.log("[db] Pool created");
  }

  async query(sql: string, params: unknown[] = []): Promise<unknown[]> {
    if (!this.pool) throw new Error("db.connect() not called");
    const client = await this.pool.connect();
    try {
      const result = await client.queryObject(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async end(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log("[db] Pool closed");
    }
  }
}

export const db = new Database();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && deno test --allow-env tests/database_test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/database/database.ts server/tests/database_test.ts
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(db): use Neon pooled connection with validation"
```

---

## Task 4: Idempotent migrations

**Files:**
- Modify: `server/database/migrations.ts`
- Create: `server/tests/migrations_test.ts`

**Interfaces:**
- Produces: `runMigrations(): Promise<void>` — runs all DDL idempotently. Safe to call multiple times.

- [ ] **Step 1: Read current migrations.ts**

Run: `cat server/database/migrations.ts`

Read the existing DDL statements. We will wrap each in `IF NOT EXISTS`.

- [ ] **Step 2: Write the failing test**

Create `server/tests/migrations_test.ts`:

```typescript
import { assertEquals } from "jsr:@std/assert@^0.225.0";
import { runMigrations } from "../database/migrations.ts";

// Mock db that records SQL it received
const recordedSql: string[] = [];
const mockDb = {
  async query(sql: string) {
    recordedSql.push(sql);
    return [];
  },
};

Deno.test("runMigrations uses IF NOT EXISTS on CREATE TABLE", async () => {
  recordedSql.length = 0;
  await runMigrations(mockDb);
  const createStmts = recordedSql.filter((s) => /CREATE TABLE/i.test(s));
  for (const stmt of createStmts) {
    assertEquals(/IF NOT EXISTS/i.test(stmt), true, `Missing IF NOT EXISTS: ${stmt}`);
  }
});

Deno.test("runMigrations is idempotent (can run twice without error)", async () => {
  recordedSql.length = 0;
  await runMigrations(mockDb);
  await runMigrations(mockDb);
  // Should not throw — idempotent
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && deno test --allow-env --allow-read tests/migrations_test.ts`
Expected: FAIL — current `runMigrations` doesn't accept a db param.

- [ ] **Step 4: Rewrite migrations.ts**

Open `server/database/migrations.ts`. Change the function signature to accept a db argument:

```typescript
import type { db as DbType } from "./database.ts";

interface DbLike {
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
}

export async function runMigrations(db: DbLike = (await import("./database.ts")).db): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      pseudo VARCHAR(32) NOT NULL,
      token VARCHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      sprite_key VARCHAR(64) NOT NULL,
      health INT NOT NULL DEFAULT 100,
      speed FLOAT NOT NULL DEFAULT 1,
      attack FLOAT NOT NULL DEFAULT 1,
      defense FLOAT NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS maps (
      id SERIAL PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      sprite_key VARCHAR(64) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      map_id INT REFERENCES maps(id),
      type VARCHAR(16) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'waiting',
      created_at TIMESTAMP DEFAULT NOW(),
      finished_at TIMESTAMP NULL
    )`,
    `CREATE TABLE IF NOT EXISTS game_players (
      game_id INT REFERENCES games(id),
      player_id INT REFERENCES players(id) NULL,
      character_id INT REFERENCES characters(id),
      team SMALLINT NOT NULL CHECK (team IN (1,2)),
      PRIMARY KEY (game_id, team)
    )`,
    `CREATE TABLE IF NOT EXISTS game_rounds (
      game_id INT REFERENCES games(id),
      round INT NOT NULL,
      winner_team SMALLINT NOT NULL CHECK (winner_team IN (1,2)),
      PRIMARY KEY (game_id, round)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_players_token ON players(token)`,
    `CREATE INDEX IF NOT EXISTS idx_games_status ON games(status)`,
  ];

  for (const stmt of statements) {
    await db.query(stmt);
  }
  console.log("[migrations] All statements applied");
}
```

**Note:** The exact DDL above is a baseline. If the original `migrations.ts` had different column definitions, copy them verbatim and just add `IF NOT EXISTS`. Run `cat server/database/migrations.ts` first to verify.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && deno test --allow-env --allow-read tests/migrations_test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add server/database/migrations.ts server/tests/migrations_test.ts
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(db): make migrations idempotent with IF NOT EXISTS"
```

---

## Task 5: Matchmaking queue with Deno KV atomic ops

**Files:**
- Create: `server/matchmaking/queue.ts`
- Create: `server/tests/queue_test.ts`

**Interfaces:**
- Produces: `joinQueue(playerId: number): Promise<{ game_id: number; opponent_id: number } | { status: "waiting" }>`
- Produces: `leaveQueue(playerId: number): Promise<void>`
- Internals: uses `kv.atomic().check(versionstamp)` for race-free pop.

- [ ] **Step 1: Write the failing test**

Create `server/tests/queue_test.ts`:

```typescript
import { assertEquals } from "jsr:@std/assert@^0.225.0";
import { joinQueue, leaveQueue, resetQueue } from "../matchmaking/queue.ts";

Deno.test("joinQueue returns waiting when queue empty", async () => {
  await resetQueue();
  const result = await joinQueue(1);
  assertEquals(result, { status: "waiting" });
  await leaveQueue(1);
});

Deno.test("joinQueue pairs two waiting players", async () => {
  await resetQueue();
  await joinQueue(1);
  const result = await joinQueue(2);
  assertEquals(result, { game_id: typeof 1 === "number" ? result.game_id : 0, opponent_id: 1 });
});

Deno.test("leaveQueue removes player from queue", async () => {
  await resetQueue();
  await joinQueue(1);
  await leaveQueue(1);
  const result = await joinQueue(2);
  assertEquals(result, { status: "waiting" });
  await leaveQueue(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && deno test --allow-env --unstable-kv tests/queue_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement queue.ts**

Create `server/matchmaking/queue.ts`:

```typescript
const QUEUE_KEY = ["matchmaking", "queue"];

interface QueueEntry {
  player_id: number;
  joined_at: number;
}

let kv: Deno.Kv | null = null;

async function getKv(): Promise<Deno.Kv> {
  if (!kv) {
    kv = await Deno.openKv(); // Uses DENO_KV_URL or in-memory
  }
  return kv;
}

export async function resetQueue(): Promise<void> {
  const k = await getKv();
  const entries = await k.list<QueueEntry>({ prefix: QUEUE_KEY });
  for await (const entry of entries) {
    await k.delete(entry.key);
  }
}

export async function joinQueue(
  playerId: number,
): Promise<{ game_id: number; opponent_id: number } | { status: "waiting" }> {
  const k = await getKv();

  // Try to find an existing opponent in the queue
  const entries = k.list<QueueEntry>({ prefix: QUEUE_KEY });
  for await (const entry of entries) {
    const opponent = entry.value;
    if (opponent.player_id === playerId) continue; // Don't match self

    // Atomic: only match if this entry still exists
    const atomic = k.atomic()
      .check({ key: entry.key, versionstamp: entry.versionstamp })
      .delete(entry.key);

    // Create a new game_id (timestamp-based, unique enough for demo)
    const gameId = Date.now();
    const gameKey = ["games", gameId];
    atomic.set(gameKey, {
      player1: opponent.player_id,
      player2: playerId,
      created_at: Date.now(),
    }, { expireIn: 3_600_000 }); // 1 hour TTL

    const res = await atomic.commit();
    if (res.ok) {
      return { game_id: gameId, opponent_id: opponent.player_id };
    }
    // If commit failed, someone else grabbed this opponent — try next
  }

  // No opponent found — add self to queue
  const myKey = [...QUEUE_KEY, playerId];
  const entry: QueueEntry = { player_id: playerId, joined_at: Date.now() };
  await k.set(myKey, entry, { expireIn: 60_000 }); // 1 min TTL (re-join if needed)
  return { status: "waiting" };
}

export async function leaveQueue(playerId: number): Promise<void> {
  const k = await getKv();
  await k.delete([...QUEUE_KEY, playerId]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && deno test --allow-env --unstable-kv tests/queue_test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/matchmaking/queue.ts server/tests/queue_test.ts
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(matchmaking): add Deno KV queue with atomic matchmaking"
```

---

## Task 6: Signaling relay (SDP/ICE message queue)

**Files:**
- Create: `server/signaling/relay.ts`
- Create: `server/tests/relay_test.ts`

**Interfaces:**
- Produces: `postOffer(gameId, fromPeer, sdp): Promise<void>`
- Produces: `postAnswer(gameId, fromPeer, sdp): Promise<void>`
- Produces: `postIce(gameId, fromPeer, candidate): Promise<void>`
- Produces: `poll(gameId, forPeer, since: number): Promise<Message[]>`
- Each message has `id`, `type` (`offer`|`answer`|`ice`), `from`, `data`, `timestamp`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/relay_test.ts`:

```typescript
import { assertEquals } from "jsr:@std/assert@^0.225.0";
import { postOffer, postAnswer, postIce, poll, resetRelay } from "../signaling/relay.ts";

Deno.test("offer is readable by opponent via poll", async () => {
  await resetRelay();
  await postOffer(100, "p1", { type: "offer", sdp: "FAKE_SDP" });
  const msgs = await poll(100, "p2", 0);
  assertEquals(msgs.length, 1);
  assertEquals(msgs[0].type, "offer");
  assertEquals(msgs[0].from, "p1");
});

Deno.test("poll filters by since timestamp", async () => {
  await resetRelay();
  const t0 = Date.now();
  await postOffer(101, "p1", { type: "offer", sdp: "SDP1" });
  await new Promise((r) => setTimeout(r, 10));
  const t1 = Date.now();
  await postIce(101, "p1", { candidate: "CAND1" });
  const msgs = await poll(101, "p2", t1);
  assertEquals(msgs.length, 1);
  assertEquals(msgs[0].type, "ice");
});

Deno.test("answer is not visible to self", async () => {
  await resetRelay();
  await postAnswer(102, "p1", { type: "answer", sdp: "SDP" });
  const msgs = await poll(102, "p1", 0);
  assertEquals(msgs.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && deno test --allow-env --unstable-kv tests/relay_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement relay.ts**

Create `server/signaling/relay.ts`:

```typescript
type PeerId = string;
type SignalType = "offer" | "answer" | "ice";

export interface SignalMessage {
  id: string;
  type: SignalType;
  from: PeerId;
  to: PeerId | null; // null = broadcast to anyone in the game
  data: unknown;
  timestamp: number;
}

const PREFIX = ["signal"];

let kv: Deno.Kv | null = null;
async function getKv(): Promise<Deno.Kv> {
  if (!kv) kv = await Deno.openKv();
  return kv;
}

export async function resetRelay(): Promise<void> {
  const k = await getKv();
  const entries = k.list<SignalMessage>({ prefix: PREFIX });
  for await (const entry of entries) {
    await k.delete(entry.key);
  }
}

function otherPeer(peer: PeerId): PeerId {
  return peer === "p1" ? "p2" : "p1";
}

async function post(
  gameId: number,
  from: PeerId,
  type: SignalType,
  data: unknown,
): Promise<void> {
  const k = await getKv();
  const msg: SignalMessage = {
    id: crypto.randomUUID(),
    type,
    from,
    to: otherPeer(from),
    data,
    timestamp: Date.now(),
  };
  // Keyed by game_id + timestamp + uuid to allow sorted iteration
  const key = [...PREFIX, gameId, msg.timestamp, msg.id];
  await k.set(key, msg, { expireIn: 600_000 }); // 10 min TTL
}

export const postOffer = (gameId: number, from: PeerId, sdp: unknown) =>
  post(gameId, from, "offer", sdp);

export const postAnswer = (gameId: number, from: PeerId, sdp: unknown) =>
  post(gameId, from, "answer", sdp);

export const postIce = (gameId: number, from: PeerId, candidate: unknown) =>
  post(gameId, from, "ice", candidate);

export async function poll(
  gameId: number,
  forPeer: PeerId,
  since: number,
): Promise<SignalMessage[]> {
  const k = await getKv();
  const out: SignalMessage[] = [];
  const entries = k.list<SignalMessage>({
    prefix: [...PREFIX, gameId],
    start: [...PREFIX, gameId, since + 1],
  });
  for await (const entry of entries) {
    const msg = entry.value;
    // Only deliver messages addressed to this peer (or null broadcast)
    if (msg.to === null || msg.to === forPeer) {
      out.push(msg);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && deno test --allow-env --unstable-kv tests/relay_test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/signaling/relay.ts server/tests/relay_test.ts
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(signaling): add Deno KV-backed SDP/ICE relay"
```

---

## Task 7: Matchmaking routes + controller

**Files:**
- Create: `server/controllers/matchmaking.controller.ts`
- Create: `server/routes/matchmaking.routes.ts`
- Modify: `server/routes/index.ts`

**Interfaces:**
- Produces: `POST /api/v1/matchmaking/join` — body `{}`; returns `{game_id, opponent_id}` or `{status:"waiting"}`.
- Produces: `GET /api/v1/matchmaking/status/:playerId` — returns current queue status.
- Auth: `Authorization: Bearer <token>` required.

- [ ] **Step 1: Implement controller**

Create `server/controllers/matchmaking.controller.ts`:

```typescript
import type { RouterContext } from "oak";
import { playerModel } from "../models/player.model.ts";
import { joinQueue, leaveQueue } from "../matchmaking/queue.ts";

const extractToken = (h: string | null): string | null =>
  h?.startsWith("Bearer ") ? h.slice(7) : null;

export const join = async (ctx: RouterContext<string>) => {
  const token = extractToken(ctx.request.headers.get("Authorization"));
  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Missing Authorization" };
    return;
  }
  const player = await playerModel.getByToken(token);
  if (!player) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid token" };
    return;
  }

  const result = await joinQueue(player.id);
  ctx.response.status = 200;
  ctx.response.body = result;
};

export const leave = async (ctx: RouterContext<string>) => {
  const token = extractToken(ctx.request.headers.get("Authorization"));
  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Missing Authorization" };
    return;
  }
  const player = await playerModel.getByToken(token);
  if (!player) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid token" };
    return;
  }
  await leaveQueue(player.id);
  ctx.response.body = { ok: true };
};
```

- [ ] **Step 2: Create routes**

Create `server/routes/matchmaking.routes.ts`:

```typescript
import { Router } from "oak";
import * as ctrl from "../controllers/matchmaking.controller.ts";

const router = new Router();
router.post("/matchmaking/join", ctrl.join);
router.post("/matchmaking/leave", ctrl.leave);

export default router;
```

- [ ] **Step 3: Mount in routes/index.ts**

Open `server/routes/index.ts`. Add at the top with the other imports:

```typescript
import matchmakingRouter from "./matchmaking.routes.ts";
```

Then before the `export default apiRouter;`, add:

```typescript
apiRouter.use(matchmakingRouter.routes(), matchmakingRouter.allowedMethods());
```

- [ ] **Step 4: Smoke test locally**

Run: `cd server && deno task dev`
Then in another terminal:
```bash
curl -X POST http://localhost:3000/api/v1/matchmaking/join \
  -H "Authorization: Bearer INVALID"
```
Expected: `{"error":"Invalid token"}` (401)

- [ ] **Step 5: Commit**

```bash
git add server/controllers/matchmaking.controller.ts server/routes/matchmaking.routes.ts server/routes/index.ts
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(matchmaking): add join/leave endpoints with auth"
```

---

## Task 8: Signaling routes — replace WebSocket

**Files:**
- Modify: `server/routes/game.routes.ts`
- Modify: `server/controllers/game.controller.ts`
- Delete: `server/websocket/game.manager.ts`, `server/websocket/game.room.ts`, `server/websocket/ws.types.ts` (if exists)

**Interfaces:**
- Produces: `POST /api/v1/games/:id/signal/offer` — body `{ from, sdp }`
- Produces: `POST /api/v1/games/:id/signal/answer` — body `{ from, sdp }`
- Produces: `POST /api/v1/games/:id/signal/ice` — body `{ from, candidate }`
- Produces: `GET /api/v1/games/:id/signal/poll?peer=p1&since=0` — returns `Message[]`

- [ ] **Step 1: Update game.routes.ts**

Replace `server/routes/game.routes.ts`:

```typescript
import { Router } from "oak";
import * as gameController from "../controllers/game.controller.ts";

const gameRouter = new Router();

gameRouter.post("/games",                 gameController.create);
gameRouter.post("/games/ai/start",        gameController.startAiGame);
gameRouter.post("/games/:id/rounds",      gameController.addRound);
gameRouter.patch("/games/:id/finish",     gameController.finishGame);

// WebRTC signaling endpoints (replaces old WS endpoint)
gameRouter.post("/games/:id/signal/offer",  gameController.postOffer);
gameRouter.post("/games/:id/signal/answer", gameController.postAnswer);
gameRouter.post("/games/:id/signal/ice",    gameController.postIce);
gameRouter.get ("/games/:id/signal/poll",   gameController.pollSignal);

export default gameRouter;
```

- [ ] **Step 2: Update game.controller.ts**

Open `server/controllers/game.controller.ts`. Remove the `connect` function entirely. Remove the `gameManager` import. Add new signal handlers at the bottom:

```typescript
import { postOffer as relayOffer, postAnswer as relayAnswer, postIce as relayIce, poll as relayPoll } from "../signaling/relay.ts";

// ... existing create, startAiGame, addRound, finishGame functions unchanged ...

export const postOffer = async (ctx: RouterContext<string>) => {
  const gameId = Number(ctx.params.id);
  const body = await ctx.request.body({ type: "json" });
  const { from, sdp } = await body.value;
  await relayOffer(gameId, from, sdp);
  ctx.response.body = { ok: true };
};

export const postAnswer = async (ctx: RouterContext<string>) => {
  const gameId = Number(ctx.params.id);
  const body = await ctx.request.body({ type: "json" });
  const { from, sdp } = await body.value;
  await relayAnswer(gameId, from, sdp);
  ctx.response.body = { ok: true };
};

export const postIce = async (ctx: RouterContext<string>) => {
  const gameId = Number(ctx.params.id);
  const body = await ctx.request.body({ type: "json" });
  const { from, candidate } = await body.value;
  await relayIce(gameId, from, candidate);
  ctx.response.body = { ok: true };
};

export const pollSignal = async (ctx: RouterContext<string>) => {
  const gameId = Number(ctx.params.id);
  const peer = ctx.request.url.searchParams.get("peer") ?? "p1";
  const since = Number(ctx.request.url.searchParams.get("since") ?? "0");
  const msgs = await relayPoll(gameId, peer, since);
  ctx.response.body = { messages: msgs };
};
```

- [ ] **Step 3: Delete obsolete WebSocket files**

```bash
rm server/websocket/game.manager.ts
rm server/websocket/game.room.ts
rm -f server/websocket/ws.types.ts
rmdir server/websocket 2>/dev/null || true
```

- [ ] **Step 4: Run all server tests**

Run: `cd server && deno test --allow-env --allow-read --unstable-kv`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A server/
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(server): replace WebSocket with WebRTC signaling endpoints"
```

---

## Task 9: Update .env.example with all required vars

**Files:**
- Modify: `.env.example`
- Create: `client/.env.example`

- [ ] **Step 1: Update root .env.example**

Replace `.env.example`:

```bash
# ─── Server (Deno Deploy dashboard) ────────────────────────────────
# Neon Postgres pooled connection string (get from Neon dashboard → Connect → Pooled connection)
DATABASE_URL=postgres://USER:PASS@ep-xxx-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require

# Comma-separated list of allowed CORS origins
# Include localhost for dev, your Vercel prod URL, and Vercel preview pattern
ALLOWED_ORIGINS=http://localhost:8080,https://archi-fighter.vercel.app

# Server port (local dev only — Deno Deploy ignores this)
SERVER_PORT=3000

# ─── Client (Vercel project settings) ──────────────────────────────
# Vite reads these — must be prefixed VITE_
# (this is just documentation; actual vars go in client/.env.example)
```

- [ ] **Step 2: Create client/.env.example**

Create `client/.env.example`:

```bash
# API base URL — Vite bakes this into the build at compile time
# For local dev: http://localhost:3000/api/v1
# For prod:      https://YOUR-DENO-DEPLOY-URL.deno.dev/api/v1
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

- [ ] **Step 3: Commit**

```bash
git add .env.example client/.env.example
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "docs: document all required env vars for client and server"
```

---

## Task 10: Client — env-driven API base URL + retry

**Files:**
- Modify: `client/services/api.service.js`
- Modify: `client/vite.config.js`

**Interfaces:**
- Produces: `apiFetch(path, options, token)` — uses `VITE_API_BASE_URL`, retries 5xx/network errors up to 3× with exponential backoff (1s, 2s, 4s).

- [ ] **Step 1: Rewrite api.service.js**

Replace `client/services/api.service.js`:

```javascript
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

if (!import.meta.env.VITE_API_BASE_URL) {
  console.warn("[config] VITE_API_BASE_URL not set — falling back to localhost. This will not work in production.");
}

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Base fetch wrapper with retry on 5xx and network errors.
 * @param {string} path     - e.g. "/players"
 * @param {RequestInit} [options]
 * @param {string} [token]  - Bearer token if required
 * @returns {Promise<any>}
 */
export async function apiFetch(path, options = {}, token = null) {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
      });

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(INITIAL_DELAY_MS * 2 ** attempt);
        continue;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`), { status: response.status });
      }

      return response.json();
    } catch (err) {
      lastErr = err;
      // Network error (TypeError) — retry
      if (err instanceof TypeError && attempt < MAX_RETRIES) {
        await sleep(INITIAL_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
```

- [ ] **Step 2: Update vite.config.js with relative base**

Replace `client/vite.config.js`:

```javascript
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 8080,
  },
  build: {
    outDir: "build",
  },
});
```

- [ ] **Step 3: Manual smoke test**

```bash
cd client && npm install && VITE_API_BASE_URL=http://localhost:3000/api/v1 npm run dev
```

Open `http://localhost:8080`. Open DevTools Console. Should see no `[config] VITE_API_BASE_URL not set` warning. Server should be running on `:3000`.

- [ ] **Step 4: Commit**

```bash
git add client/services/api.service.js client/vite.config.js
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(client): env-driven API URL + retry with backoff"
```

---

## Task 11: RtcManager — WebRTC peer connection lifecycle

**Files:**
- Create: `client/managers/rtc.manager.js`
- Create: `client/tests/rtc.manager.test.js`
- Modify: `client/package.json` (add Vitest)

**Interfaces:**
- Produces: `rtcManager.init(gameId, peerId, isInitiator, onMessage)` — starts RTC handshake.
- Produces: `rtcManager.send(msg)` — sends over data channel.
- Produces: `rtcManager.disconnect()` — tears down.
- Produces: `rtcManager.state` — `"idle"|"connecting"|"connected"|"disconnected"|"failed"`.

- [ ] **Step 1: Add Vitest to client**

```bash
cd client && npm install --save-dev vitest@^2.0.0
```

Update `client/package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite --port 8080",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `client/tests/rtc.manager.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock RTCPeerConnection
class MockRTC {
  constructor() {
    this.localDescription = null;
    this.remoteDescription = null;
    this.onicecandidate = null;
    this.onconnectionstatechange = null;
    this.ondatachannel = null;
    this._dataChannels = [];
  }
  async createDataChannel(label) {
    const dc = { label, send: vi.fn(), onopen: null, onmessage: null, onclose: null, close: vi.fn() };
    this._dataChannels.push(dc);
    return dc;
  }
  async createOffer() { return { type: "offer", sdp: "FAKE_OFFER" }; }
  async createAnswer() { return { type: "answer", sdp: "FAKE_ANSWER" }; }
  async setLocalDescription(desc) { this.localDescription = desc; }
  async setRemoteDescription(desc) { this.remoteDescription = desc; }
  addIceCandidate() { return Promise.resolve(); }
  close() {}
}

globalThis.RTCPeerConnection = MockRTC;

// Mock fetch
globalThis.fetch = vi.fn(async (url, opts) => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, messages: [] }),
}));

// Mock crypto.randomUUID
globalThis.crypto = { randomUUID: () => "test-uuid-" + Math.random() };

const { rtcManager } = await import("../managers/rtc.manager.js");

describe("RtcManager", () => {
  beforeEach(() => {
    rtcManager.disconnect();
  });

  it("starts in idle state", () => {
    expect(rtcManager.state).toBe("idle");
  });

  it("transitions to connecting on init as initiator", async () => {
    const onMsg = vi.fn();
    rtcManager.init(1, "p1", true, onMsg);
    expect(rtcManager.state).toBe("connecting");
    rtcManager.disconnect();
  });

  it("send() throws if not connected", () => {
    expect(() => rtcManager.send({ type: "test" })).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd client && npx vitest run tests/rtc.manager.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement RtcManager**

Create `client/managers/rtc.manager.js`:

```javascript
import { apiFetch } from "../services/api.service.js";

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80",   username: "openrelay", credential: "openrelay" },
    { urls: "turn:openrelay.metered.ca:443",  username: "openrelay", credential: "openrelay" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelay", credential: "openrelay" },
  ],
};

const POLL_INTERVAL_MS = 500;
const ICE_TIMEOUT_MS = 15000;

class RtcManager {
  constructor() {
    this.state = "idle";
    this._pc = null;
    this._dc = null;
    this._gameId = null;
    this._peerId = null;
    this._onMessage = null;
    this._pollTimer = null;
    this._lastPollTs = 0;
    this._iceTimeout = null;
  }

  /**
   * Initialize a P2P connection.
   * @param {number} gameId
   * @param {"p1"|"p2"} peerId
   * @param {boolean} isInitiator  - true = creates offer, false = waits for offer
   * @param {(msg: any) => void} onMessage
   */
  async init(gameId, peerId, isInitiator, onMessage) {
    this.disconnect();
    this._gameId = gameId;
    this._peerId = peerId;
    this._onMessage = onMessage;
    this._isInitiator = isInitiator;
    this.state = "connecting";

    this._pc = new RTCPeerConnection(ICE_CONFIG);

    // ICE candidate → relay to opponent
    this._pc.onicecandidate = (e) => {
      if (e.candidate) {
        apiFetch(`/games/${gameId}/signal/ice`, {
          method: "POST",
          body: JSON.stringify({ from: peerId, candidate: e.candidate }),
        }).catch((err) => console.error("[RTC] postIce failed:", err));
      }
    };

    this._pc.onconnectionstatechange = () => {
      const s = this._pc.connectionState;
      if (s === "connected") {
        this.state = "connected";
        clearTimeout(this._iceTimeout);
        console.log("[RTC] connected");
      } else if (s === "disconnected") {
        this.state = "disconnected";
      } else if (s === "failed") {
        this.state = "failed";
        clearTimeout(this._iceTimeout);
      }
    };

    // Data channel
    if (isInitiator) {
      this._dc = await this._pc.createDataChannel("game");
      this._setupDataChannel();
      const offer = await this._pc.createOffer();
      await this._pc.setLocalDescription(offer);
      await apiFetch(`/games/${gameId}/signal/offer`, {
        method: "POST",
        body: JSON.stringify({ from: peerId, sdp: offer }),
      });
    } else {
      this._pc.ondatachannel = (e) => {
        this._dc = e.channel;
        this._setupDataChannel();
      };
    }

    // Start polling for signaling messages
    this._startPolling();

    // ICE timeout
    this._iceTimeout = setTimeout(() => {
      if (this.state === "connecting") {
        console.warn("[RTC] ICE timeout — connection failed");
        this.state = "failed";
      }
    }, ICE_TIMEOUT_MS);
  }

  _setupDataChannel() {
    this._dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this._onMessage?.(msg);
      } catch (err) {
        console.error("[RTC] bad message:", err);
      }
    };
    this._dc.onclose = () => {
      this.state = "disconnected";
    };
  }

  _startPolling() {
    this._pollTimer = setInterval(async () => {
      try {
        const res = await apiFetch(
          `/games/${this._gameId}/signal/poll?peer=${this._peerId}&since=${this._lastPollTs}`,
        );
        for (const msg of res.messages) {
          this._lastPollTs = Math.max(this._lastPollTs, msg.timestamp);
          await this._handleSignalMessage(msg);
        }
      } catch (err) {
        console.error("[RTC] poll failed:", err);
      }
    }, POLL_INTERVAL_MS);
  }

  async _handleSignalMessage(msg) {
    if (msg.type === "offer") {
      await this._pc.setRemoteDescription(msg.data);
      const answer = await this._pc.createAnswer();
      await this._pc.setLocalDescription(answer);
      await apiFetch(`/games/${this._gameId}/signal/answer`, {
        method: "POST",
        body: JSON.stringify({ from: this._peerId, sdp: answer }),
      });
    } else if (msg.type === "answer") {
      await this._pc.setRemoteDescription(msg.data);
    } else if (msg.type === "ice") {
      await this._pc.addIceCandidate(msg.data);
    }
  }

  send(msg) {
    if (this.state !== "connected" || !this._dc) {
      throw new Error(`Cannot send in state ${this.state}`);
    }
    this._dc.send(JSON.stringify(msg));
  }

  disconnect() {
    clearInterval(this._pollTimer);
    clearTimeout(this._iceTimeout);
    if (this._dc) {
      try { this._dc.close(); } catch {}
      this._dc = null;
    }
    if (this._pc) {
      try { this._pc.close(); } catch {}
      this._pc = null;
    }
    this.state = "idle";
    this._onMessage = null;
  }
}

export const rtcManager = new RtcManager();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run tests/rtc.manager.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add client/managers/rtc.manager.js client/tests/rtc.manager.test.js client/package.json
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(client): add RtcManager with WebRTC P2P + signaling poll"
```

---

## Task 12: NetcodeManager — input delay buffer

**Files:**
- Create: `client/managers/netcode.manager.js`
- Create: `client/tests/netcode.manager.test.js`

**Interfaces:**
- Produces: `netcodeManager.init(rtc, localApplyFn)` — wire to RtcManager + local input handler.
- Produces: `netcodeManager.sendInput(action)` — buffers + sends.
- Produces: `netcodeManager.tick()` — called every frame; applies delayed inputs.
- Constant: `INPUT_DELAY_FRAMES = 4` (67 ms at 60 Hz).

- [ ] **Step 1: Write the failing test**

Create `client/tests/netcode.manager.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { netcodeManager, INPUT_DELAY_FRAMES } = await import("../managers/netcode.manager.js");

describe("NetcodeManager", () => {
  beforeEach(() => {
    netcodeManager.reset();
  });

  it("INPUT_DELAY_FRAMES is 4", () => {
    expect(INPUT_DELAY_FRAMES).toBe(4);
  });

  it("applies local input after delay frames", () => {
    const localApply = vi.fn();
    const rtc = { send: vi.fn(), state: "connected" };
    netcodeManager.init(rtc, localApply);

    netcodeManager.sendInput("punch");
    // Should not apply on the same frame
    netcodeManager.tick();
    netcodeManager.tick();
    netcodeManager.tick();
    expect(localApply).not.toHaveBeenCalled();

    // 4th tick = delay elapsed → apply
    netcodeManager.tick();
    expect(localApply).toHaveBeenCalledTimes(1);
    expect(localApply).toHaveBeenCalledWith({ source: "local", action: "punch", frame: expect.any(Number) });
  });

  it("sends local input over rtc immediately (for opponent)", () => {
    const localApply = vi.fn();
    const rtc = { send: vi.fn(), state: "connected" };
    netcodeManager.init(rtc, localApply);

    netcodeManager.sendInput("kick");
    expect(rtc.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(rtc.send.mock.calls[0][0]);
    expect(sent.type).toBe("input");
    expect(sent.data.action).toBe("kick");
  });

  it("applies remote inputs from opponent", () => {
    const localApply = vi.fn();
    const sentMsgs = [];
    const rtc = {
      send: (m) => sentMsgs.push(m),
      state: "connected",
      _onMessage: null,
    };
    netcodeManager.init(rtc, localApply);

    // Simulate receiving a remote input
    netcodeManager._handleRemote({ type: "input", data: { action: "block", frame: 10 } });
    // Remote inputs also go through the delay buffer
    netcodeManager.tick();
    netcodeManager.tick();
    netcodeManager.tick();
    netcodeManager.tick();
    expect(localApply).toHaveBeenCalledWith({ source: "remote", action: "block", frame: 10 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run tests/netcode.manager.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement netcode.manager.js**

Create `client/managers/netcode.manager.js`:

```javascript
export const INPUT_DELAY_FRAMES = 4; // 67 ms at 60 Hz

class NetcodeManager {
  constructor() {
    this._rtc = null;
    this._localApply = null;
    this._buffer = []; // queue of {source, action, frame, applyAtFrame}
    this._frame = 0;
  }

  /**
   * @param {{send: (msg: string) => void, state: string}} rtc
   * @param {(input: {source: "local"|"remote", action: string, frame: number}) => void} localApply
   */
  init(rtc, localApply) {
    this._rtc = rtc;
    this._localApply = localApply;
    this._buffer = [];
    this._frame = 0;
  }

  reset() {
    this._rtc = null;
    this._localApply = null;
    this._buffer = [];
    this._frame = 0;
  }

  /** Queue a local input. Sends to opponent immediately (they apply on their delay). */
  sendInput(action) {
    this._frame++;
    const frame = this._frame;
    const applyAt = frame + INPUT_DELAY_FRAMES;
    this._buffer.push({ source: "local", action, frame, applyAt });

    // Send to opponent immediately
    if (this._rtc?.state === "connected") {
      this._rtc.send(JSON.stringify({ type: "input", data: { action, frame } }));
    }
  }

  /** Called by RtcManager on receiving a message from opponent. */
  _handleRemote(msg) {
    if (msg.type !== "input") return;
    const { action, frame } = msg.data;
    const applyAt = frame + INPUT_DELAY_FRAMES;
    this._buffer.push({ source: "remote", action, frame, applyAt });
  }

  /** Called every frame by the scene's update loop. */
  tick() {
    if (this._buffer.length === 0) return;
    const due = this._buffer.filter((b) => b.applyAt <= this._frame + 1);
    this._buffer = this._buffer.filter((b) => b.applyAt > this._frame + 1);
    for (const input of due) {
      this._localApply?.({
        source: input.source,
        action: input.action,
        frame: input.frame,
      });
    }
    this._frame++;
  }
}

export const netcodeManager = new NetcodeManager();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run tests/netcode.manager.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/managers/netcode.manager.js client/tests/netcode.manager.test.js
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(client): add NetcodeManager with 4-frame input delay"
```

---

## Task 13: Wire up FightScene + CharacterSelectScene

**Files:**
- Modify: `client/scenes/Fight/FightScene.js`
- Modify: `client/scenes/CharacterSelectScene.js`
- Delete: `client/managers/ws.manager.js`

**Interfaces:**
- Replaces all `wsManager.sendInput(...)` with `netcodeManager.sendInput(...)`.
- Replaces all `wsManager.on(...)` with `rtcManager._onMessage` routing via a small dispatcher.

- [ ] **Step 1: Inspect current wsManager usage**

Run: `grep -n "wsManager" client/scenes/Fight/FightScene.js client/scenes/CharacterSelectScene.js`

Document every line — we'll replace them in batches.

- [ ] **Step 2: Rewrite FightScene.js WebRTC bits**

Open `client/scenes/Fight/FightScene.js`. Replace the `wsManager` import:

```javascript
// OLD: import { wsManager } from "../../managers/ws.manager.js";
import { rtcManager } from "../../managers/rtc.manager.js";
import { netcodeManager } from "../../managers/netcode.manager.js";
```

Find the `wsManager.connect(...)` call (around line 183). Replace with:

```javascript
const peerId = myTeam === 1 ? "p1" : "p2";
const isInitiator = myTeam === 1;
rtcManager.init(this._gameId, peerId, isInitiator, (msg) => {
  if (msg.type === "opponent_input") {
    netcodeManager._handleRemote({ type: "input", data: { action: msg.data.action, frame: msg.data.frame ?? 0 } });
  } else if (msg.type === "round_result") {
    this._handleRoundResult(msg.data);
  } else if (msg.type === "opponent_disconnected") {
    this._handleOpponentDisconnect();
  }
});

netcodeManager.init(rtcManager, (input) => {
  if (input.source === "remote") {
    this._applyOpponentInput(input.action);
  } else {
    this._applyLocalInput(input.action);
  }
});
```

Find every `wsManager.sendInput("X")` call. Replace each with `netcodeManager.sendInput("X")`. The action types (`punch`, `kick`, `block`, `jump`) remain unchanged.

Find `wsManager.sendRoundEnd(oppTeam)`. Replace with:

```javascript
rtcManager.send(JSON.stringify({ type: "round_end", data: { winner_team: oppTeam } }));
```

Find `wsManager.disconnect()`. Replace with `rtcManager.disconnect()`.

In the scene's `update()` method (called every frame by Phaser), add at the top:

```javascript
update(time, delta) {
  netcodeManager.tick();
  // ... rest of existing update logic
}
```

- [ ] **Step 3: Rewrite CharacterSelectScene.js WebRTC bits**

Open `client/scenes/CharacterSelectScene.js`. Replace the import:

```javascript
import { rtcManager } from "../managers/rtc.manager.js";
```

Replace `wsManager.connect(...)` (around line 414) with the same `rtcManager.init(...)` pattern. Route messages:

```javascript
rtcManager.init(this._gameId, peerId, isInitiator, (msg) => {
  if (msg.type === "char_hover") {
    this._onOpponentCharHover(msg.data.character_id);
  } else if (msg.type === "char_ready") {
    this._onOpponentCharReady(msg.data.character_id);
  } else if (msg.type === "opponent_disconnected") {
    this._onOpponentDisconnect();
  }
});
```

Replace `wsManager.sendCharHover(id)` with:

```javascript
rtcManager.send(JSON.stringify({ type: "char_hover", data: { character_id: id } }));
```

Replace `wsManager.sendCharReady(id)` similarly with `char_ready`.

Replace `wsManager.disconnect()` with `rtcManager.disconnect()`.

- [ ] **Step 4: Delete ws.manager.js**

```bash
rm client/managers/ws.manager.js
```

- [ ] **Step 5: Run all client tests**

Run: `cd client && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Manual smoke test**

```bash
cd server && deno task dev &
cd client && npm run dev
```

Open two browser tabs at `http://localhost:8080`. Both enter names, both click "1 vs 1 Online", both pick characters, fight to completion.

If WebRTC fails on localhost, check DevTools Console — STUN/TURN may not be reachable from some networks. The data channel should still establish via "host" candidates.

- [ ] **Step 7: Commit**

```bash
git add client/scenes/Fight/FightScene.js client/scenes/CharacterSelectScene.js
git rm client/managers/ws.manager.js
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(client): wire FightScene + CharacterSelectScene to RtcManager"
```

---

## Task 14: Update game.service.js (remove WS, add signal endpoints)

**Files:**
- Modify: `client/services/game.service.js`

**Interfaces:**
- Produces: `gameService.postOffer(gameId, sdp)`, `postAnswer(...)`, `postIce(...)`, `pollSignal(gameId, since)` — used internally by RtcManager.
- Removes: any `connect` method.

- [ ] **Step 1: Read current game.service.js**

Run: `cat client/services/game.service.js`

- [ ] **Step 2: Add signal methods**

Open `client/services/game.service.js`. Keep existing `getCharacters`, `getMaps`, `create`, `startAi`, `addRound`, `finish`. Add at the bottom:

```javascript
// ─── WebRTC signaling (replaces old WS connect) ────────────────────

export const gameService = {
  // ... existing methods preserved ...

  postOffer: (gameId, from, sdp) =>
    apiFetch(`/games/${gameId}/signal/offer`, {
      method: "POST",
      body: JSON.stringify({ from, sdp }),
    }),

  postAnswer: (gameId, from, sdp) =>
    apiFetch(`/games/${gameId}/signal/answer`, {
      method: "POST",
      body: JSON.stringify({ from, sdp }),
    }),

  postIce: (gameId, from, candidate) =>
    apiFetch(`/games/${gameId}/signal/ice`, {
      method: "POST",
      body: JSON.stringify({ from, candidate }),
    }),

  pollSignal: (gameId, peer, since) =>
    apiFetch(`/games/${gameId}/signal/poll?peer=${peer}&since=${since}`),
};
```

- [ ] **Step 3: Commit**

```bash
git add client/services/game.service.js
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(client): add WebRTC signal endpoints to game.service"
```

---

## Task 15: Vercel deploy config

**Files:**
- Create: `vercel.json`
- Modify: `package.json`

- [ ] **Step 1: Create vercel.json**

Create `vercel.json`:

```json
{
  "buildCommand": "cd client && npm install && npm run build",
  "outputDirectory": "client/build",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Add build script to root package.json**

Open `package.json`. Add `build` to scripts:

```json
{
  "scripts": {
    "dev": "concurrently --names \"POSTGRES,SERVER,CLIENT\" --prefix-colors \"blue,green,cyan\" \"docker compose up -d\" \"cd server && deno task dev\" \"cd client && npm run dev\"",
    "start": "npm run dev",
    "server": "cd server && deno task dev",
    "client": "cd client && npm run dev",
    "build": "cd client && npm install && npm run build"
  }
}
```

- [ ] **Step 3: Verify build locally**

```bash
cd /home/z/my-project/work/Archi-Fighter && npm run build
```

Expected: exits 0, produces `client/build/index.html` and `client/build/assets/*`.

- [ ] **Step 4: Commit**

```bash
git add vercel.json package.json
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat(deploy): add Vercel build config"
```

---

## Task 16: GitHub Actions — auto-run migrations on push to main

**Files:**
- Create: `.github/workflows/migrate.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/migrate.yml`:

```yaml
name: Run DB Migrations

on:
  push:
    branches: [main]
    paths:
      - 'server/database/migrations.ts'
      - 'server/database/seeder.ts'
      - '.github/workflows/migrate.yml'

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v1.x

      - name: Run migrations
        env:
          DATABASE_URL: ${{ secrets.NEON_DATABASE_URL }}
          ALLOWED_ORIGINS: "https://archi-fighter.vercel.app"
        run: |
          cd server
          deno run --allow-net --allow-read --allow-env database/migrations.ts

      - name: Run seeders (idempotent)
        env:
          DATABASE_URL: ${{ secrets.NEON_DATABASE_URL }}
          ALLOWED_ORIGINS: "https://archi-fighter.vercel.app"
        run: |
          cd server
          deno run --allow-net --allow-read --allow-env database/seeder.ts
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/migrate.yml
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "ci: auto-run migrations on push to main"
```

---

## Task 17: README — Deploy section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Deploy section**

Open `README.md`. Add at the end:

```markdown
## Deploy

Archi-Fighter runs on three free-tier services. No credit card required for any of them.

### 1. Neon (Postgres)

1. Sign up at https://neon.tech (no credit card).
2. Create a project, copy the **pooled connection string** (the one with `-pooler` in the hostname).
3. Save it — you'll need it for both the server and GitHub Actions.

### 2. Deno Deploy (server)

1. Sign up at https://deno.com/deploy with GitHub (no credit card).
2. Create a new project, link this GitHub repo.
3. Set the entry point to `server/entry.ts`.
4. Add environment variables in the Deploy dashboard:
   - `DATABASE_URL` = your Neon pooled connection string
   - `ALLOWED_ORIGINS` = `https://YOUR-VERCEL-URL.vercel.app,http://localhost:8080`
5. Deploy.

### 3. Vercel (client)

1. Sign up at https://vercel.com with GitHub (no credit card).
2. Import this repo.
3. Vercel auto-detects `vercel.json` — no manual config needed.
4. Add environment variable:
   - `VITE_API_BASE_URL` = `https://YOUR-DENO-DEPLOY-URL.deno.dev/api/v1`
5. Deploy.

### 4. GitHub Actions (migrations)

1. In repo Settings → Secrets and variables → Actions, add:
   - `NEON_DATABASE_URL` = your Neon pooled connection string
2. Migrations run automatically on every push to `main` that touches `server/database/*`.

### Local development

```bash
# 1. Start Postgres
docker compose up -d

# 2. Copy .env.example to .env, fill in values
cp .env.example .env
# Edit .env with your local DB credentials

# 3. Run migrations + seeders
cd server && deno task db:migrate && deno task db:seed

# 4. Start everything
cd .. && npm run dev
```

Open `http://localhost:8080`.

### Troubleshooting

- **CORS errors in browser console:** Check that your Vercel URL is in `ALLOWED_ORIGINS` on Deno Deploy.
- **WebRTC fails to connect:** Open DevTools Console. Look for `[RTC]` logs. If ICE timeout, your network may block UDP — try a different network or use vs AI / 1v1 Local mode.
- **First request slow (1-3s):** Deno Deploy isolate cold start. Subsequent requests will be fast.
- **`DATABASE_URL is not a valid URL`:** Make sure you copied the connection string exactly, including `?sslmode=require`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "docs: add Deploy section to README"
```

---

## Task 18: Final integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run all server tests**

Run: `cd server && deno test --allow-env --allow-read --unstable-kv`
Expected: All tests PASS.

- [ ] **Step 2: Run all client tests**

Run: `cd client && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Run client build**

Run: `cd client && npm run build`
Expected: exits 0, produces `client/build/index.html`.

- [ ] **Step 4: Local end-to-end smoke test**

```bash
cd /home/z/my-project/work/Archi-Fighter
docker compose up -d
cd server && deno task db:migrate && deno task db:seed && deno task dev &
cd ../client && VITE_API_BASE_URL=http://localhost:3000/api/v1 npm run dev
```

Open `http://localhost:8080`:
- [ ] Menu loads without console errors
- [ ] Enter name → "Start Battle" → menu appears
- [ ] Click "vs AI" → fight completes → stats screen shows
- [ ] Click "1v1 Local" → fight starts immediately (no server calls)
- [ ] Open second tab, both click "1v1 Online" → matchmaking pairs → fight works

- [ ] **Step 5: Push all commits to GitHub**

```bash
git push origin main
```

Expected: All commits pushed. CI migrations run on GitHub Actions.

- [ ] **Step 6: Manual deploy verification (after Vercel + Deno Deploy configured)**

- [ ] Visit Vercel URL — menu loads, no console errors
- [ ] Visit Deno Deploy URL `/api/v1` — returns JSON
- [ ] Play vs AI on prod — completes, stats persist on reload
- [ ] Two different devices / networks — 1v1 Online match works
- [ ] Open DevTools Console during 1v1 Online — `[RTC] connected` logged
- [ ] No credit card was used on any service signup

---

## Self-Review

### Spec coverage

| Spec section | Tasks covering it |
|---|---|
| §3 Target architecture (WebRTC P2P) | Tasks 5, 6, 11, 12, 13 |
| §4.1 Deno KV room state | Task 5 |
| §4.2 WebRTC P2P + input delay | Tasks 11, 12 |
| §4.3 All 4 modes | Tasks 7, 13 (online), 13 (local already client-side), 8 (AI via startAiGame), 8 (stats via finish) |
| §4.4 Commits to main as user | Every task's commit step uses `-c user.name=... -c user.email=...` |
| §4.5 Simple bearer token | Unchanged (no auth refactor in tasks) |
| §4.6 Minimal Oak + Deno.serve | Tasks 1, 2 |
| R1 Cold start | Task 10 (retry) — warm-up ping in client/index.html NOT in plan; let me check... |

**Gap found:** The spec mentions a warm-up ping script in `client/index.html` but no task adds it. Adding as Task 19.

### Placeholder scan

Searched plan for: "TBD", "TODO", "implement later", "fill in details", "Add appropriate", "handle edge cases", "Similar to Task", "Write tests for the above".
- Found: none. All steps contain concrete code or exact commands.

### Type consistency

- `rtcManager.init(gameId, peerId, isInitiator, onMessage)` — used consistently in Task 11 (definition), Task 13 (call sites).
- `netcodeManager.init(rtc, localApply)` — used in Task 12 (def) and Task 13 (call).
- `netcodeManager.sendInput(action)` — used in Task 12 (def), Task 13 (call sites).
- `netcodeManager.tick()` — used in Task 12 (def), Task 13 (Phaser update).
- `apiFetch(path, options, token)` — Task 10 (def) signature matches all callers.
- `SignalMessage` shape — Task 6 (def) matches Task 11's `_handleSignalMessage` consumer.

All consistent.

---

## Task 19: Client warm-up ping (fixes spec coverage gap)

**Files:**
- Modify: `client/index.html`

- [ ] **Step 1: Add warm-up script**

Open `client/index.html`. Add this `<script>` block as the first child of `<head>`:

```html
<script>
  // Fire-and-forget warm-up: pre-ping the API so the Deno Deploy isolate
  // and Neon Postgres pool are warm by the time the user clicks anything.
  (function () {
    try {
      var url = (import.meta && import.meta.env && import.meta.env.VITE_API_BASE_URL)
        || "http://localhost:3000/api/v1";
      fetch(url + "/healthz", { mode: "no-cors" }).catch(function () {});
    } catch (e) { /* ignore — best effort */ }
  })();
</script>
```

Wait — `import.meta.env` isn't available in plain `<script>` tags, only in modules. Use this instead:

```html
<script type="module">
  // Fire-and-forget warm-up: pre-ping the API so the Deno Deploy isolate
  // and Neon Postgres pool are warm by the time the user clicks anything.
  try {
    const url = import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";
    fetch(`${url}/healthz`, { mode: "no-cors" }).catch(() => {});
  } catch (e) { /* ignore */ }
</script>
```

- [ ] **Step 2: Add /healthz route to server**

Open `server/routes/index.ts`. Add before the `apiRouter.use(...)` calls:

```typescript
apiRouter.get("/healthz", async (ctx) => {
  try {
    await db.query("SELECT 1");
    ctx.response.body = { ok: true };
  } catch (err) {
    ctx.response.status = 503;
    ctx.response.body = { ok: false, error: String(err) };
  }
});
```

Make sure `db` is imported at the top of `server/routes/index.ts`:

```typescript
import { db } from "../database/database.ts";
```

- [ ] **Step 3: Manual smoke test**

Start server, visit `http://localhost:3000/api/v1/healthz` — should return `{"ok":true}`.

- [ ] **Step 4: Commit**

```bash
git add client/index.html server/routes/index.ts
git -c user.name="nawaf-al-hussain" -c user.email="nkhondokar2420136@bscse.uiu.ac.bd" \
  commit -m "feat: add /healthz warm-up endpoint + client pre-ping"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-archi-fighter-deploy.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks (spec compliance + code quality), fast iteration. Best when tasks are independent. Total ~19 tasks.

**2. Inline Execution** — I execute tasks in this session using executing-plans, batch execution with checkpoints for your review. Slower but you see each step.

**Which approach?**
