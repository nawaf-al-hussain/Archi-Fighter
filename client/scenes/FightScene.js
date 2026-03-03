import Phaser from "phaser";
import { CHARACTER_CONFIGS } from "../config/characters.config.js";
import { MAP_CONFIGS }       from "../config/maps.config.js";
import { wsManager }         from "../managers/ws.manager.js";

/** URL-encode each path segment while keeping "/" separators intact. */
const ep = (path) => path.split("/").map(encodeURIComponent).join("/");

// ─── Combat constants ────────────────────────────────────────────────────────
const BASE_DAMAGE = {
  punch:   8,
  kick:    12,
  special: 20,
  block:   0,
};
const MOVE_SPEED      = 220;  // px/s base
const JUMP_VELOCITY   = -590;
const GRAVITY         = 1350;
const GROUND_Y        = 600;  // y of character feet when grounded
const ATTACK_COOLDOWN = 500;  // ms
const CHARACTER_SCALE_FACTOR = 0.62;
const BG_FOLLOW_LERP = 0.12;
const BG_OPPONENT_VELOCITY_INFLUENCE = 0.08;

// ─── FightScene ──────────────────────────────────────────────────────────────

export class FightScene extends Phaser.Scene {
  constructor() {
    super({ key: "FightScene" });
  }

  // ─── Phaser lifecycle ──────────────────────────────────────────────────────

  init(data) {
    this._gameId   = data.game_id;
    this._myTeam   = data.your_team;          // 1 | 2
    this._mapKey   = data.map_key;
    this._players  = data.players;            // [{ team, pseudo, character_id, sprite_key, health, speed, attack, defense }]

    const myInfo  = this._players.find((p) => p.team === this._myTeam);
    const oppInfo = this._players.find((p) => p.team !== this._myTeam);

    this._myKey  = myInfo?.sprite_key  ?? "";
    this._oppKey = oppInfo?.sprite_key ?? "";
    this._myName  = myInfo?.pseudo  ?? "You";
    this._oppName = oppInfo?.pseudo ?? "Opponent";

    const myHealth  = Number(myInfo?.health ?? 100);
    const oppHealth = Number(oppInfo?.health ?? 100);

    const mySpeed   = Number(myInfo?.speed ?? 1);
    const oppSpeed  = Number(oppInfo?.speed ?? 1);
    const myAttack  = Number(myInfo?.attack ?? 1);
    const oppAttack = Number(oppInfo?.attack ?? 1);
    const myDefense = Number(myInfo?.defense ?? 1);
    const oppDefense= Number(oppInfo?.defense ?? 1);

    this._myMaxHp  = Number.isFinite(myHealth) ? myHealth : 100;
    this._oppMaxHp = Number.isFinite(oppHealth) ? oppHealth : 100;
    this._myHp     = this._myMaxHp;
    this._oppHp    = this._oppMaxHp;

    this._myStats  = {
      speed: Number.isFinite(mySpeed) ? mySpeed : 1,
      attack: Number.isFinite(myAttack) ? myAttack : 1,
      defense: Number.isFinite(myDefense) ? myDefense : 1,
    };
    this._oppStats = {
      speed: Number.isFinite(oppSpeed) ? oppSpeed : 1,
      attack: Number.isFinite(oppAttack) ? oppAttack : 1,
      defense: Number.isFinite(oppDefense) ? oppDefense : 1,
    };

    this._round       = 1;
    this._max_rounds  = 3;
    this._myWins      = 0;
    this._oppWins     = 0;
    this._roundOver   = false;
    this._gameOver    = false;
    this._attacking   = false;
    this._lastAttack  = 0;
    this._blocking    = false;
    this._oppBlocking = false;
    this._lastSentMoveAction = null;
  }

