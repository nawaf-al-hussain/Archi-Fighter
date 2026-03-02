import Phaser from "phaser";
import { authManager } from "../managers/auth.manager.js";
import { modalManager } from "../managers/modal.manager.js";
import { playerService } from "../services/player.service.js";

export class StatsScene extends Phaser.Scene {
  constructor() {
    super({ key: "StatsScene" });
    this.player = null;
  }

  init(data) {
    this.player = data?.player ?? null;
  }

  create() {
    this._setupBackground();
    this._bindUiEvents();
    this._showStatsModal();
  }

  _setupBackground() {
    const { width, height } = this.scale;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a0a, 0x0a0a0a, 0x1a1a2e, 0x1a1a2e, 1);
    bg.fillRect(0, 0, width, height);
  }

  async _showStatsModal() {
    modalManager.closeModal("modal-name");
    modalManager.closeModal("modal-gamemode");
    modalManager.closeModal("modal-settings");
    modalManager.showModal("modal-stats");

    await this._loadAndRenderStats();
  }

  _bindUiEvents() {
    const backButton = document.getElementById("btn-back-from-stats");
    backButton.onclick = () => {
      modalManager.closeModal("modal-stats");
      this.scene.start("MenuScene");
    };
  }

  async _loadAndRenderStats() {
    const token = authManager.getToken();
    if (!token) {
      this.scene.start("MenuScene");
      return;
    }

    const statsPlayerName = document.getElementById("stats-player-name");
    const statTotalGames = document.getElementById("stat-total-games");
    const statGamesWon = document.getElementById("stat-games-won");
    const statGamesLost = document.getElementById("stat-games-lost");
    const statWinRate = document.getElementById("stat-win-rate");
    const statWorstOpponent = document.getElementById("stat-worst-opponent");
    const statWorstOpponentLosses = document.getElementById("stat-worst-opponent-losses");

    try {
      const stats = await playerService.getMyStats(token);
      const pseudo = stats.pseudo ?? this.player?.pseudo ?? "Unknown";

      statsPlayerName.textContent = `Fighter: ${pseudo}`;
      statTotalGames.textContent = String(stats.total_games ?? 0);
      statGamesWon.textContent = String(stats.games_won ?? 0);
      statGamesLost.textContent = String(stats.games_lost ?? 0);
      statWinRate.textContent = `${stats.win_rate ?? 0}%`;
      statWorstOpponent.textContent = stats.toughest_opponent ?? "N/A";
      statWorstOpponentLosses.textContent = String(stats.toughest_opponent_losses ?? 0);
    } catch (err) {
      console.error("Failed to fetch player stats:", err);
      statsPlayerName.textContent = `Fighter: ${this.player?.pseudo ?? "Unknown"}`;
      statTotalGames.textContent = "0";
      statGamesWon.textContent = "0";
      statGamesLost.textContent = "0";
      statWinRate.textContent = "0%";
      statWorstOpponent.textContent = "N/A";
      statWorstOpponentLosses.textContent = "0";
    }
  }
}
