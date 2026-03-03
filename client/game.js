import Phaser from "phaser";
import { MenuScene }            from "./scenes/MenuScene.js";
import { StatsScene }           from "./scenes/StatsScene.js";
import { CharacterSelectScene } from "./scenes/CharacterSelectScene.js";
import { FightScene }           from "./scenes/FightScene.js";
import { FightAiScene }         from "./scenes/FightAiScene.js";
import { mobileManager }        from "./managers/mobile.manager.js";


// Not playable on mobile, mobile may be added in the future.
if (mobileManager.isMobile()) {
  mobileManager.displayMobileMessage(
    "Sorry, Archi-Fighter is not available on mobile yet. <br/> Contribute on <a href=\"https://github.com/UnMugViolet/Archi-Fighter.git\" target=\"_blank\" >GitHub</a> to help make it happen!");
} else {

  const config = {
    type: Phaser.AUTO,
    parent: "game-container",
    width: 1280,
    height: 720,
    backgroundColor: "#0a0a0a",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
        default: 'arcade',
        arcade: {
            debug: true,
            gravity: { y: 0 }
        }
    },
    scene: [MenuScene, StatsScene, CharacterSelectScene, FightScene, FightAiScene],
  };

  new Phaser.Game(config);
}