  preload() {
    // Map background
    const mapCfg = MAP_CONFIGS[this._mapKey];
    if (mapCfg) {
      this.load.image("map_bg", ep(mapCfg.path));
    }

    // Character frames for both fighters
    for (const charKey of [this._myKey, this._oppKey]) {
      if (!charKey) {
        continue;
      }
      const cfg = CHARACTER_CONFIGS[charKey];
      if (!cfg) {
        continue;
      }
      for (const [animName, animCfg] of Object.entries(cfg.animations)) {
        animCfg.frames.forEach((frame, i) => {
          const textureKey = `${charKey}_${animName}_${i}`;
          if (!this.textures.exists(textureKey)) {
            this.load.image(textureKey, ep(`${cfg.basePath}/${frame}`));
          }
        });
      }
    }
  }

  create() {
    const { width, height } = this.scale;

    // ── Background ──
    if (this.textures.exists("map_bg")) {
      const bg = this.add.image(0, 0, "map_bg");
      bg.setOrigin(0, 0);
      bg.setY(Math.min(0, height - bg.height));
      this._bg = bg;
      this._bgScrollMax = Math.max(0, bg.width - width);
      this._bgScroll = this._bgScrollMax / 2;
      this._bg.x = -this._bgScroll;
    } else {
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x16213e, 0x16213e, 1);
      bg.fillRect(0, 0, width, height);
      this._bg = null;
      this._bgScrollMax = 0;
      this._bgScroll = 0;
    }

    // ── Ground (static physics body) ──
    this.physics.world.gravity.y = GRAVITY;
    const ground = this.physics.add.staticImage(width / 2, height - 60, "__DEFAULT");
    ground.setDisplaySize(width, 20);
    ground.setAlpha(0);
    ground.refreshBody();

    // ── Player positions (team 1 left, team 2 right) ──
    const p1X = width  * 0.22;
    const p2X = width  * 0.78;
    const myX  = this._myTeam  === 1 ? p1X : p2X;
    const oppX = this._myTeam  === 1 ? p2X : p1X;

    // ── Sprites ──
    this._mySprite  = this._createSprite(myX,  GROUND_Y, this._myKey,  "me");
    this._oppSprite = this._createSprite(oppX, GROUND_Y, this._oppKey, "opp");

    // Collide with ground
    this.physics.add.collider(this._mySprite,  ground);
    this.physics.add.collider(this._oppSprite, ground);

    // ── Animations ──
    this._registerAnimations(this._myKey);
    this._registerAnimations(this._oppKey);

    // Play idle
    this._mySprite.play(`${this._myKey}_idle`);
    this._oppSprite.play(`${this._oppKey}_idle`);

    // ── Keyboard ──
    this._keys = this.input.keyboard.addKeys({
      left:    Phaser.Input.Keyboard.KeyCodes.LEFT,
      right:   Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up:      Phaser.Input.Keyboard.KeyCodes.UP,
      punch:   Phaser.Input.Keyboard.KeyCodes.Z,
      kick:    Phaser.Input.Keyboard.KeyCodes.X,
      block:   Phaser.Input.Keyboard.KeyCodes.C,
      special: Phaser.Input.Keyboard.KeyCodes.V,
    });

    // ── HUD overlay ──
    this._buildHud();
    this._updateHud();

