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
  // Keyed by [gameId, timestamp, uuid] to allow sorted iteration
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
  // List all messages for this game with timestamp > since
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
