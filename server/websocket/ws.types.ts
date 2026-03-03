// ─── Client → Server ─────────────────────────────────────────────────────────

export type InputAction =
  | "move_left"
  | "move_right"
  | "move_stop"
  | "jump"
  | "punch"
  | "kick"
  | "special"
  | "block";

export type ClientMessage =
  | { type: "char_hover";  data: { character_id: number } }
  | { type: "char_ready";  data: { character_id: number } }
  | { type: "input";       data: { action: InputAction } }
  | { type: "round_end";   data: { winner_team: 1 | 2 } }
  | { type: "ping" };

// ─── Server → Client ─────────────────────────────────────────────────────────

export interface GameStartData {
  game_id:   number;
  map_id:    number;
  your_team: 1 | 2;
  players: {
    team:         1 | 2;
    pseudo:       string;
    character_id: number;
  }[];
}

export type ServerMessage =
  | { type: "waiting" }
  | { type: "lobby_joined" }
  | { type: "opponent_char_hover"; data: { character_id: number } }
  | { type: "opponent_char_ready"; data: { character_id: number } }
  | { type: "game_start";           data: GameStartData }
  | { type: "opponent_input";       data: { action: InputAction } }
  | { type: "round_result";         data: { round: number; winner_team: 1 | 2 } }
  | { type: "game_over";            data: { winning_team: 1 | 2 } }
  | { type: "opponent_disconnected" }
  | { type: "error";                message: string }
  | { type: "pong" };
