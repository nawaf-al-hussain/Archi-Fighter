export interface Character {
  id: number;
  name: string;
  health: number;       // max HP pool
  speed: number;        // movement speed multiplier
  attack: number;       // base damage multiplier
  defense: number;      // damage reduction multiplier
  sprite_key: string;   // maps to the Phaser sprite asset name
}
