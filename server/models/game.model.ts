import { db } from "../database/database.ts";
import { BaseModel } from "./base.model.ts";
import type { Game, GamePlayer } from "../types/types.ts";

export class GameModel extends BaseModel<Game> {
  protected table = "games";

  async create(mapId: number, type: string): Promise<Game> {
    const rows = await db.query<Game>(
      `INSERT INTO games (type, status, map_id)
       VALUES ($1, 'pending', $2)
       RETURNING *`,
      [type, mapId],
    );
    return rows[0];
  }

  async addPlayer(
    gameId: number,
    playerId: number | null,
    characterId: number,
    team: 1 | 2,
  ): Promise<GamePlayer> {
    const rows = await db.query<GamePlayer>(
      `INSERT INTO game_players (game_id, player_id, character_id, team)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [gameId, playerId, characterId, team],
    );
    return rows[0];
  }

  async getGamePlayer(gameId: number, playerId: number): Promise<GamePlayer | null> {
    const rows = await db.query<GamePlayer>(
      `SELECT * FROM game_players WHERE game_id = $1 AND player_id = $2`,
      [gameId, playerId],
    );
    return rows[0] ?? null;
  }

  async setStatus(gameId: number, status: "pending" | "ongoing" | "finished"): Promise<void> {
    await db.query(
      `UPDATE games SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, gameId],
    );
  }

  async addRound(gameId: number, round: number, winnerTeam: 1 | 2): Promise<void> {
    await db.query(
      `INSERT INTO rounds (game_id, round, winner_team) VALUES ($1, $2, $3)`,
      [gameId, round, winnerTeam],
    );
  }

  async finish(gameId: number, winningTeam: 1 | 2): Promise<void> {
    await db.query(
      `UPDATE games
       SET status = 'finished', winning_team = $1, updated_at = NOW()
       WHERE id = $2`,
      [winningTeam, gameId],
    );
  }
}

export const gameModel = new GameModel();
