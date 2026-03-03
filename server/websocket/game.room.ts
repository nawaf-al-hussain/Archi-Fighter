import type { Player } from "../types/types.ts";
import type { ClientMessage, ServerMessage, InputAction } from "./ws.types.ts";
import { gameModel } from "../models/game.model.ts";

interface Slot {
  ws:     WebSocket;
  player: Player;
}

export class GameRoom {
  readonly gameId:    number;
  readonly mapId:     number;
  /** Player id of the user who created the game — they become team 1 */
  readonly creatorId: number;

  private slots          = new Map<1 | 2, Slot>();
  /** Character confirmed (char_ready) by each team during the selection phase */
  private confirmedChars = new Map<1 | 2, number>();
  private currentRound   = 1;
  private roundWins: Record<1 | 2, number> = { 1: 0, 2: 0 };
  private onCleanup:  () => void;

  constructor(gameId: number, mapId: number, creatorId: number, onCleanup: () => void) {
    this.gameId    = gameId;
    this.mapId     = mapId;
    this.creatorId = creatorId;
    this.onCleanup = onCleanup;
  }

  get playerCount() { return this.slots.size; }
  get isFull()      { return this.slots.size === 2; }

  // ─── Public ───────────────────────────────────────────────────────────────

  /** Called by the controller after WS upgrade. No character selected yet. */
  addPlayer(team: 1 | 2, ws: WebSocket, player: Player): void {
    this.slots.set(team, { ws, player });
    this._setupWsHandlers(ws, team);

    if (this.isFull) {
      // Both players are in the lobby — signal both to start selecting
      this._broadcast({ type: "lobby_joined" });
    } else {
      this._send(ws, { type: "waiting" });
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _setupWsHandlers(ws: WebSocket, team: 1 | 2): void {
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ClientMessage;
        this._handleMessage(team, msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      this.slots.delete(team);
      this._broadcastExcept(team, { type: "opponent_disconnected" });
      if (this.slots.size === 0) {
        this.onCleanup();
      }
    };

    ws.onerror = (err) => {
      console.error(`[GameRoom ${this.gameId}] WebSocket error (team ${team}):`, err);
    };
  }

  private _handleMessage(team: 1 | 2, msg: ClientMessage): void {
    const opponent: 1 | 2 = team === 1 ? 2 : 1;

    switch (msg.type) {
      // ── Selection phase ─────────────────────────────────────────────────
      case "char_hover":
        this._broadcastExcept(team, {
          type: "opponent_char_hover",
          data: { character_id: msg.data.character_id },
        });
        break;

      case "char_ready": {
        const charId = msg.data.character_id;
        this.confirmedChars.set(team, charId);
        this._broadcastExcept(team, {
          type: "opponent_char_ready",
          data: { character_id: charId },
        });
        if (this.confirmedChars.size === 2) {
          this._startGame();
        }
        break;
      }

      // ── Fight phase ──────────────────────────────────────────────────────
      case "input":
        this._sendToTeam(opponent, {
          type: "opponent_input",
          data: { action: msg.data.action as InputAction },
        });
        break;

      case "round_end":
        this._resolveRound(msg.data.winner_team);
        break;

      case "ping": {
        const slot = this.slots.get(team);
        if (slot) {
          this._send(slot.ws, { type: "pong" });
        }
        break;
      }
    }
  }

  private async _startGame(): Promise<void> {
    await gameModel.setStatus(this.gameId, "ongoing");

    // Persist both players' character choices to the DB
    for (const [team, slot] of this.slots) {
      const charId = this.confirmedChars.get(team)!;
      await gameModel.addPlayer(this.gameId, slot.player.id, charId, team);
    }

    const players = Array.from(this.slots.entries()).map(([team, slot]) => ({
      team,
      pseudo:       slot.player.pseudo,
      character_id: this.confirmedChars.get(team)!,
    }));

    for (const [team, slot] of this.slots) {
      this._send(slot.ws, {
        type: "game_start",
        data: {
          game_id:   this.gameId,
          map_id:    this.mapId,
          your_team: team,
          players,
        },
      });
    }
  }

  private async _resolveRound(winnerTeam: 1 | 2): Promise<void> {
    await gameModel.addRound(this.gameId, this.currentRound, winnerTeam);
    this.roundWins[winnerTeam]++;

    this._broadcast({
      type: "round_result",
      data: { round: this.currentRound, winner_team: winnerTeam },
    });

    this.currentRound++;

    if (this.roundWins[1] >= 2 || this.roundWins[2] >= 2) {
      const gameWinner: 1 | 2 = this.roundWins[1] >= 2 ? 1 : 2;
      await gameModel.finish(this.gameId, gameWinner);
      this._broadcast({ type: "game_over", data: { winning_team: gameWinner } });
      this.onCleanup();
    }
  }

  private _broadcast(msg: ServerMessage): void {
    for (const slot of this.slots.values()) {
      this._send(slot.ws, msg);
    }
  }

  private _broadcastExcept(excludeTeam: 1 | 2, msg: ServerMessage): void {
    for (const [team, slot] of this.slots) {
      if (team !== excludeTeam) {
        this._send(slot.ws, msg);
      }
    }
  }

  private _sendToTeam(team: 1 | 2, msg: ServerMessage): void {
    const slot = this.slots.get(team);
    if (slot) {
      this._send(slot.ws, msg);
    }
  }

  private _send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
