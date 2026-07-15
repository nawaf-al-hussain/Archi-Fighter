import { apiFetch } from "./api.service.js";
import { authManager } from "../managers/auth.manager.js";

export const gameService = {
  /** Fetch all available characters from the API. */
  fetchCharacters() {
    return apiFetch("/characters");
  },

  /** Fetch all available maps from the API. */
  fetchMaps() {
    return apiFetch("/maps");
  },

  /**
   * Create a 1VS1 lobby. Character selection happens at WS connect time.
   * @param {number} mapId
   * @returns {Promise<{ game_id: number, status: string }>}
   */
  createGame(mapId) {
    return apiFetch("/games", {
      method: "POST",
      body: JSON.stringify({ map_id: mapId }),
    }, authManager.getToken());
  },

  startAiGame(mapId, myCharacterId, aiCharacterId) {
    return apiFetch("/games/ai/start", {
      method: "POST",
      body: JSON.stringify({
        map_id: mapId,
        my_character_id: myCharacterId,
        ai_character_id: aiCharacterId,
      }),
    }, authManager.getToken());
  },

  saveRound(gameId, round, winnerTeam) {
    return apiFetch(`/games/${gameId}/rounds`, {
      method: "POST",
      body: JSON.stringify({ round, winner_team: winnerTeam }),
    }, authManager.getToken());
  },

  finishGame(gameId, winningTeam) {
    return apiFetch(`/games/${gameId}/finish`, {
      method: "PATCH",
      body: JSON.stringify({ winning_team: winningTeam }),
    }, authManager.getToken());
  },

  // ─── WebRTC signaling (replaces old WS connect) ────────────────────

  postOffer: (gameId, from, sdp) =>
    apiFetch(`/games/${gameId}/signal/offer`, {
      method: "POST",
      body: JSON.stringify({ from, sdp }),
    }),

  postAnswer: (gameId, from, sdp) =>
    apiFetch(`/games/${gameId}/signal/answer`, {
      method: "POST",
      body: JSON.stringify({ from, sdp }),
    }),

  postIce: (gameId, from, candidate) =>
    apiFetch(`/games/${gameId}/signal/ice`, {
      method: "POST",
      body: JSON.stringify({ from, candidate }),
    }),

  pollSignal: (gameId, peer, since) =>
    apiFetch(`/games/${gameId}/signal/poll?peer=${peer}&since=${since}`),
};
