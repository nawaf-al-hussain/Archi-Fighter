import type { RouterContext } from "oak";
import { gameModel } from "../models/game.model.ts";
import { playerModel } from "../models/player.model.ts";
import { postOffer as relayOffer, postAnswer as relayAnswer, postIce as relayIce, poll as relayPoll } from "../signaling/relay.ts";

const extractBearerToken = (authHeader: string | null): string | null => {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
};

/**
 * POST /api/v1/games
 * Create a 1VS1 lobby. Returns game_id to share with player 2.
 * Character selection happens at WS connect time for both players.
 *
 * Body: { map_id: number }
 * Auth: Bearer <token>
 */
export const create = async (ctx: RouterContext<string>) => {
  const token = extractBearerToken(ctx.request.headers.get("Authorization"));
  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Missing or invalid Authorization header" };
    return;
  }

  const player = await playerModel.getByToken(token);
  if (!player) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Player not found" };
    return;
  }

  const body    = await ctx.request.body({ type: "json" });
  const { map_id, type } = await body.value;

  if (!map_id) {
    ctx.response.status = 400;
    ctx.response.body = { error: "map_id is required" };
    return;
  }

  try {
    const gameType = type === "1VSAI" ? "1VSAI" : "1VS1";
    const game = await gameModel.create(map_id, gameType);

    ctx.response.status = 201;
    ctx.response.body = { game_id: game.id, status: game.status };
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to create game" };
    console.error(err);
  }
};

/**
 * POST /api/v1/games/ai/start
 * Body: { map_id: number, my_character_id: number, ai_character_id: number }
 */
export const startAiGame = async (ctx: RouterContext<string>) => {
  const token = extractBearerToken(ctx.request.headers.get("Authorization"));
  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Missing or invalid Authorization header" };
    return;
  }

  const player = await playerModel.getByToken(token);
  if (!player) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Player not found" };
    return;
  }

  const body = await ctx.request.body({ type: "json" });
  const { map_id, my_character_id, ai_character_id } = await body.value;

  if (!map_id || !my_character_id || !ai_character_id) {
    ctx.response.status = 400;
    ctx.response.body = { error: "map_id, my_character_id and ai_character_id are required" };
    return;
  }

  try {
    const game = await gameModel.create(map_id, "1VSAI");
    await gameModel.setStatus(game.id, "ongoing");
    await gameModel.addPlayer(game.id, player.id, my_character_id, 1);
    await gameModel.addPlayer(game.id, null, ai_character_id, 2);

    ctx.response.status = 201;
    ctx.response.body = { game_id: game.id, status: "ongoing" };
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to start AI game" };
    console.error(err);
  }
};

/**
 * POST /api/v1/games/:id/rounds
 * Body: { round: number, winner_team: 1 | 2 }
 */
export const addRound = async (ctx: RouterContext<string>) => {
  const gameId = Number(ctx.params.id);
  if (isNaN(gameId)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid game id" };
    return;
  }

  const body = await ctx.request.body({ type: "json" });
  const { round, winner_team } = await body.value;

  if (!round || ![1, 2].includes(winner_team)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "round and winner_team are required" };
    return;
  }

  try {
    await gameModel.addRound(gameId, Number(round), winner_team);
    ctx.response.status = 201;
    ctx.response.body = { ok: true };
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to save round" };
    console.error(err);
  }
};

/**
 * PATCH /api/v1/games/:id/finish
 * Body: { winning_team: 1 | 2 }
 */
export const finishGame = async (ctx: RouterContext<string>) => {
  const gameId = Number(ctx.params.id);
  if (isNaN(gameId)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid game id" };
    return;
  }

  const body = await ctx.request.body({ type: "json" });
  const { winning_team } = await body.value;

  if (![1, 2].includes(winning_team)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "winning_team must be 1 or 2" };
    return;
  }

  try {
    await gameModel.finish(gameId, winning_team);
    ctx.response.body = { ok: true };
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to finish game" };
    console.error(err);
  }
};

/**
 * POST /api/v1/games/:id/signal/offer
 * Body: { from: "p1"|"p2", sdp: RTCSessionDescriptionInit }
 */
export const postOffer = async (ctx: RouterContext<string>) => {
  const gameId = Number(ctx.params.id);
  if (isNaN(gameId)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid game id" };
    return;
  }
  const body = await ctx.request.body({ type: "json" });
  const { from, sdp } = await body.value;
  if (!from || !sdp) {
    ctx.response.status = 400;
    ctx.response.body = { error: "from and sdp are required" };
    return;
  }
  await relayOffer(gameId, from, sdp);
  ctx.response.body = { ok: true };
};

/**
 * POST /api/v1/games/:id/signal/answer
 * Body: { from: "p1"|"p2", sdp: RTCSessionDescriptionInit }
 */
export const postAnswer = async (ctx: RouterContext<string>) => {
  const gameId = Number(ctx.params.id);
  if (isNaN(gameId)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid game id" };
    return;
  }
  const body = await ctx.request.body({ type: "json" });
  const { from, sdp } = await body.value;
  if (!from || !sdp) {
    ctx.response.status = 400;
    ctx.response.body = { error: "from and sdp are required" };
    return;
  }
  await relayAnswer(gameId, from, sdp);
  ctx.response.body = { ok: true };
};

/**
 * POST /api/v1/games/:id/signal/ice
 * Body: { from: "p1"|"p2", candidate: RTCIceCandidateInit }
 */
export const postIce = async (ctx: RouterContext<string>) => {
  const gameId = Number(ctx.params.id);
  if (isNaN(gameId)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid game id" };
    return;
  }
  const body = await ctx.request.body({ type: "json" });
  const { from, candidate } = await body.value;
  if (!from || !candidate) {
    ctx.response.status = 400;
    ctx.response.body = { error: "from and candidate are required" };
    return;
  }
  await relayIce(gameId, from, candidate);
  ctx.response.body = { ok: true };
};

/**
 * GET /api/v1/games/:id/signal/poll?peer=p1&since=0
 * Returns: { messages: SignalMessage[] }
 */
export const pollSignal = async (ctx: RouterContext<string>) => {
  const gameId = Number(ctx.params.id);
  if (isNaN(gameId)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid game id" };
    return;
  }
  const peer = ctx.request.url.searchParams.get("peer") ?? "p1";
  const since = Number(ctx.request.url.searchParams.get("since") ?? "0");
  const msgs = await relayPoll(gameId, peer, since);
  ctx.response.body = { messages: msgs };
};
