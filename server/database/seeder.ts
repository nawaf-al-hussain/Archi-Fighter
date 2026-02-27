import { db } from "./database.ts";
import { runMigrations } from "./migrations.ts";

const characters = [
  // Balanced fighter
  { name: "Le Corbusier",       health: 100, speed: 1.0, attack: 1.0, defense: 1.0, sprite_key: "corbusier" },
  // Glass cannon: high attack, fragile
  { name: "Frank Lloyd Wright", health:  90, speed: 1.1, attack: 1.4, defense: 0.7, sprite_key: "wright"    },
  // Speedster: very fast, low health
  { name: "Zaha Hadid",         health:  80, speed: 1.5, attack: 1.2, defense: 0.6, sprite_key: "hadid"     },
  // Tank: slow, high defense
  { name: "Renzo Piano",        health: 120, speed: 0.8, attack: 0.8, defense: 1.5, sprite_key: "piano"     },
];

export async function runSeeds() {
  for (const c of characters) {
    await db.query(
      `INSERT INTO characters (name, health, speed, attack, defense, sprite_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO NOTHING`,
      [c.name, c.health, c.speed, c.attack, c.defense, c.sprite_key]
    );
  }
  console.log("%cSeeds complete.", "color:green");
}

// Allows running directly: deno run database/seeder.ts
if (import.meta.main) {
  await db.connect();
  await runMigrations();
  await runSeeds();
  await db.disconnect();
}
