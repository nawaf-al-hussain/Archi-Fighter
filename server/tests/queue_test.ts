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
  // result should be { game_id: <number>, opponent_id: 1 }
  assertEquals("game_id" in result, true, "Expected game_id in result");
  assertEquals("opponent_id" in result, true, "Expected opponent_id in result");
  if ("opponent_id" in result) {
    assertEquals(result.opponent_id, 1);
  }
});

Deno.test("leaveQueue removes player from queue", async () => {
  await resetQueue();
  await joinQueue(1);
  await leaveQueue(1);
  const result = await joinQueue(2);
  assertEquals(result, { status: "waiting" });
  await leaveQueue(2);
});

Deno.test("atomic matchmaking — concurrent joins pair correctly", async () => {
  await resetQueue();
  // Pre-populate with one waiter
  await joinQueue(10);
  // Two players try to match at the same time
  const [r1, r2] = await Promise.all([joinQueue(20), joinQueue(30)]);
  // Exactly one should match player 10; the other should be waiting
  const matched = [r1, r2].filter((r) => "opponent_id" in r);
  const waiting = [r1, r2].filter((r) => "status" in r);
  assertEquals(matched.length, 1, "Exactly one player should match");
  assertEquals(waiting.length, 1, "Exactly one player should be waiting");
  if ("opponent_id" in matched[0]) {
    assertEquals(matched[0].opponent_id, 10);
  }
  await leaveQueue(30); // clean up the loser
});
