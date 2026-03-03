import type { RouterContext } from "oak";
import { gameModel } from "../models/game.model.ts";
import { playerModel } from "../models/player.model.ts";
import { gameManager } from "../websocket/game.manager.ts";

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
  const { map_id } = await body.value;

  if (!map_id) {
    ctx.response.status = 400;
    ctx.response.body = { error: "map_id is required" };
    return;
  }

  try {
    const game = await gameModel.create(map_id, "1VS1");
    // Room is created with creator's player id — character is registered at WS connect time
    gameManager.create(game.id, map_id, player.id);

    ctx.response.status = 201;
    ctx.response.body = { game_id: game.id, status: game.status };
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to create game" };
    console.error(err);
  }
};

/**
 * GET /api/v1/games/:id/ws
 * Upgrade to WebSocket. Character selection happens inside the room via
 * char_ready messages — no character_id needed at connect time.
 *
 * Query: ?token=<token>
 */
export const connect = async (ctx: RouterContext<string>) => {
  if (!ctx.isUpgradable) {
    ctx.response.status = 426;
    ctx.response.body = { error: "WebSocket upgrade required" };
    return;
  }

  const gameId = Number(ctx.params.id);
  if (isNaN(gameId)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid game id" };
    return;
  }

  const params = ctx.request.url.searchParams;
  const token  = params.get("token");

  if (!token) {
    ctx.response.status = 400;
    ctx.response.body = { error: "token query param is required" };
    return;
  }

  const player = await playerModel.getByToken(token);
  if (!player) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid token" };
    return;
  }

  const room = gameManager.get(gameId);
  if (!room) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Game not found or already finished" };
    return;
  }

  // Creator is always team 1; any other authenticated player is team 2
  const team: 1 | 2 = player.id === room.creatorId ? 1 : 2;

  if (team === 2 && room.isFull) {
    ctx.response.status = 409;
    ctx.response.body = { error: "Game is already full" };
    return;
  }

  const ws = ctx.upgrade();
  room.addPlayer(team, ws, player);
};
