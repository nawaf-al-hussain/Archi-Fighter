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
};
