import Phaser from "phaser";
import { CHARACTER_CONFIGS } from "../config/characters.config.js";
import { MAP_CONFIGS }       from "../config/maps.config.js";
import { authManager }       from "../managers/auth.manager.js";
import { modalManager }      from "../managers/modal.manager.js";
import { gameService }       from "../services/game.service.js";
import { wsManager }         from "../managers/ws.manager.js";

/**
 * CharacterSelectScene — real-time simultaneous character selection.
 *
 * Creator flow:
 *   1. Select map → "Create Lobby" → POST /games → connect WS → invite link shown
 *   2. Both players hover/select chars (updates visible in real-time via WS)
 *   3. Click "Fight! →" → sendCharReady → game starts when both ready
 *
 * Joiner flow (via ?invite=<id>):
 *   1. Scene loads → WS connects immediately
 *   2. Same selection process
 */
export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: "CharacterSelectScene" });
    this._reset();
  }

  _reset() {
    this._mode            = "1VS1";
    this._characters      = [];
    this._maps            = [];
    this._selectedCharId  = null;
    this._selectedMapId   = null;
    this._gameId          = null;
    this._isJoiner        = false;
    this._lobbyCreated    = false;
    this._wsConnected     = false;
    this._myCharReady     = false;
    /** character_id the opponent is hovering (null = none) */
    this._oppHoverCharId  = null;
    /** character_id the opponent has locked in (null = not yet) */
    this._oppLockedCharId = null;
  }

  // ─── Phaser lifecycle ──────────────────────────────────────────────────────

  create(data) {
    this._reset();
    this._mode = data?.mode ?? "1VS1";

    const params   = new URLSearchParams(window.location.search);
    const inviteId = params.get("invite");
    this._isJoiner = !!inviteId;
    if (inviteId) this._gameId = Number(inviteId);

    this._setupBackground();
    this._buildUi();
    this._fetchData();

    // Joiner connects WS as soon as the scene starts
    if (this._isJoiner && this._gameId) {
      this._connectWs();
    }
  }

  // ─── Background ────────────────────────────────────────────────────────────

  _setupBackground() {
    const { width, height } = this.scale;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a0a, 0x0a0a0a, 0x1a1a2e, 0x1a1a2e, 1);
    bg.fillRect(0, 0, width, height);
  }

  // ─── HTML layout ──────────────────────────────────────────────────────────

  _buildUi() {
    modalManager.showModal("modal-char-select");

    const title = document.getElementById("char-select-title");
    if (title) title.textContent = this._isJoiner ? "Join Game" : "Create Game";

    document.getElementById("btn-back-char-select").onclick = () => {
      wsManager.disconnect();
      this._cleanup();
      this.scene.start("MenuScene");
    };

    const fightBtn       = document.getElementById("btn-fight");
    fightBtn.disabled    = true;
    fightBtn.textContent = "Fight! →";
    fightBtn.onclick     = () => this._onFight();

    // Preview row — always visible
    this._refreshPreviewRow();

    // Map section (creator only)
    const mapSection = document.getElementById("char-map-section");
    if (mapSection) mapSection.style.display = this._isJoiner ? "none" : "";

    // Lobby section
    const lobbySection = document.getElementById("char-lobby-section");
    if (lobbySection) {
      if (this._isJoiner) {
        lobbySection.style.display = "none";
      } else {
        lobbySection.style.display = "";
        this._renderLobbyCreate();
      }
    }
  }

  // ─── Preview row ──────────────────────────────────────────────────────────

  _refreshPreviewRow() {
    const row = document.getElementById("cs-preview-row");
    if (!row) return;

    const myCfg   = this._selectedCharId
      ? CHARACTER_CONFIGS[this._characters.find(c => c.id === this._selectedCharId)?.sprite_key ?? ""]
      : null;

    const oppCfg  = this._oppLockedCharId
      ? CHARACTER_CONFIGS[this._characters.find(c => c.id === this._oppLockedCharId)?.sprite_key ?? ""]
      : this._oppHoverCharId
        ? CHARACTER_CONFIGS[this._characters.find(c => c.id === this._oppHoverCharId)?.sprite_key ?? ""]
        : null;

    const myThumb  = myCfg  ? `${myCfg.basePath}/${myCfg.animations.idle.frames[0]}`   : "";
    const oppThumb = oppCfg ? `${oppCfg.basePath}/${oppCfg.animations.idle.frames[0]}` : "";

    const myName   = this._selectedCharId
      ? (this._characters.find(c => c.id === this._selectedCharId)?.name ?? "")
      : "—";
    const oppName  = this._oppLockedCharId
      ? (this._characters.find(c => c.id === this._oppLockedCharId)?.name ?? "")
      : this._oppHoverCharId
        ? (this._characters.find(c => c.id === this._oppHoverCharId)?.name ?? "")
        : "Waiting…";

    const myStatus  = this._myCharReady ? "✔ Locked in" : "";
    const oppStatus = this._oppLockedCharId ? "✔ Locked in" :
                      this._oppHoverCharId  ? "Choosing…"  :
                      !this._wsConnected    ? "Not connected" : "Waiting…";

    row.innerHTML = `
      <div class="cs-preview cs-preview-you">
        <p class="cs-preview-badge">YOU</p>
        <div class="cs-preview-portrait ${myThumb ? "" : "cs-preview-empty"}">
          ${myThumb ? `<img src="${myThumb}" alt="${myName}">` : "?"}
        </div>
        <p class="cs-preview-name">${myName}</p>
        <p class="cs-preview-status">${myStatus}</p>
      </div>
      <div class="cs-preview-vs">VS</div>
      <div class="cs-preview cs-preview-opp">
        <p class="cs-preview-badge">OPPONENT</p>
        <div class="cs-preview-portrait ${oppThumb ? "" : "cs-preview-empty"} ${this._oppHoverCharId && !this._oppLockedCharId ? "cs-preview-browsing" : ""}">
          ${oppThumb ? `<img src="${oppThumb}" alt="${oppName}">` : "?"}
        </div>
        <p class="cs-preview-name">${oppName}</p>
        <p class="cs-preview-status">${oppStatus}</p>
      </div>
    `;
  }

  // ─── Data ──────────────────────────────────────────────────────────────────

  async _fetchData() {
    try {
      const [chars, maps] = await Promise.all([
        gameService.fetchCharacters(),
        gameService.fetchMaps(),
      ]);
      this._characters = chars;
      this._maps       = maps;
      this._renderCharGrid();
      if (!this._isJoiner) {
        this._renderMapRow();
      }
      this._refreshPreviewRow();
    } catch (err) {
      console.error("[CharSelect] fetch failed:", err);
    }
  }

  // ─── Character grid ────────────────────────────────────────────────────────

  _renderCharGrid() {
    const grid = document.getElementById("char-select-grid");
    if (!grid) {
      return;
    }
    grid.innerHTML = "";


    for (const char of this._characters) {
      const cfg  = CHARACTER_CONFIGS[char.sprite_key];
      const card = document.createElement("div");
      card.className  = "char-card";
      card.dataset.id = char.id;

      console.log("Rendering char:", char, "with config:", cfg);

      const firstFrame = cfg?.animations.idle.frames[0] ?? "";
      const src        = firstFrame ? `${cfg.basePath}/${firstFrame}` : "";

      card.innerHTML = `
        <div class="char-card-badges"></div>
        <img class="char-thumb" src="${src}" alt="${char.name}" loading="lazy">
        <p class="char-name">${char.name}</p>
        <ul class="char-stats-mini">
          <li>HP  <span>${char.health}</span></li>
          <li>SPD <span>${Number.isFinite(char.speed) ? (char.speed * 100).toFixed(0) : "—"}%</span></li>
          <li>ATK <span>${Number.isFinite(char.attack) ? (char.attack * 100).toFixed(0) : "—"}%</span></li>
          <li>DEF <span>${Number.isFinite(char.defense) ? (char.defense * 100).toFixed(0) : "—"}%</span></li>
        </ul>
      `;

      // Hover → send to opponent
      card.addEventListener("mouseenter", () => {
        if (!this._myCharReady && this._wsConnected) {
          wsManager.sendCharHover(char.id);
        }
      });

      // Click → select
      card.addEventListener("click", () => this._selectCharacter(char.id));
      grid.appendChild(card);
    }

    this._refreshCardStates();
  }

  _selectCharacter(id) {
    if (this._myCharReady) return; // already confirmed
    this._selectedCharId = id;
    this._refreshCardStates();
    this._refreshPreviewRow();
    this._refreshFightBtn();

    // Broadcast selection as hover too
    if (this._wsConnected) wsManager.sendCharHover(id);
  }

  _refreshCardStates() {
    document.querySelectorAll("#char-select-grid .char-card").forEach((el) => {
      const id = Number(el.dataset.id);
      el.classList.toggle("selected",     id === this._selectedCharId);
      el.classList.toggle("opp-hover",    id === this._oppHoverCharId  && id !== this._oppLockedCharId);
      el.classList.toggle("opp-locked",   id === this._oppLockedCharId);

      const badges = el.querySelector(".char-card-badges");
      if (!badges) return;
      badges.innerHTML = "";
      if (id === this._selectedCharId)  badges.innerHTML += `<span class="badge badge-you">YOU</span>`;
      if (id === this._oppLockedCharId) badges.innerHTML += `<span class="badge badge-opp">P2 ✔</span>`;
      else if (id === this._oppHoverCharId) badges.innerHTML += `<span class="badge badge-opp-hover">P2</span>`;
    });
  }

  // ─── Map row (creator only) ────────────────────────────────────────────────

  _renderMapRow() {
    const row = document.getElementById("map-select-row");
    if (!row) return;
    row.innerHTML = "";

    for (const map of this._maps) {
      const cfg  = MAP_CONFIGS[map.sprite_key];
      const tile = document.createElement("div");
      tile.className  = "map-tile";
      tile.dataset.id = map.id;

      tile.innerHTML = `
        <img class="map-thumb" src="${cfg?.path ?? ""}" alt="${map.name}" loading="lazy">
        <p class="map-name">${map.name}</p>
      `;

      tile.addEventListener("click", () => this._selectMap(map.id));
      row.appendChild(tile);
    }
  }

  _selectMap(id) {
    if (this._lobbyCreated) return; // already committed
    this._selectedMapId = id;
    document.querySelectorAll("#map-select-row .map-tile").forEach((el) => {
      el.classList.toggle("selected", Number(el.dataset.id) === id);
    });
    const createBtn = document.getElementById("btn-create-lobby");
    if (createBtn) createBtn.disabled = false;
  }

  // ─── Lobby section ────────────────────────────────────────────────────────

  _renderLobbyCreate() {
    const lobbySection = document.getElementById("char-lobby-section");
    if (!lobbySection) return;
    lobbySection.innerHTML = `
      <button id="btn-create-lobby" class="retro-action cs-lobby-btn" type="button" disabled>
        Create Lobby
      </button>
      <p id="lobby-hint" class="push-start cs-lobby-hint">← Select a map first</p>
    `;
    document.getElementById("btn-create-lobby").onclick = () => this._onCreateLobby();
  }

  async _onCreateLobby() {
    if (!this._selectedMapId) return;
    const createBtn       = document.getElementById("btn-create-lobby");
    createBtn.disabled    = true;
    createBtn.textContent = "Creating…";

    try {
      const game         = await gameService.createGame(this._selectedMapId);
      this._gameId       = game.game_id;
      this._lobbyCreated = true;

      // Lock map tiles
      document.querySelectorAll("#map-select-row .map-tile").forEach((el) => {
        el.style.pointerEvents = "none";
        el.style.opacity       = "0.5";
      });

      // Connect WS now (creator)
      this._connectWs();

      // Show invite in lobby section
      this._renderInviteLink();
    } catch (err) {
      console.error("[CharSelect] create lobby failed:", err);
      createBtn.disabled    = false;
      createBtn.textContent = "Create Lobby";
    }
  }

  _renderInviteLink() {
    const inviteUrl    = `${window.location.origin}${window.location.pathname}?invite=${this._gameId}`;
    const lobbySection = document.getElementById("char-lobby-section");
    if (!lobbySection) return;

    lobbySection.innerHTML = `
      <div class="invite-block">
        <p class="invite-block-label">Share with your opponent:</p>
        <div class="invite-block-row">
          <span class="invite-link">${inviteUrl}</span>
          <button id="btn-copy-invite" class="retro-action" type="button">Copy</button>
        </div>
        <p id="lobby-status" class="push-start cs-lobby-hint">Waiting for opponent to join…</p>
      </div>
    `;

    document.getElementById("btn-copy-invite").onclick = async () => {
      await navigator.clipboard.writeText(inviteUrl);
      const btn = document.getElementById("btn-copy-invite");
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy"; }, 2000);
    };
  }

  // ─── WebSocket connection ──────────────────────────────────────────────────

  _connectWs() {
    wsManager
      .connect(this._gameId, authManager.getToken())
      .on("waiting",             ()     => this._onWsWaiting())
      .on("lobby_joined",        ()     => this._onLobbyJoined())
      .on("opponent_char_hover", (data) => this._onOppHover(data))
      .on("opponent_char_ready", (data) => this._onOppReady(data))
      .on("game_start",          (data) => this._onGameStart(data))
      .on("disconnect",          ()     => this._onDisconnect());

    this._wsConnected = true;
  }

  // ─── Fight button ─────────────────────────────────────────────────────────

  _refreshFightBtn() {
    const fightBtn = document.getElementById("btn-fight");
    if (!fightBtn) return;
    const canFight = this._wsConnected && this._selectedCharId !== null && !this._myCharReady;
    fightBtn.disabled = !canFight;
  }

  _onFight() {
    if (!this._selectedCharId || !this._wsConnected || this._myCharReady) return;
    this._myCharReady = true;

    wsManager.sendCharReady(this._selectedCharId);

    const fightBtn       = document.getElementById("btn-fight");
    fightBtn.disabled    = true;
    fightBtn.textContent = "Waiting…";

    this._refreshPreviewRow();
  }

  // ─── WS event handlers ────────────────────────────────────────────────────

  _onWsWaiting() {
    // 1st player connected — show waiting state
    const statusEl = document.getElementById("lobby-status");
    if (statusEl) statusEl.textContent = "Waiting for opponent to join…";

    // For joiner showing first (edge case): update lobby section
    if (this._isJoiner) {
      const lobbySection = document.getElementById("char-lobby-section");
      if (lobbySection) {
        lobbySection.style.display = "";
        lobbySection.innerHTML = `
          <p class="push-start cs-lobby-hint cs-waiting-pulse">Waiting for the host to connect…</p>
        `;
      }
    }

    this._refreshPreviewRow();
  }

  _onLobbyJoined() {
    // Both players are now in the lobby
    const statusEl = document.getElementById("lobby-status");
    if (statusEl) statusEl.textContent = "Opponent joined! Select your character.";

    if (this._isJoiner) {
      const lobbySection = document.getElementById("char-lobby-section");
      if (lobbySection) {
        lobbySection.style.display = "";
        lobbySection.innerHTML = `
          <p class="push-start cs-lobby-hint">Host is connected. Pick your fighter!</p>
        `;
      }
    }

    this._refreshPreviewRow();
    this._refreshFightBtn();
  }

  _onOppHover(data) {
    this._oppHoverCharId = data.character_id;
    this._refreshCardStates();
    this._refreshPreviewRow();
  }

  _onOppReady(data) {
    this._oppLockedCharId = data.character_id;
    this._oppHoverCharId  = null;
    this._refreshCardStates();
    this._refreshPreviewRow();
  }

  _onGameStart(data) {
    this._cleanup();

    const players = (data.players ?? []).map((p) => {
      const charData = this._characters.find((c) => c.id === p.character_id);
      return {
        ...p,
        sprite_key: charData?.sprite_key ?? "",
        health: charData?.health,
        speed: charData?.speed,
        attack: charData?.attack,
        defense: charData?.defense,
      };
    });

    const mapData = this._maps.find((m) => m.id === data.map_id);

    this.scene.start("FightScene", {
      game_id:   data.game_id,
      your_team: data.your_team,
      map_key:   mapData?.sprite_key ?? "",
      players,
    });
  }

  _onDisconnect() {
    this._cleanup();
    this.scene.start("MenuScene");
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  _cleanup() {
    modalManager.closeModal("modal-char-select");
    const fightBtn = document.getElementById("btn-fight");
    if (fightBtn) {
      fightBtn.textContent = "Fight! →";
      fightBtn.disabled    = true;
    }
  }
}
