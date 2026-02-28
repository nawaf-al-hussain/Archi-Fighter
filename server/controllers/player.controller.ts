import type { RouterContext } from "oak";
import { playerModel } from "../models/player.model.ts";

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
  const authHeader = ctx.request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Missing or invalid Authorization header" };
    return;
  }
  const token = authHeader.slice(7);
  const player = await playerModel.getByToken(token);
  if (!player) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Player not found" };
    return;
  }
  ctx.response.body = player;
};
