import { db } from "../database/database.ts";
import { BaseModel } from "./base.model.ts";
import type { Player, PlayerStats } from "../types/types.ts";

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

  async updatePseudo(id: number, pseudo: string): Promise<Player | null> {
    const rows = await db.query<Player>(
      `
        UPDATE players
        SET pseudo = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [pseudo, id],
    );
    return rows[0] ?? null;
  }

  async getStats(playerId: number): Promise<PlayerStats | null> {
    const rows = await db.query<PlayerStats>(
      `
        WITH me AS (
          SELECT id, pseudo
          FROM players
          WHERE id = $1
        ),
        base AS (
          SELECT
            g.id AS game_id,
            g.winning_team,
            gp.team AS my_team
          FROM games g
          JOIN game_players gp ON gp.game_id = g.id
          WHERE gp.player_id = $1
            AND g.status = 'finished'
        ),
        totals AS (
          SELECT
            COUNT(*)::int AS total_games,
            COUNT(*) FILTER (WHERE winning_team = my_team)::int AS games_won,
            COUNT(*) FILTER (WHERE winning_team IS NOT NULL AND winning_team <> my_team)::int AS games_lost
          FROM base
        ),
        opponents AS (
          SELECT
            p2.pseudo,
            COUNT(*) FILTER (WHERE g.winning_team = gp2.team AND g.winning_team <> gp1.team)::int AS losses_against
          FROM games g
          JOIN game_players gp1 ON gp1.game_id = g.id AND gp1.player_id = $1
          JOIN game_players gp2 ON gp2.game_id = g.id AND gp2.player_id IS NOT NULL AND gp2.player_id <> $1
          JOIN players p2 ON p2.id = gp2.player_id
          WHERE g.status = 'finished'
          GROUP BY p2.pseudo
          ORDER BY losses_against DESC, p2.pseudo ASC
          LIMIT 1
        )
        SELECT
          me.pseudo,
          totals.total_games,
          totals.games_won,
          totals.games_lost,
          CASE
            WHEN totals.total_games = 0 THEN 0
            ELSE ROUND((totals.games_won::numeric * 100) / totals.total_games)::int
          END::int AS win_rate,
          opponents.pseudo AS toughest_opponent,
          COALESCE(opponents.losses_against, 0)::int AS toughest_opponent_losses
        FROM me
        CROSS JOIN totals
        LEFT JOIN opponents ON TRUE
      `,
      [playerId],
    );

    return rows[0] ?? null;
  }
}

export const playerModel = new PlayerModel();
