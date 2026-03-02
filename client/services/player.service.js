import { apiFetch } from "./api.service.js";

export const playerService = {
  /**
   * Register a new anonymous player.
   * @param {string} pseudo
   * @returns {Promise<{id: number, pseudo: string, token: string, created_at: string, updated_at: string}>}
   */
  create(pseudo) {
    return apiFetch("/players", {
      method: "POST",
      body: JSON.stringify({ pseudo }),
    });
  },

  /**
   * Retrieve the player associated with a token.
   * @param {string} token
   */
  getMe(token) {
    return apiFetch("/players/me", {}, token);
  },

  /**
   * Update the pseudo of the authenticated player.
   * @param {string} token
   * @param {string} pseudo
   */
  updateMe(token, pseudo) {
    return apiFetch("/players/me", {
      method: "PATCH",
      body: JSON.stringify({ pseudo }),
    }, token);
  },

  /**
   * Fetch menu stats for the authenticated player.
   * @param {string} token
   */
  getMyStats(token) {
    return apiFetch("/players/me/stats", {}, token);
  },
};
