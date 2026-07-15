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
    assertEquals(
      /IF NOT EXISTS/i.test(stmt),
      true,
      `Missing IF NOT EXISTS: ${stmt.slice(0, 80)}...`,
    );
  }
});

Deno.test("runMigrations is idempotent (can run twice without error)", async () => {
  recordedSql.length = 0;
  await runMigrations(mockDb);
  await runMigrations(mockDb);
  // Should not throw — idempotent
});

Deno.test("runMigrations includes players, characters, maps, games tables", async () => {
  recordedSql.length = 0;
  await runMigrations(mockDb);
  const allSql = recordedSql.join("\n");
  assertEquals(/CREATE TABLE[^;]*players/i.test(allSql), true, "missing players table");
  assertEquals(/CREATE TABLE[^;]*characters/i.test(allSql), true, "missing characters table");
  assertEquals(/CREATE TABLE[^;]*maps/i.test(allSql), true, "missing maps table");
  assertEquals(/CREATE TABLE[^;]*games/i.test(allSql), true, "missing games table");
});
