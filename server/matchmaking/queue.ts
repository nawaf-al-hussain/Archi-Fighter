const QUEUE_KEY = ["matchmaking", "queue"];

interface QueueEntry {
  player_id: number;
  joined_at: number;
}

let kv: Deno.Kv | null = null;

async function getKv(): Promise<Deno.Kv> {
  if (!kv) {
    kv = await Deno.openKv();
  }
  return kv;
}

export async function resetQueue(): Promise<void> {
  const k = await getKv();
  const entries = k.list<QueueEntry>({ prefix: QUEUE_KEY });
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

    // Atomic: only match if this entry still exists (versionstamp check)
    const gameId = Date.now();
    const gameKey = ["games", gameId];
    const atomic = k.atomic()
      .check({ key: entry.key, versionstamp: entry.versionstamp })
      .delete(entry.key)
      .set(gameKey, {
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