    // ── WS handlers ──
    wsManager
      .on("opponent_input",    (d) => this._onOpponentInput(d))
      .on("round_result",      (d) => this._onRoundResult(d))
      .on("game_over",         (d) => this._onGameOver(d))
      .on("opponent_disconnected", () => this._onOpponentDisconnected());
  }

  update(time) {
    this._updateFacing();
    this._updateBackgroundPan();

    if (this._roundOver || this._gameOver) {
       return;
    }

    const { left, right, up, punch, kick, block: blockKey, special } = this._keys;

    // ── Block ──
    const isBlocking = Phaser.Input.Keyboard.JustDown(blockKey);
    if (isBlocking && !this._attacking) {
      this._blocking = true;
      this._playAnim(this._mySprite, this._myKey, "block");
      wsManager.sendInput("block");
      this._sendMoveAction("move_stop");
      this.time.delayedCall(300, () => {
        this._blocking = false;
        this._playAnim(this._mySprite, this._myKey, "idle");
      });
    }

    // can't move while blocking or attacking
    if (this._blocking || this._attacking) {
      this._mySprite.setVelocityX(0);
      this._sendMoveAction("move_stop");
      return ; 
    }

    // ── Horizontal movement ──
    const speed = MOVE_SPEED * this._myStats.speed;
    if (left.isDown) {
      this._mySprite.setVelocityX(-speed);
      this._playAnim(this._mySprite, this._myKey, "move");
      this._sendMoveAction("move_left");
    } else if (right.isDown) {
      this._mySprite.setVelocityX(speed);
      this._playAnim(this._mySprite, this._myKey, "move");
      this._sendMoveAction("move_right");
    } else {
      this._mySprite.setVelocityX(0);
      this._sendMoveAction("move_stop");
      if (this._mySprite.body.blocked.down) {
        this._playAnim(this._mySprite, this._myKey, "idle");
      }
    }

    // ── Jump ──
    if (Phaser.Input.Keyboard.JustDown(up) && this._mySprite.body.blocked.down) {
      this._mySprite.setVelocityY(JUMP_VELOCITY);
      wsManager.sendInput("jump");
    }

    // ── Attacks ──
    const now = time;
    if (now - this._lastAttack > ATTACK_COOLDOWN) {
      if (Phaser.Input.Keyboard.JustDown(punch)) {
        this._doAttack("punch", time);
      } else if (Phaser.Input.Keyboard.JustDown(kick)) {
        this._doAttack("kick", time);
      } else if (Phaser.Input.Keyboard.JustDown(special)) {
        this._doAttack("special", time);
      }
    }
  }

  // ─── Sprite helpers ────────────────────────────────────────────────────────

  _createSprite(x, y, charKey, tag) {
    const cfg = CHARACTER_CONFIGS[charKey];

    // Use the first idle frame as initial texture
    const initKey = charKey ? `${charKey}_idle_0` : "__DEFAULT";
    const sprite  = this.physics.add.sprite(x, y, initKey);

    const scl = (cfg?.scale ?? 2) * CHARACTER_SCALE_FACTOR;
    sprite.setScale(scl);
    sprite.setCollideWorldBounds(true);

    // push origin to bottom so y matches feet
    sprite.setOrigin(0.5, 1);

    return sprite;
  }

  _registerAnimations(charKey) {
    if (!charKey) {
      return;
    }
    const cfg = CHARACTER_CONFIGS[charKey];
    if (!cfg) {
      return;
    }

    for (const [animName, animCfg] of Object.entries(cfg.animations)) {
      const animKey = `${charKey}_${animName}`;
      if (this.anims.exists(animKey)) {
        continue;
      }

      const frameKeys = animCfg.frames
        .map((_, i) => ({ key: `${charKey}_${animName}_${i}` }))
        .filter((frame) => this.textures.exists(frame.key));

      if (frameKeys.length === 0) {
        continue;
      }

      this.anims.create({
        key:        animKey,
        frames:     frameKeys,
        frameRate:  animCfg.frameRate,
        repeat:     animCfg.loop ? -1 : 0,
      });
    }
  }

  _playAnim(sprite, charKey, animName) {
    const key = `${charKey}_${animName}`;

    const anim = this.anims.get(key);
    if (!anim || !anim.frames || anim.frames.length === 0) {
      if (animName !== "idle") {
        const idleKey = `${charKey}_idle`;
        const idleAnim = this.anims.get(idleKey);
        if (idleAnim && idleAnim.frames?.length > 0 && (sprite.anims.currentAnim?.key !== idleKey || !sprite.anims.isPlaying)) {
          try {
            sprite.play(idleKey, true);
          } catch {
            console.warn(`Failed to play animation ${key}`); 
          }
        }
      }
      return;
    }

    if (sprite.anims.currentAnim?.key !== key || !sprite.anims.isPlaying) {
      try {
        sprite.play(key, true);
      } catch {
        console.warn(`Failed to play animation ${key}`); 
      }
    }
  }

  _updateFacing() {
    if (!this._mySprite || !this._oppSprite) {
      return;
    }

    const myIsRightOfOpponent = this._mySprite.x < this._oppSprite.x; 
    this._mySprite.setFlipX(myIsRightOfOpponent);
    this._oppSprite.setFlipX(!myIsRightOfOpponent);
  }

  _updateBackgroundPan() {
    if (!this._bg || this._bgScrollMax <= 0 || !this._mySprite || !this._oppSprite) {
      return;
    }

    const { width } = this.scale;
    const fightersMidX = (this._mySprite.x + this._oppSprite.x) / 2;
    const normalized = Phaser.Math.Clamp(fightersMidX / width, 0, 1);

    const opponentVelocityX = this._oppSprite.body?.velocity?.x ?? 0;
    const velocityOffset = opponentVelocityX * BG_OPPONENT_VELOCITY_INFLUENCE;

    const targetScroll = Phaser.Math.Clamp(
      normalized * this._bgScrollMax + velocityOffset,
      0,
      this._bgScrollMax,
    );

    this._bgScroll = Phaser.Math.Linear(this._bgScroll, targetScroll, BG_FOLLOW_LERP);
    this._bg.x = -this._bgScroll;
  }

  // ─── Combat ───────────────────────────────────────────────────────────────

  _doAttack(type, time) {
    this._attacking  = true;
    this._lastAttack = time;
    this._mySprite.setVelocityX(0);
    this._sendMoveAction("move_stop");
    this._playAnim(this._mySprite, this._myKey, type);
    wsManager.sendInput(type);

    this._applyDamageToOpponent(type);

    const dur = this._getAnimDuration(this._myKey, type);
    this.time.delayedCall(dur, () => {
      this._attacking = false;
      if (!this._roundOver) {
        this._playAnim(this._mySprite, this._myKey, "idle");
      }
    });
  }

  _sendMoveAction(action) {
    if (this._lastSentMoveAction === action) {
      return;
    }
    this._lastSentMoveAction = action;
    wsManager.sendInput(action);
  }

  _applyDamageToOpponent(action) {
    const base = BASE_DAMAGE[action];
    if (!base || this._roundOver) {
      return;
    }

    const rawDamage = Math.round(base * this._myStats.attack / this._oppStats.defense);
    const actualDamage = this._oppBlocking ? Math.floor(rawDamage / 2) : rawDamage;

    this._oppHp = Math.max(0, this._oppHp - actualDamage);

    if (!this._oppBlocking) {
      this._playAnim(this._oppSprite, this._oppKey, "hit");
      this.time.delayedCall(this._getAnimDuration(this._oppKey, "hit"), () => {
        if (!this._roundOver) {
          this._playAnim(this._oppSprite, this._oppKey, "idle");
        }
      });
    }

    if (this._oppHp <= 0 && !this._roundOver) {
      this._roundOver = true;
      this._playAnim(this._oppSprite, this._oppKey, "fall");
      this._mySprite.setVelocityX(0);
      this._oppSprite.setVelocityX(0);
      this._sendMoveAction("move_stop");
    }

    this._updateHud();
  }

  _getAnimDuration(charKey, animName) {
    const cfg = CHARACTER_CONFIGS[charKey]?.animations?.[animName];
    if (!cfg) {
      return 400;
    }
    return Math.ceil((cfg.frames.length / cfg.frameRate) * 1000);
  }

  /** Handle incoming opponent action: apply damage to MY character */
  _onOpponentInput(data) {
    const action = data.action;

    // Visual: play opp animation
    if (["punch", "kick", "special", "block", "jump"].includes(action)) {
      this._playAnim(this._oppSprite, this._oppKey, action === "jump" ? "move" : action);
      if (action === "block") {
        this._oppBlocking = true;
        this.time.delayedCall(300, () => {
          this._oppBlocking = false;
          if (!this._roundOver) {
            this._playAnim(this._oppSprite, this._oppKey, "idle");
          }
        });
      }
      if (!["block", "jump"].includes(action)) {
        const dur = this._getAnimDuration(this._oppKey, action);
        this.time.delayedCall(dur, () => {
          if (!this._roundOver) {
            this._playAnim(this._oppSprite, this._oppKey, "idle");
          }
        });
      }
    }

    if (action === "move_left") {
      this._oppSprite.setVelocityX(-MOVE_SPEED * this._oppStats.speed);
      this._playAnim(this._oppSprite, this._oppKey, "move");
    } else if (action === "move_right") {
      this._oppSprite.setVelocityX(MOVE_SPEED * this._oppStats.speed);
      this._playAnim(this._oppSprite, this._oppKey, "move");
    } else if (action === "move_stop") {
      this._oppSprite.setVelocityX(0);
      if (this._oppSprite.body.blocked.down && !this._roundOver) {
        this._playAnim(this._oppSprite, this._oppKey, "idle");
      }
    } else if (action === "jump") {
      if (this._oppSprite.body.blocked.down) {
        this._oppSprite.setVelocityY(JUMP_VELOCITY);
      }
    }

    // Damage to ME
    const base = BASE_DAMAGE[action];
    if (!base) {
      return;
    }

    const dmg = Math.round(base * this._oppStats.attack / this._myStats.defense);
    if (this._blocking) {
      // Blocked — halve damage
      this._myHp = Math.max(0, this._myHp - Math.floor(dmg / 2));
    } else {
      this._myHp = Math.max(0, this._myHp - dmg);
      this._playAnim(this._mySprite, this._myKey, "hit");
      this.time.delayedCall(this._getAnimDuration(this._myKey, "hit"), () => {
        if (!this._roundOver) {
          this._playAnim(this._mySprite, this._myKey, "idle");
        }
      });
    }

    this._updateHud();

    if (this._myHp <= 0 && !this._roundOver) {
      this._myDied();
    }
  }

  _myDied() {
    this._roundOver = true;
    this._playAnim(this._mySprite, this._myKey, "fall");
    this._mySprite.setVelocityX(0);
    this._oppSprite.setVelocityX(0);
    this._sendMoveAction("move_stop");
    const oppTeam = this._myTeam === 1 ? 2 : 1;
    wsManager.sendRoundEnd(oppTeam);
  }

  // ─── Round / Game events ───────────────────────────────────────────────────

  _onRoundResult(data) {
    const iWon = data.winner_team === this._myTeam;
    if (iWon) {
      this._myWins++;
    } else {
      this._oppWins++;
    }

    this._updateHud();
    this._showRoundBanner(iWon ? "Round Won!" : "Round Lost");

    this.time.delayedCall(2000, () => {
      this._resetRound();
    });
  }

  _onGameOver(data) {
    this._gameOver = true;
    const iWon = data.winning_team === this._myTeam;
    this._showEndScreen(iWon ? "Victory!" : "Defeat");
  }

  _onOpponentDisconnected() {
    this._gameOver = true;
    this._showEndScreen("Opponent Disconnected — You Win!");
  }

  _resetRound() {
    this._round++;
    this._myHp    = this._myMaxHp;
    this._oppHp   = this._oppMaxHp;
    this._roundOver  = false;
    this._attacking  = false;
    this._blocking   = false;
    this._oppBlocking = false;
    this._lastSentMoveAction = null;

    const { width } = this.scale;
    this._mySprite.setPosition(this._myTeam === 1 ? width * 0.22 : width * 0.78, GROUND_Y);
    this._oppSprite.setPosition(this._myTeam === 1 ? width * 0.78 : width * 0.22, GROUND_Y);
    this._mySprite.setVelocity(0, 0);
    this._oppSprite.setVelocity(0, 0);

    if (this._bg && this._bgScrollMax > 0) {
      this._bgScroll = this._bgScrollMax / 2;
      this._bg.x = -this._bgScroll;
    }

    this._playAnim(this._mySprite,  this._myKey,  "idle");
    this._playAnim(this._oppSprite, this._oppKey, "idle");
    this._updateHud();
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  _buildHud() {
    const hud = document.getElementById("fight-hud");
    if (!hud) {
      return;
    }
    hud.classList.remove("hidden");

    document.getElementById("hud-p1-name").textContent = this._myTeam === 1 ? this._myName  : this._oppName;
    document.getElementById("hud-p2-name").textContent = this._myTeam === 1 ? this._oppName : this._myName;

    const p1Wins = document.getElementById("hud-p1-wins");
    const p2Wins = document.getElementById("hud-p2-wins");
    const p1Hp   = document.getElementById("hud-p1-hp-fill");
    const p2Hp   = document.getElementById("hud-p2-hp-fill");

    if (p1Wins) {
      p1Wins.textContent = "●".repeat(0);
    }

    if (p2Wins) {
      p2Wins.textContent = "●".repeat(0);
    }

    if (p1Hp) {
      p1Hp.style.width = "100%";
    }

    if (p2Hp) {
      p2Hp.style.width = "100%";
    }  
      
  }

  _updateHud() {
    const isTeam1 = this._myTeam === 1;
    const p1Hp  = isTeam1 ? this._myHp  : this._oppHp;
    const p2Hp  = isTeam1 ? this._oppHp : this._myHp;
    const p1Max = isTeam1 ? this._myMaxHp  : this._oppMaxHp;
    const p2Max = isTeam1 ? this._oppMaxHp : this._myMaxHp;
    const p1Wins = isTeam1 ? this._myWins  : this._oppWins;
    const p2Wins = isTeam1 ? this._oppWins : this._myWins;

    const fillP1 = document.getElementById("hud-p1-hp-fill");
    const fillP2 = document.getElementById("hud-p2-hp-fill");
    if (fillP1) {
      fillP1.style.width = `${(p1Hp / p1Max) * 100}%`;
    }
    if (fillP2) {
      fillP2.style.width = `${(p2Hp / p2Max) * 100}%`;
    }

    const winsP1 = document.getElementById("hud-p1-wins");
    const winsP2 = document.getElementById("hud-p2-wins");
    if (winsP1) {
      winsP1.textContent = "●".repeat(p1Wins);
    }
    if (winsP2) {
      winsP2.textContent = "●".repeat(p2Wins);
    }

    const roundEl = document.getElementById("hud-round");
    if (roundEl) {
      roundEl.textContent = `Round ${this._round}`;
    }
  }

  _showRoundBanner(text) {
    const banner = document.getElementById("fight-banner");
    if (!banner) {
      return;
    }
    banner.textContent = text;
    banner.classList.remove("hidden");
    this.time.delayedCall(1800, () => banner.classList.add("hidden"));
  }

  _showEndScreen(text) {
    const banner = document.getElementById("fight-banner");
    if (banner) {
      banner.textContent = text;
      banner.classList.remove("hidden");
    }
    const endBtn = document.getElementById("btn-fight-back");
    if (endBtn) {
      endBtn.classList.remove("hidden");
      endBtn.onclick = () => {
        wsManager.disconnect();
        this._hideHud();
        // Remove invite param from URL before going to menu
        window.history.replaceState({}, "", window.location.pathname);
        this.scene.start("MenuScene");
      };
    }
  }

  _hideHud() {
    const hud    = document.getElementById("fight-hud");
    const banner = document.getElementById("fight-banner");
    const btn    = document.getElementById("btn-fight-back");
    if (hud) {
      hud.classList.add("hidden");
    }
    if (banner) {
      banner.classList.add("hidden");
    }
    if (btn) {
      btn.classList.add("hidden");
    }
  }

  // ─── Scene cleanup ────────────────────────────────────────────────────────

  shutdown() {
    this._hideHud();
    wsManager
      .off("opponent_input")
      .off("round_result")
      .off("game_over")
      .off("opponent_disconnected");
  }
}
