const WS_BASE = "ws://localhost:3000/api/v1";

/**
 * Singleton WebSocket manager for the active game connection.
 *
 * Selection phase:
 *   wsManager.connect(gameId, token)
 *            .on("waiting",              () => { ... })
 *            .on("lobby_joined",         () => { ... })
 *            .on("opponent_char_hover",  (data) => { ... })
 *            .on("opponent_char_ready",  (data) => { ... })
 *            .on("game_start",           (data) => { ... })
 *
 *   wsManager.sendCharHover(characterId);
 *   wsManager.sendCharReady(characterId);
 *
 * Fight phase:
 *   wsManager.sendInput("punch");
 *   wsManager.sendRoundEnd(winnerTeam);
 *   wsManager.disconnect();
 */
class WsManager {
  /** @type {WebSocket|null} */
  ws = null;

  /** @type {Record<string, Function>} */
  _handlers = {};

  /**
   * Open a WebSocket to the game room.
   * Character selection is done via sendCharReady() after connecting.
   * @param {number} gameId
   * @param {string} token  Player auth token
   */
  connect(gameId, token) {
    this.disconnect(); // close any existing connection first

    const url = `${WS_BASE}/games/${gameId}/ws?token=${
      encodeURIComponent(token)
    }`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log(`[WS] Connected to game ${gameId}`);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const handler = this._handlers[msg.type];
        if (handler) {
          handler(msg.data ?? msg);
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      console.log("[WS] Connection closed");
      const h = this._handlers["disconnect"];
      if (h) {
        h({});
      }
    };

    this.ws.onerror = (err) => {
      console.error("[WS] Error:", err);
    };

    return this; // allow chaining .on(...)
  }

  /**
   * Register a handler for a specific server message type.
   * @param {string}   type
   * @param {Function} handler
   */
  on(type, handler) {
    this._handlers[type] = handler;
    return this;
  }

  /** Remove a handler. */
  off(type) {
    delete this._handlers[type];
    return this;
  }

  /** Send a raw message object. */
  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ─── Selection phase ──────────────────────────────────────────────────────

  /** Broadcast which character you are hovering (real-time preview for opponent). */
  sendCharHover(characterId) {
    this.send({ type: "char_hover", data: { character_id: characterId } });
  }

  /** Confirm your character choice. The game starts when both players call this. */
  sendCharReady(characterId) {
    this.send({ type: "char_ready", data: { character_id: characterId } });
  }

  // ─── Fight phase ──────────────────────────────────────────────────────────

  /** Send a player input action. */
  sendInput(action) {
    this.send({ type: "input", data: { action } });
  }

  /** Report that a round has ended. */
  sendRoundEnd(winnerTeam) {
    this.send({ type: "round_end", data: { winner_team: winnerTeam } });
  }

  /** Send a keepalive ping. */
  ping() {
    this.send({ type: "ping" });
  }

  /** Close the connection and clear all handlers. */
  disconnect() {
    if (this.ws) {
      this.ws.onclose = null; // prevent handler firing on intentional close
      this.ws.close();
      this.ws = null;
    }
    this._handlers = {};
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsManager = new WsManager();
