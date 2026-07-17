const TOKEN_KEY  = "arch_rivals_token";

export const authManager = {
  /** @returns {string|null} */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },


  /** @param {object} player */
  savePlayer(player) {
    localStorage.setItem(TOKEN_KEY,  player.token);
  },

  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },

  isAuthenticated() {
    return Boolean(this.getToken());
  },
};
