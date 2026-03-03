/**
 * Character animation configurations.
 * sprite_key must match the value stored in the DB characters table.
 *
 * Each animation lists frame filenames relative to basePath.
 * Paths are passed through encodeURIComponent per segment when loading in Phaser.
 *
 * Standard animation names used by FightScene:
 *   idle | move | punch | kick | hit | fall | block | special
 */

export const CHARACTER_CONFIGS = {
  // ─── Le Corbusier ───────────────────────────────────────────────────────────
  lecorbusier: {
    name: "Le Corbusier",
    scale: 2,
    basePath: "assets/images/characters/LECORBUSIER",
    animations: {
      idle: {
        frames: [
          "00_IDLE/Corbusier_Idle_200_1.webp",
          "00_IDLE/Corbusier_Idle_200_2.webp",
        ],
        frameRate: 3,
        loop: true,
      },
      move: {
        frames: [
          "01_MOVE/Corbusier_Move_200_1.webp",
          "01_MOVE/Corbusier_Move_200_2.webp",
          "01_MOVE/Corbusier_Move_200_3.webp",
          "01_MOVE/Corbusier_Move_200_4.webp",
        ],
        frameRate: 8,
        loop: true,
      },
      punch: {
        frames: [
          "02_PUNCH/Corbusier_Punch_200_1.webp",
          "02_PUNCH/Corbusier_Punch_200_2.webp",
          "02_PUNCH/Corbusier_Punch_200_3.webp",
          "02_PUNCH/Corbusier_Punch_200_4.webp",
        ],
        frameRate: 12,
        loop: false,
      },
      kick: {
        frames: [
          "03_KICK/Corbusier_Kick_200_1.webp",
          "03_KICK/Corbusier_Kick_200_2.webp",
          "03_KICK/Corbusier_Kick_200_3.webp",
          "03_KICK/Corbusier_Kick_200_4.webp",
        ],
        frameRate: 10,
        loop: false,
      },
      hit: {
        frames: [
          "04_PUNCHED/Corbusier_Punched_200_1.webp",
          "04_PUNCHED/Corbusier_Punched_200_2.webp",
        ],
        frameRate: 8,
        loop: false,
      },
      fall: {
        frames: [
          "05_FALLING DOWN/Corbusier_FallingDown_200_1.webp",
          "05_FALLING DOWN/Corbusier_FallingDown_200_2.webp",
        ],
        frameRate: 5,
        loop: false,
      },
      special: {
        frames: [
          "06_DOWN KICK/Corbusier_DownKick_200_1.webp",
          "06_DOWN KICK/Corbusier_DownKick_200_2.webp",
          "06_DOWN KICK/Corbusier_DownKick_200_3.webp",
          "06_DOWN KICK/Corbusier_DownKick_200_4.webp",
        ],
        frameRate: 10,
        loop: false,
      },
      block: {
        frames: ["00_IDLE/Corbusier_Idle_200_1.webp"],
        frameRate: 1,
        loop: true,
      },
    },
  },

  // ─── Niemeyer ───────────────────────────────────────────────────────────────
  niemeyer: {
    name: "Niemeyer",
    scale: 2,
    basePath: "assets/images/characters/NIEMEYER",
    animations: {
      idle: {
        frames: [
          "00_IDLE/NIEMEYER_Idle_200_1.webp",
          "00_IDLE/NIEMEYER_Idle_200_2.webp",
        ],
        frameRate: 3,
        loop: true,
      },
      move: {
        frames: [
          "01_MOVE/NIEMEYER_Move_200_1.webp",
          "01_MOVE/NIEMEYER_Move_200_2.webp",
          "01_MOVE/NIEMEYER_Move_200_3.webp",
        ],
        frameRate: 8,
        loop: true,
      },
      punch: {
        frames: [
          "02_PUNCH/NIEMEYER_Punch_200_1.webp",
          "02_PUNCH/NIEMEYER_Punch_200_2.webp",
          "02_PUNCH/NIEMEYER_Punch_200_3.webp",
        ],
        frameRate: 12,
        loop: false,
      },
      kick: {
        frames: [
          "08_THROW/NIEMEYER_Throw_200_1.webp",
          "08_THROW/NIEMEYER_Throw_200_2.webp",
          "08_THROW/NIEMEYER_Throw_200_3.webp",
        ],
        frameRate: 10,
        loop: false,
      },
      hit: {
        frames: ["06_FALL/NIEMEYER_Fall_200.webp"],
        frameRate: 6,
        loop: false,
      },
      fall: {
        frames: [
          "06_FALL/NIEMEYER_Fall_200.webp",
          "06_FALL/NIEMEYER_Fallen_200.webp",
        ],
        frameRate: 4,
        loop: false,
      },
      block: {
        frames: ["09_BLOCK/NIEMEYER_Protect_200.webp"],
        frameRate: 1,
        loop: true,
      },
      special: {
        frames: [
          "08_THROW/NIEMEYER_Throw_200_1.webp",
          "08_THROW/NIEMEYER_Throw_200_2.webp",
          "08_THROW/NIEMEYER_Throw_200_3.webp",
        ],
        frameRate: 10,
        loop: false,
      },
    },
  },

  // ─── Phidias ────────────────────────────────────────────────────────────────
  phidias: {
    name: "Phidias",
    scale: 2,
    basePath: "assets/images/characters/PHIDIAS",
    animations: {
      idle: {
        frames: [
          "00_IDLE/PHIDIAS_Idle_200_1.webp",
          "00_IDLE/PHIDIAS_Idle_200_2.webp",
        ],
        frameRate: 3,
        loop: true,
      },
      move: {
        frames: [
          "00_IDLE/PHIDIAS_Idle_200_1.webp",
          "00_IDLE/PHIDIAS_Idle_200_2.webp",
        ],
        frameRate: 3,
        loop: true,
      }, // no move anim — use idle
      punch: {
        frames: [
          "11_DISTANCE/PHIDIAS_Punch_Throw_200_1.webp",
          "11_DISTANCE/PHIDIAS_Punch_Throw_200_2.webp",
          "11_DISTANCE/PHIDIAS_Punch_Throw_200_3.webp",
        ],
        frameRate: 12,
        loop: false,
      },
      kick: {
        frames: [
          "31_JUMP_PUNCH/PHIDIAS_Jump_Punch_200_1.webp",
          "31_JUMP_PUNCH/PHIDIAS_Jump_Punch_200_2.webp",
          "31_JUMP_PUNCH/PHIDIAS_Jump_Punch_200_3.webp",
        ],
        frameRate: 10,
        loop: false,
      },
      hit: {
        frames: [
          "04_PUNCHED/PHIDIAS_Punched_200_1.webp",
          "04_PUNCHED/PHIDIAS_Punched_200_2.webp",
        ],
        frameRate: 8,
        loop: false,
      },
      fall: {
        frames: [
          "05_FALLING DOWN?/PHIDIAS_Fall_200_1.webp",
          "05_FALLING DOWN?/PHIDIAS_Fall_200_2.webp",
        ],
        frameRate: 5,
        loop: false,
      },
      block: {
        frames: ["07_BLOCK/PHIDIAS_Block_200_1.webp"],
        frameRate: 1,
        loop: true,
      },
      special: {
        frames: [
          "11_DISTANCE/PHIDIAS_Punch_Throw_200_1.webp",
          "11_DISTANCE/PHIDIAS_Punch_Throw_200_2.webp",
          "11_DISTANCE/PHIDIAS_Punch_Throw_200_3.webp",
          "11_DISTANCE/PHIDIAS_Punch_Throw_200_4.webp",
          "11_DISTANCE/PHIDIAS_Punch_Throw_200_5.webp",
        ],
        frameRate: 10,
        loop: false,
      },
    },
  },

  // ─── Le Promoteur ───────────────────────────────────────────────────────────
  promoteur: {
    name: "Le Promoteur",
    scale: 2,
    basePath: "assets/images/characters/PROMOTEUR",
    animations: {
      idle: {
        frames: [
          "00_IDLE/PROMOTEUR_IDLE_200_1.webp",
          "00_IDLE/PROMOTEUR_IDLE_200_2.webp",
        ],
        frameRate: 3,
        loop: true,
      },
      move: {
        frames: [
          "01_MOVE/PROMOTEUR_RUN_200_1.webp",
          "01_MOVE/PROMOTEUR_RUN_200_2.webp",
          "01_MOVE/PROMOTEUR_RUN_200_3.webp",
          "01_MOVE/PROMOTEUR_RUN_200_4.webp",
        ],
        frameRate: 8,
        loop: true,
      },
      punch: {
        frames: [
          "02_PUNCH/PROMOTEUR_PUNCH_200_1.webp",
          "02_PUNCH/PROMOTEUR_PUNCH_200_2.webp",
        ],
        frameRate: 10,
        loop: false,
      },
      kick: {
        frames: [
          "02_PUNCH/PROMOTEUR_PUNCH_200_1.webp",
          "02_PUNCH/PROMOTEUR_PUNCH_200_2.webp",
        ],
        frameRate: 9,
        loop: false,
      }, // no kick — use punch
      hit: {
        frames: ["04_PUNCHED/PROMOTEUR_PUNCHED_200_1.webp"],
        frameRate: 6,
        loop: false,
      },
      fall: {
        frames: [
          "05_FALLING DOWN/PROMOTEUR_FALLING DOWN_200_1.webp",
          "05_FALLING DOWN/PROMOTEUR_FALLING DOWN_200_2.webp",
        ],
        frameRate: 4,
        loop: false,
      },
      block: {
        frames: ["07_BLOCK/PROMOTEUR_BLOCK_200_1.webp"],
        frameRate: 1,
        loop: true,
      },
      special: {
        frames: [
          "02_PUNCH/PROMOTEUR_PUNCH_200_1.webp",
          "02_PUNCH/PROMOTEUR_PUNCH_200_2.webp",
        ],
        frameRate: 8,
        loop: false,
      },
    },
  },

  // ─── Rem Koolhaas ───────────────────────────────────────────────────────────
  remkoolhaas: {
    name: "Rem Koolhaas",
    scale: 2,
    basePath: "assets/images/characters/REM KOOLHAAS",
    animations: {
      idle: {
        frames: [
          "00_IDLE/KOOLHAAS_Idle_200_1.webp",
          "00_IDLE/KOOLHAAS_Idle_200_2.webp",
        ],
        frameRate: 3,
        loop: true,
      },
      move: {
        frames: [
          "01_MOVE/KOOLHAAS_Move_200_1.webp",
          "01_MOVE/KOOLHAAS_Move_200_2.webp",
          "01_MOVE/KOOLHAAS_Move_200_3.webp",
        ],
        frameRate: 8,
        loop: true,
      },
      punch: {
        frames: [
          "02_PUNCH/KOOLHAAS_SaberKick_200_1.webp",
          "02_PUNCH/KOOLHAAS_SaberKick_200_2.webp",
          "02_PUNCH/KOOLHAAS_SaberKick_200_3.webp",
        ],
        frameRate: 12,
        loop: false,
      },
      kick: {
        frames: [
          "03_KICK/KOOLHAAS_Kick_200_1.webp",
          "03_KICK/KOOLHAAS_Kick_200_2.webp",
          "03_KICK/KOOLHAAS_Kick_200_3.webp",
          "03_KICK/KOOLHAAS_Kick_200_4.webp",
          "03_KICK/KOOLHAAS_Kick_200_5.webp",
          "03_KICK/KOOLHAAS_Kick_200_6.webp",
        ],
        frameRate: 12,
        loop: false,
      },
      hit: {
        frames: ["05_FALL DOWN/KOOLHAAS_Fall_200_1.webp"],
        frameRate: 6,
        loop: false,
      },
      fall: {
        frames: [
          "05_FALL DOWN/KOOLHAAS_Fall_200_1.webp",
          "05_FALL DOWN/KOOLHAAS_Fall_200_2.webp",
        ],
        frameRate: 4,
        loop: false,
      },
      block: {
        frames: ["07_BLOCK/KOOLHAAS_Protect_200_1.webp"],
        frameRate: 1,
        loop: true,
      },
      special: {
        frames: [
          "21_CROUCH_KICK/KOOLHAAS_Crouch_Kick_200_1.webp",
          "21_CROUCH_KICK/KOOLHAAS_Crouch_Kick_200_2.webp",
          "21_CROUCH_KICK/KOOLHAAS_Crouch_Kick_200_3.webp",
        ],
        frameRate: 10,
        loop: false,
      },
    },
  },

  // ─── Tadao Ando ─────────────────────────────────────────────────────────────
  tadaoando: {
    name: "Tadao Ando",
    scale: 2,
    basePath: "assets/images/characters/TADAO ANDO",
    animations: {
      idle: {
        frames: [
          "00_IDLE/TADAOANDO_Idle_200_1.webp",
          "00_IDLE/TADAOANDO_Idle_200_2.webp",
        ],
        frameRate: 3,
        loop: true,
      },
      move: {
        frames: [
          "01_MOVE/TADAOANDO_Move_200_1.webp",
          "01_MOVE/TADAOANDO_Move_200_2.webp",
        ],
        frameRate: 6,
        loop: true,
      },
      punch: {
        frames: [
          "02_PUNCH/TADAOANDO_Punch_200_1.webp",
          "02_PUNCH/TADAOANDO_Punch_200_2.webp",
          "02_PUNCH/TADAOANDO_Punch_200_3.webp",
          "02_PUNCH/TADAOANDO_Punch_200_4.webp",
          "02_PUNCH/TADAOANDO_Punch_200_5.webp",
        ],
        frameRate: 12,
        loop: false,
      },
      kick: {
        frames: [
          "03_KICK/TADAOANDO_Kick_200_1.webp",
          "03_KICK/TADAOANDO_Kick_200_2.webp",
          "03_KICK/TADAOANDO_Kick_200_3.webp",
          "03_KICK/TADAOANDO_Kick_200_4.webp",
          "03_KICK/TADAOANDO_Kick_200_5.webp",
          "03_KICK/TADAOANDO_Kick_200_6.webp",
          "03_KICK/TADAOANDO_Kick_200_7.webp",
        ],
        frameRate: 12,
        loop: false,
      },
      hit: {
        frames: [
          "04_PUNCHED/TADAOANDO_Punched_200_1.webp",
          "04_PUNCHED/TADAOANDO_Punched_200_2.webp",
        ],
        frameRate: 8,
        loop: false,
      },
      fall: {
        frames: [
          "05_FALLING DOWN/TADAOANDO_Fall_200_1.webp",
          "05_FALLING DOWN/TADAOANDO_Fall_200_2.webp",
        ],
        frameRate: 5,
        loop: false,
      },
      block: {
        frames: ["07_BLOCK/TADAOANDO_Block_200_1.webp"],
        frameRate: 1,
        loop: true,
      },
      special: {
        frames: [
          "02_PUNCH_UPPERCUT/TADAOANDO_Uppercut_200_1.webp",
          "02_PUNCH_UPPERCUT/TADAOANDO_Uppercut_200_2.webp",
          "02_PUNCH_UPPERCUT/TADAOANDO_Uppercut_200_3.webp",
        ],
        frameRate: 12,
        loop: false,
      },
    },
  },

  // ─── Zaha Hadid ─────────────────────────────────────────────────────────────
  zahahadid: {
    name: "Zaha Hadid",
    scale: 2,
    basePath: "assets/images/characters/ZAHA HADID",
    animations: {
      idle: {
        frames: [
          "00_IDLE/ZahaHadid_Idle_200_1.webp",
          "00_IDLE/ZahaHadid_Idle_200_2.webp",
        ],
        frameRate: 3,
        loop: true,
      },
      move: {
        frames: [
          "01_MOVE/ZahaHadid_Move_200_1.webp",
          "01_MOVE/ZahaHadid_Move_200_2.webp",
          "01_MOVE/ZahaHadid_Move_200_3.webp",
        ],
        frameRate: 8,
        loop: true,
      },
      punch: {
        frames: [
          "02_PUNCH/ZahaHadid_Punch_200_1.webp",
          "02_PUNCH/ZahaHadid_Punch_200_2.webp",
        ],
        frameRate: 10,
        loop: false,
      },
      kick: {
        frames: [
          "03_KICK/ZahaHadid_FootKick_200_1.webp",
          "03_KICK/ZahaHadid_FootKick_200_2.webp",
          "03_KICK/ZahaHadid_FootKick_200_3.webp",
        ],
        frameRate: 10,
        loop: false,
      },
      hit: {
        frames: ["04_PUNCHED/ZahaHadid_Punched_200_1.webp"],
        frameRate: 6,
        loop: false,
      },
      fall: {
        frames: [
          "05_FALLING DOWN/ZahaHadid_Fall_200_1.webp",
          "05_FALLING DOWN/ZahaHadid_Down_200_1.webp",
        ],
        frameRate: 4,
        loop: false,
      },
      block: {
        frames: ["10_CROUCH/ZahaHadid_Crouch_200_1.webp"],
        frameRate: 1,
        loop: true,
      },
      special: {
        frames: [
          "10_CROUCH/ZahaHadid_Crouch_200_1.webp",
          "10_CROUCH/ZahaHadid_Crouch_200_2.webp",
          "10_CROUCH/ZahaHadid_Crouch_200_3.webp",
        ],
        frameRate: 8,
        loop: false,
      },
    },
  },
};
