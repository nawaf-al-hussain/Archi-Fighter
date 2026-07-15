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
