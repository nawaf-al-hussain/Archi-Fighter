import Phaser from "phaser";
import { CHARACTER_CONFIGS } from "../../config/characters.config.js";
import { MAP_CONFIGS } from "../../config/maps.config.js";
import { gameService } from "../../services/game.service.js";
import {
  ATTACK_COOLDOWN,
  BASE_DAMAGE,
  GROUND_Y,
  GRAVITY,
  JUMP_VELOCITY,
  MOVE_SPEED,
  applyKnockback,
  createFighterSprite,
  encodePath,
  getBlockDuration,
  getHitStunDuration,
  getCharacterAnimDuration,
  playCharacterAnim,
  registerCharacterAnimations,
} from "./fight.shared.js";

const AI_SPECIAL_DAMAGE = 18;

const ATTACK_HITBOX = {
  punch: { w: 64, h: 54, range: 42 },
  kick: { w: 78, h: 62, range: 56 },
  special: { w: 96, h: 66, range: 72 },
};

export class FightAiScene extends Phaser.Scene {
  constructor() {
    super({ key: "FightAiScene" });
  }

  init(data) {
    this._gameId = data.game_id ?? null;
    this._mapKey = data.map_key;
    this._players = data.players ?? [];

    const myInfo = this._players.find((p) => p.team === 1) ?? {};
    const aiInfo = this._players.find((p) => p.team === 2) ?? {};

    this._myKey = myInfo.sprite_key ?? "";
    this._aiKey = aiInfo.sprite_key ?? "";

    this._myName = myInfo.pseudo ?? "You";
    this._aiName = aiInfo.pseudo ?? "Basic AI";

    this._myMaxHp = Number(myInfo.health ?? 100);
    this._aiMaxHp = Number(aiInfo.health ?? 100);
    this._myHp = this._myMaxHp;
    this._aiHp = this._aiMaxHp;

    this._myStats = {
      speed: Number(myInfo.speed ?? 1),
      attack: Number(myInfo.attack ?? 1),
      defense: Number(myInfo.defense ?? 1),
    };

    this._aiStats = {
      speed: Number(aiInfo.speed ?? 1),
      attack: Number(aiInfo.attack ?? 1),
      defense: Number(aiInfo.defense ?? 1),
    };

    this._myBlocking = false;
    this._aiBlocking = false;
    this._myAttacking = false;
    this._aiAttacking = false;
    this._myLastAttack = 0;
    this._aiLastAttack = 0;
    this._myStunnedUntil = 0;
    this._aiStunnedUntil = 0;
    this._gameOver = false;
    this._roundOver = false;
    this._round = 1;
    this._myWins = 0;
    this._aiWins = 0;
    this._startMyX = 0;
    this._startAiX = 0;
    this._mapTextureKey = this._mapKey ? `map_bg_${this._mapKey}` : "map_bg_default";
  }

  preload() {
    const mapCfg = MAP_CONFIGS[this._mapKey];
    if (mapCfg && !this.textures.exists(this._mapTextureKey)) {
      this.load.image(this._mapTextureKey, encodePath(mapCfg.path));
    }

    for (const charKey of [this._myKey, this._aiKey]) {
      if (!charKey) continue;
      const cfg = CHARACTER_CONFIGS[charKey];
      if (!cfg) continue;

      for (const [animName, animCfg] of Object.entries(cfg.animations)) {
        animCfg.frames.forEach((frame, i) => {
          const textureKey = `${charKey}_${animName}_${i}`;
          if (!this.textures.exists(textureKey)) {
            this.load.image(textureKey, encodePath(`${cfg.basePath}/${frame}`));
          }
        });
      }
    }
  }

  create() {
    const { width, height } = this.scale;

    if (this.textures.exists(this._mapTextureKey)) {
      const bg = this.add.image(0, 0, this._mapTextureKey);
      bg.setOrigin(0, 0);
      bg.setY(Math.min(0, height - bg.height));
    } else {
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x16213e, 0x16213e, 1);
      bg.fillRect(0, 0, width, height);
    }

    this.physics.world.gravity.y = GRAVITY;

    this._ground = this.physics.add.staticImage(width / 2, height - 60, "__DEFAULT");
    this._ground.setDisplaySize(width, 20);
    this._ground.setAlpha(0);
    this._ground.refreshBody();

    this._leftWall = this.physics.add.staticImage(-8, height / 2, "__DEFAULT");
    this._leftWall.setDisplaySize(16, height);
    this._leftWall.setAlpha(0);
    this._leftWall.refreshBody();

    this._rightWall = this.physics.add.staticImage(width + 8, height / 2, "__DEFAULT");
    this._rightWall.setDisplaySize(16, height);
    this._rightWall.setAlpha(0);
    this._rightWall.refreshBody();

