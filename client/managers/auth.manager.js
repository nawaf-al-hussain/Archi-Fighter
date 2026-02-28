const TOKEN_KEY  = "archi_fighter_token";
const PLAYER_KEY = "archi_fighter_player";

export const authManager = {
  /** @returns {string|null} */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  /** @returns {object|null} parsed player or null */
  getPlayer() {
    const raw = localStorage.getItem(PLAYER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  /** @param {object} player */
  savePlayer(player) {
    localStorage.setItem(TOKEN_KEY,  player.token);
    localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
  },

  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PLAYER_KEY);
  },

  isAuthenticated() {
    return Boolean(this.getToken());
  },
};
