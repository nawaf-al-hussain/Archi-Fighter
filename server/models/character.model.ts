import { db } from "../database/database.ts";
import { BaseModel } from "./base.model.ts";
import type { Character } from "../types/types.ts"

/*
* CharacterModel inherits from BaseModel that has basic getters and setters
* Implement here only specifics about the class if there is some redundancy then
* it should maybe inherits from another abstract class
*/
export class CharacterModel extends BaseModel<Character> {

	protected table = "characters";

	// character-specific queries go here
	async getByName(name: string): Promise<Character | null> {
		const rows = await db.query<Character>(
			`SELECT * FROM ${this.table} WHERE name = $1`,
			[name]
		);
		return rows[0] ?? null;
	} 

}

export const characterModel = new CharacterModel();
