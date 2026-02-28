export interface Character {
  id: number;
  name: string;
  health: number;                 // max HP pool
  speed: number;                  // movement speed multiplier
  attack: number;                 // base damage multiplier
  defense: number;                // damage reduction multiplier
  sprite_key: string;             // maps to the Phaser sprite asset name
}

export interface Map {
  id: number;
  name: string;                   // e.g. "city", "park", etc.
  sprite_key: string;             // maps to the Phaser background asset name
}

export interface Player {
  id: number;
  pseudo: string;
  token: string;                  // UUID for authentication
  created_at: string;             // ISO timestamp
  updated_at: string;             // ISO timestamp
}

/**
 * Represents a game session, which can be a 1v1 match against another player or an AI opponent.
 * The 'type' field indicates the mode of the game, while 'status' tracks its progress.
 * The 'map_id' links to the chosen map for the match, and 'winning_team' is set when the game concludes.
 */
export interface Game {
  id: number;
  type: string;                   // Could be extended later for more modes like "2VS2" or "FFA"
  status: "pending" | "ongoing" | "finished";
  map_id: number;                 // FK to Map table
  winning_team: 1 | 2 | null;     // Player team that won the game, null while ongoing
  created_at: string;             // ISO timestamp
  updated_at: string;             // ISO timestamp
}

/**
 * Represents a player's participation in a game, linking them to their chosen character and team.
 * This is a pivot table between Game, Player, and Character.
 */
export interface GamePlayer {
  id: number;
  game_id: number;                // FK to Game table
  player_id: number | null;       // FK to Player table, null for AI slots
  character_id: number;           // FK to Character table
  team: 1 | 2;                    // Team assignment for the player (1 or 2)
}

export interface Round {
  id: number;
  game_id: number;                // FK to Game table
  round: number;                  // round number, 1 to 3
  winner_team: 1 | 2 | null;      // null while round is ongoing used to track round winners in best-of-3 format
  created_at: string;             // ISO timestamp
}

export interface Image {
  id: number;
  file_name: string;              // e.g. "corbusier.png"
  file_path: string;              // e.g. "/assets/sprites/corbusier.png"
  type: string;                   // type of image for categorization (e.g. "thumbnail", "character", "ui", etc.)
  model_type: string;             // e.g. "character", "map", etc.
  model_id: number;               // id of the associated record
}
