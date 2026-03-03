import Phaser from "phaser";
import { authManager  } from "../managers/auth.manager.js";
import { playerService } from "../services/player.service.js";
import { modalManager } from "../managers/modal.manager.js";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: "MenuScene" });
    this.currentPlayer = null;
  }

  create() {
    this._setupBackground();
    this._bindMenuUiEvents();
    modalManager.closeModal("modal-stats");
    this._boot();
  }

  // ─── private ──────────────────────────────────────────────────────────────

  _setupBackground() {
    // Dark gradient background drawn on the canvas
    const { width, height } = this.scale;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a0a, 0x0a0a0a, 0x1a1a2e, 0x1a1a2e, 1);
    bg.fillRect(0, 0, width, height);
  }

  async _boot() {
    if (authManager.isAuthenticated()) {
      await this._verifyToken();
    } else {
      this._showNameModal();
    }
  }

  /** Validate stored token against the server; clear & re-prompt if expired. */
  async _verifyToken() {
    try {
      const player = await playerService.getMe(authManager.getToken());
      authManager.savePlayer(player); // refresh cached data
      this._showGameModeModal(player);
    } catch (err) {
      if (err.status === 401 || err.status === 404) {
        authManager.clear();
        this._showNameModal();
      } else {
        console.error("Server unreachable:", err);
        this._showNameModal();
      }
    }
  }

  _showNameModal() {
    const input  = document.getElementById("input-pseudo");
    const button = document.getElementById("btn-confirm-name");

    modalManager.showModal("modal-name");
    input.focus();

    const confirm = async () => {
      const pseudo = input.value.trim();
      if (!pseudo) {
        input.focus();
        return;
      }
      button.disabled = true;
      try {
        const player = await playerService.create(pseudo);
        authManager.savePlayer(player);
        modalManager.closeModal("modal-name");
        await this._showGameModeModal(player);
      } catch (err) {
        console.error("Failed to create player:", err);
        button.disabled = false;
      }
    };

    button.onclick = confirm;
    input.onkeydown = (e) => {
       if (e.key === "Enter") {
        confirm();
      }
    };
  }

  async _showGameModeModal(player) {
    this.currentPlayer = player;

    const welcome = document.getElementById("welcome-text");
    const btn1v1  = document.getElementById("btn-1v1");
    const btnAI   = document.getElementById("btn-ai");
    const settingsInput = document.getElementById("input-settings-pseudo");
    const openStatsBtn = document.getElementById("btn-open-stats");

    welcome.textContent = `Welcome, ${player.pseudo}!`;
    settingsInput.value = player.pseudo;
    modalManager.showModal("modal-gamemode");

    btn1v1.onclick = () => this._selectMode("1VS1");
    btnAI.onclick  = () => this._selectMode("1VSAI");
    openStatsBtn.onclick = () => this._openStatsScene();
  }

  _selectMode(mode) {
    modalManager.closeModal("modal-gamemode");
    this.scene.start("CharacterSelectScene", { mode });
  }

  _bindMenuUiEvents() {
    const openSettingsBtn = document.getElementById("btn-open-settings");
    const closeSettingsBtn = document.getElementById("btn-close-settings");
    const saveSettingsBtn = document.getElementById("btn-save-settings");
    const settingsInput = document.getElementById("input-settings-pseudo");

    openSettingsBtn.onclick = () => {
      if (!this.currentPlayer) return;
      settingsInput.value = this.currentPlayer.pseudo;
      modalManager.closeModal("modal-gamemode");
      modalManager.showModal("modal-settings");
      settingsInput.focus();
    };

    closeSettingsBtn.onclick = () => {
      modalManager.closeModal("modal-settings");
      modalManager.showModal("modal-gamemode");
    };

    saveSettingsBtn.onclick = async () => {
      await this._savePseudoFromSettings();
    };

    settingsInput.onkeydown = async (e) => {
      if (e.key === "Enter") {
        await this._savePseudoFromSettings();
      }
    };
  }

  async _savePseudoFromSettings() {
    const token = authManager.getToken();
    if (!token || !this.currentPlayer) return;

    const settingsInput = document.getElementById("input-settings-pseudo");
    const saveButton = document.getElementById("btn-save-settings");
    const welcome = document.getElementById("welcome-text");
    const newPseudo = settingsInput.value.trim();

    if (!newPseudo || newPseudo.length > 32) {
      settingsInput.focus();
      return;
    }

    try {
      saveButton.disabled = true;
      const updatedPlayer = await playerService.updateMe(token, newPseudo);
      this.currentPlayer = updatedPlayer;
      welcome.textContent = `Welcome, ${updatedPlayer.pseudo}!`;
      modalManager.closeModal("modal-settings");
      modalManager.showModal("modal-gamemode");
    } catch (err) {
      console.error("Failed to update pseudo:", err);
    } finally {
      saveButton.disabled = false;
    }
  }

  _openStatsScene() {
    if (!this.currentPlayer) {
      return;
    }
    modalManager.closeModal("modal-gamemode");
    this.scene.start("StatsScene", { player: this.currentPlayer });
  }
}
