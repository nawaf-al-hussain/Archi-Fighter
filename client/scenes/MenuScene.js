import Phaser from "phaser";
import { authManager  } from "../managers/auth.manager.js";
import { playerService } from "../services/player.service.js";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: "MenuScene" });
  }

  create() {
    this._setupBackground();
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
        // Optimistic: continue with cached player data
        const cached = authManager.getPlayer();
        if (cached) this._showGameModeModal(cached);
        else this._showNameModal();
      }
    }
  }

  _showNameModal() {
    const modal  = document.getElementById("modal-name");
    const input  = document.getElementById("input-pseudo");
    const button = document.getElementById("btn-confirm-name");

    modal.classList.remove("hidden");
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
        modal.classList.add("hidden");
        this._showGameModeModal(player);
      } catch (err) {
        console.error("Failed to create player:", err);
        button.disabled = false;
      }
    };

    button.addEventListener("click", confirm, { once: true });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirm();
    }, { once: true });
  }

  _showGameModeModal(player) {
    const modal   = document.getElementById("modal-gamemode");
    const welcome = document.getElementById("welcome-text");
    const btn1v1  = document.getElementById("btn-1v1");
    const btnAI   = document.getElementById("btn-ai");

    welcome.textContent = `Welcome, ${player.pseudo}!`;
    modal.classList.remove("hidden");

    btn1v1.addEventListener("click", () => this._selectMode("1VS1"),  { once: true });
    btnAI .addEventListener("click", () => this._selectMode("1VSAI"), { once: true });
  }

  _selectMode(mode) {
    const modal = document.getElementById("modal-gamemode");
    modal.classList.add("hidden");
    console.log(`Game mode selected: ${mode}`);
    // TODO: transition to LobbyScene or CharacterSelectScene with { mode }
    // this.scene.start("CharacterSelectScene", { mode });
  }
}
