import { db } from "../database/database.ts";
import { BaseModel } from "./base.model.ts";
import type { Player } from "../types/types.ts";

export class PlayerModel extends BaseModel<Player> {
  protected table = "players";

  async getByToken(token: string): Promise<Player | null> {
    const rows = await db.query<Player>(
      `SELECT * FROM ${this.table} WHERE token = $1`,
      [token]
    );
    return rows[0] ?? null;
  }

  async create(pseudo: string, token: string): Promise<Player> {
    const rows = await db.query<Player>(
      `INSERT INTO players (pseudo, token) VALUES ($1, $2) RETURNING *`,
      [pseudo, token]
    );
    return rows[0];
  }
}

export const playerModel = new PlayerModel();
