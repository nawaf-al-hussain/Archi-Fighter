import type { RouterContext } from "oak";
import { mapModel } from "../models/map.model.ts";

export const getAll = async (ctx: RouterContext<string>) => {
  const maps = await mapModel.getAll();
  ctx.response.body = maps;
};

export const getById = async (ctx: RouterContext<string>) => {
  const id = Number(ctx.params.id);
  if (isNaN(id)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid id" };
    return;
  }
  const map = await mapModel.getById(id);
  if (!map) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Map not found" };
    return;
  }
  ctx.response.body = map;
};