    this._midObstacle = this.physics.add.staticImage(width / 2, height - 150, "__DEFAULT");
    this._midObstacle.setDisplaySize(80, 18);
    this._midObstacle.setAlpha(0);
    this._midObstacle.refreshBody();

    this._startMyX = width * 0.22;
    this._startAiX = width * 0.78;
    this._mySprite = this._createSprite(this._startMyX, GROUND_Y, this._myKey);
    this._aiSprite = this._createSprite(this._startAiX, GROUND_Y, this._aiKey);

    this.physics.add.collider(this._mySprite, this._ground);
    this.physics.add.collider(this._aiSprite, this._ground);
    this.physics.add.collider(this._mySprite, this._leftWall);
    this.physics.add.collider(this._aiSprite, this._leftWall);
    this.physics.add.collider(this._mySprite, this._rightWall);
    this.physics.add.collider(this._aiSprite, this._rightWall);
    this.physics.add.collider(this._mySprite, this._midObstacle);
    this.physics.add.collider(this._aiSprite, this._midObstacle);

    this._registerAnimations(this._myKey);
    this._registerAnimations(this._aiKey);

    this._playAnim(this._mySprite, this._myKey, "idle");
    this._playAnim(this._aiSprite, this._aiKey, "idle");

    this._keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      punch: Phaser.Input.Keyboard.KeyCodes.Z,
      kick: Phaser.Input.Keyboard.KeyCodes.X,
      block: Phaser.Input.Keyboard.KeyCodes.C,
      special: Phaser.Input.Keyboard.KeyCodes.V,
    });

    this._buildHud();
    this._updateHud();
  }

  update(time) {
    this._updateFacing();

    if (this._gameOver || this._roundOver) return;

    this._updatePlayerInput(time);
    this._updateAi(time);
  }

  _createSprite(x, y, charKey) {
    return createFighterSprite(this, x, y, charKey);
  }

  _registerAnimations(charKey) {
    registerCharacterAnimations(this, charKey);
  }

  _playAnim(sprite, charKey, animName) {
    playCharacterAnim(this, sprite, charKey, animName);
  }

  _updateFacing() {
    const myIsRightOfAi = this._mySprite.x < this._aiSprite.x;
    this._mySprite.setFlipX(myIsRightOfAi);
    this._aiSprite.setFlipX(!myIsRightOfAi);
  }

  _updatePlayerInput(time) {
    const { left, right, up, punch, kick, block, special } = this._keys;

    if (time < this._myStunnedUntil) {
      this._mySprite.setVelocityX(0);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(block) && !this._myAttacking) {
      this._myBlocking = true;
      this._playAnim(this._mySprite, this._myKey, "block");
      const blockDuration = getBlockDuration(this._myStats.speed, this._aiStats.speed);
      this.time.delayedCall(blockDuration, () => {
        this._myBlocking = false;
        if (!this._gameOver) this._playAnim(this._mySprite, this._myKey, "idle");
      });
    }

    if (!this._myBlocking && !this._myAttacking) {
      const speed = MOVE_SPEED * this._myStats.speed;
      if (left.isDown) {
        this._mySprite.setVelocityX(-speed);
        this._playAnim(this._mySprite, this._myKey, "move");
      } else if (right.isDown) {
        this._mySprite.setVelocityX(speed);
        this._playAnim(this._mySprite, this._myKey, "move");
      } else {
        this._mySprite.setVelocityX(0);
        if (this._mySprite.body.blocked.down) this._playAnim(this._mySprite, this._myKey, "idle");
      }

      if (Phaser.Input.Keyboard.JustDown(up) && this._mySprite.body.blocked.down) {
        this._mySprite.setVelocityY(JUMP_VELOCITY);
      }

      if (time - this._myLastAttack > ATTACK_COOLDOWN) {
        if (Phaser.Input.Keyboard.JustDown(punch)) this._performAttack("punch", "my", time);
        else if (Phaser.Input.Keyboard.JustDown(kick)) this._performAttack("kick", "my", time);
        else if (Phaser.Input.Keyboard.JustDown(special)) this._performAttack("special", "my", time);
      }
    } else {
      this._mySprite.setVelocityX(0);
    }
  }

  _updateAi(time) {
    if (time < this._aiStunnedUntil) {
      this._aiSprite.setVelocityX(0);
      return;
    }

    if (this._aiAttacking || this._aiBlocking) {
      this._aiSprite.setVelocityX(0);
      return;
    }

    const distanceX = this._mySprite.x - this._aiSprite.x;
    const absDistance = Math.abs(distanceX);
    const aiSpeed = MOVE_SPEED * this._aiStats.speed * 0.92;

    if (absDistance > 140) {
      this._aiSprite.setVelocityX(distanceX > 0 ? aiSpeed : -aiSpeed);
      this._playAnim(this._aiSprite, this._aiKey, "move");
    } else {
      this._aiSprite.setVelocityX(0);
      this._playAnim(this._aiSprite, this._aiKey, "idle");

      if (time - this._aiLastAttack > ATTACK_COOLDOWN + 180) {
        const roll = Math.random();
        if (roll < 0.18) {
          this._aiBlocking = true;
          this._playAnim(this._aiSprite, this._aiKey, "block");
          const blockDuration = getBlockDuration(this._aiStats.speed, this._myStats.speed);
          this.time.delayedCall(blockDuration, () => {
            this._aiBlocking = false;
            if (!this._gameOver) this._playAnim(this._aiSprite, this._aiKey, "idle");
          });
        } else {
          const type = roll < 0.58 ? "punch" : roll < 0.86 ? "kick" : "special";
          this._performAttack(type, "ai", time);
        }
      }
    }

    if (Math.random() < 0.003 && this._aiSprite.body.blocked.down) {
      this._aiSprite.setVelocityY(JUMP_VELOCITY * 0.9);
    }
  }

  _performAttack(type, side, time) {
    const attacker = side === "my" ? this._mySprite : this._aiSprite;
    const defender = side === "my" ? this._aiSprite : this._mySprite;
    const attackerKey = side === "my" ? this._myKey : this._aiKey;
    const attackerStats = side === "my" ? this._myStats : this._aiStats;
    const defenderStats = side === "my" ? this._aiStats : this._myStats;
    const defenderBlocking = side === "my" ? this._aiBlocking : this._myBlocking;

    if (side === "my") {
      this._myAttacking = true;
      this._myLastAttack = time;
    } else {
      this._aiAttacking = true;
      this._aiLastAttack = time;
    }

    attacker.setVelocityX(0);
    this._playAnim(attacker, attackerKey, type);

    const info = ATTACK_HITBOX[type];
    const direction = attacker.flipX ? -1 : 1;
    const hitboxX = attacker.x + direction * info.range;
    const hitboxY = attacker.y - 46;

    const hitbox = this.add.zone(hitboxX, hitboxY, info.w, info.h);
    this.physics.add.existing(hitbox);
    hitbox.body.setAllowGravity(false);
    hitbox.body.moves = false;

    const overlap = this.physics.add.overlap(hitbox, defender, () => {
      const dmgBase = type === "special" ? AI_SPECIAL_DAMAGE : BASE_DAMAGE[type];
      const raw = Math.round((dmgBase * attackerStats.attack) / defenderStats.defense);
      const dmg = defenderBlocking ? Math.floor(raw / 2) : raw;

      if (side === "my") {
        this._aiHp = Math.max(0, this._aiHp - dmg);
        this._aiStunnedUntil = Math.max(this._aiStunnedUntil, time + getHitStunDuration(type, defenderBlocking));
        applyKnockback({
          scene: this,
          attackerSprite: this._mySprite,
          defenderSprite: this._aiSprite,
          action: type,
          isBlocked: defenderBlocking,
        });
        if (!defenderBlocking) {
			this._playAnim(this._aiSprite, this._aiKey, "hit");
		}
      } else {
        this._myHp = Math.max(0, this._myHp - dmg);
        this._myBlocking = false;
        this._myAttacking = false;
        this._myStunnedUntil = Math.max(this._myStunnedUntil, time + getHitStunDuration(type, defenderBlocking));
        applyKnockback({
          scene: this,
          attackerSprite: this._aiSprite,
          defenderSprite: this._mySprite,
          action: type,
          isBlocked: defenderBlocking,
        });
        if (!defenderBlocking) {
			this._playAnim(this._mySprite, this._myKey, "hit");
		}
      }

      this._updateHud();
      this._checkEnd();
      overlap.destroy();
      hitbox.destroy();
    });

    this.time.delayedCall(110, () => {
      if (overlap?.active) overlap.destroy();
      if (hitbox?.active) hitbox.destroy();
    });

    const duration = this._getAnimDuration(attackerKey, type);
    this.time.delayedCall(duration, () => {
      if (side === "my") this._myAttacking = false;
      else this._aiAttacking = false;

      if (!this._gameOver) this._playAnim(attacker, attackerKey, "idle");
    });
  }

  _getAnimDuration(charKey, animName) {
    return getCharacterAnimDuration(charKey, animName);
  }

  _checkEnd() {
    if (this._gameOver || this._roundOver) return;

    if (this._myHp <= 0 || this._aiHp <= 0) {
      this._roundOver = true;
      this._mySprite.setVelocity(0, 0);
      this._aiSprite.setVelocity(0, 0);

      const winnerTeam = this._myHp > 0 ? 1 : 2;
      if (winnerTeam === 1) this._myWins++;
      else this._aiWins++;

      if (this._myHp <= 0) {
        this._playAnim(this._mySprite, this._myKey, "fall");
      }
      if (this._aiHp <= 0) {
        this._playAnim(this._aiSprite, this._aiKey, "fall");
      }

      this._persistRoundResult(this._round, winnerTeam);
      this._updateHud();

      if (this._round >= 3) {
        this._gameOver = true;
        const gameWinnerTeam = this._myWins >= this._aiWins ? 1 : 2;
        this._persistGameFinish(gameWinnerTeam);
        const text = gameWinnerTeam === 1 ? "Victory!" : "Defeat";
        this._showEndScreen(text);
      } else {
        this._showRoundBanner(winnerTeam === 1 ? "Round Won!" : "Round Lost");
        this.time.delayedCall(1500, () => this._resetRound());
      }
    }
  }

  async _persistRoundResult(round, winnerTeam) {
    if (!this._gameId) return;
    try {
      await gameService.saveRound(this._gameId, round, winnerTeam);
    } catch (err) {
      console.error("[FightAi] failed to persist round:", err);
    }
  }

  async _persistGameFinish(winningTeam) {
    if (!this._gameId) return;
    try {
      await gameService.finishGame(this._gameId, winningTeam);
    } catch (err) {
      console.error("[FightAi] failed to finish game:", err);
    }
  }

  _showRoundBanner(text) {
    const banner = document.getElementById("fight-banner");
    if (!banner) return;
    banner.textContent = text;
    banner.classList.remove("hidden");
    this.time.delayedCall(1300, () => banner.classList.add("hidden"));
  }

  _resetRound() {
    this._round++;
    this._roundOver = false;
    this._myBlocking = false;
    this._aiBlocking = false;
    this._myAttacking = false;
    this._aiAttacking = false;
    this._myStunnedUntil = 0;
    this._aiStunnedUntil = 0;

    this._myHp = this._myMaxHp;
    this._aiHp = this._aiMaxHp;

    this._mySprite.setPosition(this._startMyX, GROUND_Y);
    this._aiSprite.setPosition(this._startAiX, GROUND_Y);
    this._mySprite.setVelocity(0, 0);
    this._aiSprite.setVelocity(0, 0);

    this._playAnim(this._mySprite, this._myKey, "idle");
    this._playAnim(this._aiSprite, this._aiKey, "idle");
    this._updateHud();
  }

  _buildHud() {
    const hud = document.getElementById("fight-hud");
    if (!hud) return;
    hud.classList.remove("hidden");

    const p1Name = document.getElementById("hud-p1-name");
    const p2Name = document.getElementById("hud-p2-name");
    if (p1Name) p1Name.textContent = this._myName;
    if (p2Name) p2Name.textContent = this._aiName;

    const round = document.getElementById("hud-round");
    if (round) round.textContent = `Round ${this._round}`;

    const wins1 = document.getElementById("hud-p1-wins");
    const wins2 = document.getElementById("hud-p2-wins");
    if (wins1) wins1.textContent = "●".repeat(this._myWins);
    if (wins2) wins2.textContent = "●".repeat(this._aiWins);
  }

  _updateHud() {
    const p1Fill = document.getElementById("hud-p1-hp-fill");
    const p2Fill = document.getElementById("hud-p2-hp-fill");

    if (p1Fill) p1Fill.style.width = `${(this._myHp / this._myMaxHp) * 100}%`;
    if (p2Fill) p2Fill.style.width = `${(this._aiHp / this._aiMaxHp) * 100}%`;

    const wins1 = document.getElementById("hud-p1-wins");
    const wins2 = document.getElementById("hud-p2-wins");
    if (wins1) wins1.textContent = "●".repeat(this._myWins);
    if (wins2) wins2.textContent = "●".repeat(this._aiWins);

    const round = document.getElementById("hud-round");
    if (round) round.textContent = `Round ${this._round}`;
  }

  _showEndScreen(text) {
    const banner = document.getElementById("fight-banner");
    if (banner) {
      banner.textContent = text;
      banner.classList.remove("hidden");
    }

    const back = document.getElementById("btn-fight-back");
    if (back) {
      back.classList.remove("hidden");
      back.onclick = () => {
        this._hideHud();
        this.scene.start("MenuScene");
      };
    }
  }

  _hideHud() {
    const hud = document.getElementById("fight-hud");
    const banner = document.getElementById("fight-banner");
    const back = document.getElementById("btn-fight-back");

    if (hud) hud.classList.add("hidden");
    if (banner) banner.classList.add("hidden");
    if (back) back.classList.add("hidden");
  }

  shutdown() {
    this._hideHud();
  }
}
