import type { RouterContext } from "oak";
import { playerModel } from "../models/player.model.ts";

const extractBearerToken = (ctx: RouterContext<string>) => {
  const authHeader = ctx.request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
};

const getAuthenticatedPlayer = async (ctx: RouterContext<string>) => {
  const token = extractBearerToken(ctx);
  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Missing or invalid Authorization header" };
    return null;
  }

  const player = await playerModel.getByToken(token);
  if (!player) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Player not found" };
    return null;
  }

  return player;
};

export const create = async (ctx: RouterContext<string>) => {
  const body = await ctx.request.body({ type: "json" });
  const { pseudo } = await body.value;

  if (!pseudo || typeof pseudo !== "string") {
    ctx.response.status = 400;
    ctx.response.body = { error: "pseudo is required" };
    return;
  }

  const token = crypto.randomUUID();
  try {
    const player = await playerModel.create(pseudo, token);
    ctx.response.status = 201;
    ctx.response.body = player;
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to create player" };
    console.error(err);
  }
};

export const getMe = async (ctx: RouterContext<string>) => {
  const player = await getAuthenticatedPlayer(ctx);
  if (!player) {
    return;
  }

  ctx.response.body = player;
};

export const updateMe = async (ctx: RouterContext<string>) => {
  const player = await getAuthenticatedPlayer(ctx);
  if (!player) {
    return;
  }

  const body = await ctx.request.body({ type: "json" });
  const { pseudo } = await body.value;

  if (!pseudo || typeof pseudo !== "string") {
    ctx.response.status = 400;
    ctx.response.body = { error: "pseudo is required" };
    return;
  }

  const trimmedPseudo = pseudo.trim();
  if (!trimmedPseudo || trimmedPseudo.length > 32) {
    ctx.response.status = 400;
    ctx.response.body = { error: "pseudo must be between 1 and 32 characters" };
    return;
  }

  try {
    const updatedPlayer = await playerModel.updatePseudo(player.id, trimmedPseudo);
    if (!updatedPlayer) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Player not found" };
      return;
    }
    ctx.response.body = updatedPlayer;
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to update player" };
    console.error(err);
  }
};

export const getMyStats = async (ctx: RouterContext<string>) => {
  const player = await getAuthenticatedPlayer(ctx);
  if (!player) {
    return;
  }

  try {
    const stats = await playerModel.getStats(player.id);
    ctx.response.body = stats ?? {
      pseudo: player.pseudo,
      total_games: 0,
      games_won: 0,
      games_lost: 0,
      win_rate: 0,
      toughest_opponent: null,
      toughest_opponent_losses: 0,
    };
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch player stats" };
    console.error(err);
  }
};
