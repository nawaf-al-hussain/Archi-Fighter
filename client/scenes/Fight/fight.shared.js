import { CHARACTER_CONFIGS } from "../../config/characters.config.js";

export const BASE_DAMAGE = {
  punch: 8,
  kick: 12,
  special: 20,
  block: 0,
};

export const MOVE_SPEED = 220;
export const JUMP_VELOCITY = -590;
export const GRAVITY = 1350;
export const GROUND_Y = 600;
export const ATTACK_COOLDOWN = 500;
export const CHARACTER_SCALE_FACTOR = 0.62;

export const KNOCKBACK_FORCE = {
  punch: { x: 560, y: 0, duration: 85 },
  kick: { x: 700, y: -95, duration: 110 },
  special: { x: 860, y: -130, duration: 140 },
};

export const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

export const getBlockDuration = (mySpeed = 1, enemySpeed = 1) => {
  const combined = (Number(mySpeed) + Number(enemySpeed)) / 2;
  const clampedCombined = Math.min(1.8, Math.max(0.7, combined));
  const duration = 380 - (clampedCombined - 1) * 90;
  return Math.round(Math.min(520, Math.max(240, duration)));
};

export const createFighterSprite = (scene, x, y, charKey) => {
  const cfg = CHARACTER_CONFIGS[charKey];
  const initKey = charKey ? `${charKey}_idle_0` : "__DEFAULT";
  const sprite = scene.physics.add.sprite(x, y, initKey);
  sprite.setScale((cfg?.scale ?? 2) * CHARACTER_SCALE_FACTOR);
  sprite.setCollideWorldBounds(true);
  sprite.setOrigin(0.5, 1);
  return sprite;
};

export const registerCharacterAnimations = (scene, charKey) => {
  if (!charKey) return;
  const cfg = CHARACTER_CONFIGS[charKey];
  if (!cfg) return;

  for (const [animName, animCfg] of Object.entries(cfg.animations)) {
    const animKey = `${charKey}_${animName}`;
    if (scene.anims.exists(animKey)) continue;

    const frames = animCfg.frames
      .map((_, i) => ({ key: `${charKey}_${animName}_${i}` }))
      .filter((frame) => scene.textures.exists(frame.key));

    if (frames.length === 0) continue;

    scene.anims.create({
      key: animKey,
      frames,
      frameRate: animCfg.frameRate,
      repeat: animCfg.loop ? -1 : 0,
    });
  }
};

export const playCharacterAnim = (scene, sprite, charKey, animName) => {
  const key = `${charKey}_${animName}`;
  const anim = scene.anims.get(key);

  if (!anim || !anim.frames || anim.frames.length === 0) {
    if (animName !== "idle") {
      const idleKey = `${charKey}_idle`;
      const idleAnim = scene.anims.get(idleKey);
      if (idleAnim && idleAnim.frames?.length > 0 && (sprite.anims.currentAnim?.key !== idleKey || !sprite.anims.isPlaying)) {
        try {
          sprite.play(idleKey, true);
        } catch {
          // noop
        }
      }
    }
    return;
  }

  if (sprite.anims.currentAnim?.key !== key || !sprite.anims.isPlaying) {
    try {
      sprite.play(key, true);
    } catch {
      // noop
    }
  }
};

export const getCharacterAnimDuration = (charKey, animName) => {
  const cfg = CHARACTER_CONFIGS[charKey]?.animations?.[animName];
  if (!cfg) {
	return 400;
  }
  return Math.ceil((cfg.frames.length / cfg.frameRate) * 1000);
};

export const getHitStunDuration = (action, isBlocked = false) => {
  const base = {
    punch: 120,
    kick: 160,
    special: 220,
  }[action] ?? 100;

  return isBlocked ? Math.round(base * 0.55) : base;
};

export const applyKnockback = ({ scene, attackerSprite, defenderSprite, action, isBlocked = false }) => {
  if (!attackerSprite || !defenderSprite || !defenderSprite.body) 
	return;

  const profile = KNOCKBACK_FORCE[action];
  if (!profile) 
	return;

  const direction = defenderSprite.x >= attackerSprite.x ? 1 : -1;
  const multiplier = isBlocked ? 0.35 : 1;

  defenderSprite.setVelocityX(direction * profile.x * multiplier);

  if (!isBlocked && defenderSprite.body.blocked?.down && profile.y < 0) {
    defenderSprite.setVelocityY(profile.y);
  }

  if (scene?.time) {
    const stopAfter = Math.round(profile.duration * (isBlocked ? 0.75 : 1));
    scene.time.delayedCall(stopAfter, () => {
      if (defenderSprite?.body) {
        defenderSprite.setVelocityX(0);
      }
    });
  }
};
