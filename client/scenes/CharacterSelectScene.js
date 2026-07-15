import Phaser from "phaser";
import { CHARACTER_CONFIGS } from "../config/characters.config.js";
import { MAP_CONFIGS }       from "../config/maps.config.js";
import { authManager }       from "../managers/auth.manager.js";
import { modalManager }      from "../managers/modal.manager.js";
import { gameService }       from "../services/game.service.js";
import { rtcManager }      from "../managers/rtc.manager.js";

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
    this._isAiMode        = false;
    this._phase           = "character";
    this._characters      = [];
    this._maps            = [];
    this._selectedCharId  = null;
    this._selectedMapId   = null;
    this._gameId          = null;
    this._inviteUrl       = "";
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
    this._isAiMode = this._mode === "1VSAI";

    const params   = new URLSearchParams(window.location.search);
    const inviteId = params.get("invite");
    this._isJoiner = !this._isAiMode && !!inviteId;
    if (inviteId && !this._isAiMode) this._gameId = Number(inviteId);

    this._setupBackground();
    this._buildUi();
    this._fetchData();

    // Joiner connects WS as soon as the scene starts
    if (!this._isAiMode && this._isJoiner && this._gameId) {
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
    if (title) {
      if (this._isAiMode) {
        title.textContent = "VS AI";
      } else {
        title.textContent = this._isJoiner ? "Join Game" : "Create Game";
      }
    }

    document.getElementById("btn-back-char-select").onclick = () => {
      rtcManager.disconnect();
      this._cleanup();
      this.scene.start("MenuScene");
    };

    const fightBtn       = document.getElementById("btn-fight");
    fightBtn.disabled    = true;
    fightBtn.textContent = "Lock Map →";
    fightBtn.onclick     = () => this._onFight();

    this._phase = this._isJoiner ? "character" : "map";
    this._refreshPreviewRow();
    this._refreshStepUi();
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
      this._refreshStepUi();
      this._refreshPreviewRow();
      this._refreshFightBtn();
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
          rtcManager.send(JSON.stringify({ type: "char_hover", data: { character_id: char.id } }));
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
    if (this._wsConnected) {
      rtcManager.send(JSON.stringify({ type: "char_hover", data: { character_id: id } }));
    }
    this._refreshFightBtn();
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

    if (!row) 
      return;
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
    const mapPreview = document.getElementById("map-select-preview");

    if (this._phase !== "map")
      return;
    this._selectedMapId = id;

    document.querySelectorAll("#map-select-row .map-tile").forEach((el) => {
      el.classList.toggle("selected", Number(el.dataset.id) === id);
    });

    if (mapPreview) {
      const cfg = MAP_CONFIGS[this._maps.find(m => m.id === id)?.sprite_key ?? ""];
      mapPreview.style.backgroundImage = cfg ? `url(${cfg.path})` : "none";
    }
    this._refreshFightBtn();
  }

  // ─── Step flow ────────────────────────────────────────────────────────────

  _refreshStepUi() {
    const mapSection  = document.getElementById("char-map-section");
    const charSection = document.getElementById("char-character-section");
    const previewRow  = document.getElementById("cs-preview-row");
    const fightSection = document.getElementById("char-fight-section");
    const lobbySection = document.getElementById("char-lobby-section");
    const fightBtn = document.getElementById("btn-fight");

    if (!mapSection || !charSection || !previewRow || !fightSection || !fightBtn || !lobbySection) return;

    if (this._phase === "map") {
      mapSection.style.display = this._isJoiner ? "none" : "";
      charSection.style.display = "none";
      previewRow.style.display = "none";
      fightSection.style.display = this._isJoiner ? "none" : "";
      lobbySection.style.display = "none";
      fightBtn.textContent = "Lock Map →";
      return;
    }

    mapSection.style.display = "none";
    charSection.style.display = "";
    previewRow.style.display = "";
    fightSection.style.display = "";
    fightBtn.textContent = this._myCharReady ? "Waiting…" : "Fight! →";

    if (this._isAiMode) {
      lobbySection.style.display = "none";
      return;
    }

    lobbySection.style.display = "";
    lobbySection.innerHTML = `<p id="lobby-status" class="push-start cs-lobby-hint">Waiting for opponent to join…</p>`;
  }

  async _onMapLock() {
    if (!this._selectedMapId)
      return;

    if (this._isAiMode) {
      this._phase = "character";
      this._refreshStepUi();
      this._refreshFightBtn();
      return;
    }

    if (this._isJoiner) return;

    const fightBtn = document.getElementById("btn-fight");
    if (fightBtn) {
      fightBtn.disabled = true;
      fightBtn.textContent = "Creating…";
    }

    try {
      const game = await gameService.createGame(this._selectedMapId);
      this._gameId = game.game_id;
      this._lobbyCreated = true;
      this._inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${this._gameId}`;

      this._connectWs();
      this._showInviteShareModal();

      this._phase = "character";
      this._refreshStepUi();
      this._refreshPreviewRow();
      this._refreshFightBtn();
    } catch (err) {
      console.error("[CharSelect] create lobby failed:", err);
      if (fightBtn) {
        fightBtn.disabled = false;
        fightBtn.textContent = "Lock Map →";
      }
    }
  }

  _showInviteShareModal() {
    const inviteLink = document.getElementById("invite-share-link");
    const copyBtn = document.getElementById("btn-copy-share-invite");
    const continueBtn = document.getElementById("btn-continue-after-share");
    if (!inviteLink || !copyBtn || !continueBtn) return;

    inviteLink.textContent = this._inviteUrl;

    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(this._inviteUrl);
      copyBtn.textContent = "Copied!";
      setTimeout(() => { 
        modalManager.closeModal("modal-invite-share");
      }, 2000);
    };

    continueBtn.onclick = () => {
      modalManager.closeModal("modal-invite-share");
    };

    modalManager.showModal("modal-invite-share");
  }

  _setLobbyStatus(text, pulse = false) {
    const statusEl = document.getElementById("lobby-status");
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("cs-waiting-pulse", pulse);
  }

  // ─── WebSocket connection ──────────────────────────────────────────────────

  _connectWs() {
    const peerId = this._isJoiner ? "p2" : "p1";
    const isInitiator = !this._isJoiner;

    rtcManager.init(this._gameId, peerId, isInitiator, (msg) => {
      if (msg.type === "opponent_char_hover") {
        this._onOppHover(msg.data);
      } else if (msg.type === "opponent_char_ready") {
        this._onOppReady(msg.data);
      } else if (msg.type === "game_start") {
        this._onGameStart(msg.data);
      } else if (msg.type === "disconnect" || msg.type === "opponent_disconnected") {
        this._onDisconnect();
      }
      // Note: "waiting" and "lobby_joined" were server-side states from the
      // old WS room model. With P2P, the lobby flow is simpler — we just
      // wait for the opponent's first char_hover/char_ready. The scene's
      // existing _onWsWaiting / _onLobbyJoined handlers are fired locally
      // below to preserve the UI flow.
    });

    // Fire the appropriate local lobby-status handler since P2P doesn't
    // push these events from a server.
    if (isInitiator) {
      this._onWsWaiting();
    } else {
      this._onLobbyJoined();
    }

    this._wsConnected = true;
  }

  // ─── Fight button ─────────────────────────────────────────────────────────

  _refreshFightBtn() {
    const fightBtn = document.getElementById("btn-fight");
    if (!fightBtn) return;

    if (this._phase === "map") {
      fightBtn.disabled = this._selectedMapId === null;
      return;
    }

    const canFight = this._isAiMode
      ? this._selectedCharId !== null && this._selectedMapId !== null
      : this._wsConnected && this._selectedCharId !== null && !this._myCharReady;
    fightBtn.disabled = !canFight;
  }

  _onFight() {
    if (this._phase === "map") {
      this._onMapLock();
      return;
    }

    if (this._isAiMode) {
      this._startAiGame();
      return;
    }

    if (!this._selectedCharId || !this._wsConnected || this._myCharReady) return;
    this._myCharReady = true;

    rtcManager.send(JSON.stringify({ type: "char_ready", data: { character_id: this._selectedCharId } }));

    const fightBtn       = document.getElementById("btn-fight");
    fightBtn.disabled    = true;
    fightBtn.textContent = "Waiting…";

    this._refreshPreviewRow();
  }

  async _startAiGame() {
    if (!this._selectedCharId || !this._selectedMapId) {
      return;
    }

    const me = this._characters.find((c) => c.id === this._selectedCharId);
    if (!me) {
      return;
    }

    const candidates = this._characters.filter((c) => c.id !== me.id);
    const ai = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : me;

    const mapData = this._maps.find((m) => m.id === this._selectedMapId);
    let gameId = null;

    try {
      const created = await gameService.startAiGame(this._selectedMapId, me.id, ai.id);
      gameId = created?.game_id ?? null;
    } catch (err) {
      console.error("[CharSelect] failed to persist AI game:", err);
    }

    this._cleanup();
    this.scene.start("FightAiScene", {
      game_id: gameId,
      map_key: mapData?.sprite_key ?? "",
      players: [
        {
          team: 1,
          pseudo: "You",
          sprite_key: me.sprite_key,
          health: me.health,
          speed: me.speed,
          attack: me.attack,
          defense: me.defense,
        },
        {
          team: 2,
          pseudo: "Basic AI",
          sprite_key: ai.sprite_key,
          health: ai.health,
          speed: ai.speed,
          attack: ai.attack,
          defense: ai.defense,
        },
      ],
    });
  }

  // ─── WS event handlers ────────────────────────────────────────────────────

  _onWsWaiting() {
    this._setLobbyStatus("Waiting for opponent to join…", true);
    this._refreshPreviewRow();
  }

  _onLobbyJoined() {
    this._setLobbyStatus("Opponent joined! Select your character.", false);
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
    modalManager.closeModal("modal-invite-share");
    const fightBtn = document.getElementById("btn-fight");
    if (fightBtn) {
      fightBtn.textContent = "Fight! →";
      fightBtn.disabled    = true;
    }
  }
}
