import type { RouterContext } from "oak";
import { characterModel } from "../models/character.model.ts";

export const getAll = async (ctx: RouterContext<string>) => {
	const characters = await characterModel.getAll();
	ctx.response.body = characters;
};

export const getById = async (ctx: RouterContext<string>) => {
	const id = Number(ctx.params.id);
	if (isNaN(id)) {
		ctx.response.status = 400;
		ctx.response.body = { error: "Invalid id" };
		return;
	}
	const character = await characterModel.getById(id);
	if (!character) {
		ctx.response.status = 404;
		ctx.response.body = { error: "Character not found" };
		return;
	}
	ctx.response.body = character;
};
