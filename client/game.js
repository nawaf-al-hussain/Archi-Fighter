import Phaser from "phaser";
import { MenuScene } from "./scenes/MenuScene.js";
import { mobileManager } from "./managers/mobile.manager.js";


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
    scene: [MenuScene],
  };

  new Phaser.Game(config);
}
