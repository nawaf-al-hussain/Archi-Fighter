import { db } from "./database.ts";
import { runMigrations } from "./migrations.ts";

// ─── Characters ───────────────────────────────────────────────────────────────
// sprite_key matches the key used in client/config/characters.config.js

const characters = [
  // Balanced classic fighter — strong toolkit: punch, kick, down-kick
  { name: "Le Corbusier", health: 100, speed: 1.00, attack: 1.00, defense: 1.00, sprite_key: "lecorbusier" },
  // Fluid thrower — medium stats, specialises in throws
  { name: "Niemeyer",     health:  95, speed: 1.10, attack: 1.10, defense: 0.90, sprite_key: "niemeyer"    },
  // Ancient distance fighter — sturdy, hits hard from range and air
  { name: "Phidias",      health: 110, speed: 1.35, attack: 1.05, defense: 1.15, sprite_key: "phidias"     },
  // The villain — crouch specialist, fast and fluid
  { name: "Le Promoteur", health: 80, speed: 1.50, attack: 1.00, defense: 0.90, sprite_key: "promoteur"   },
  // Speedster trickster — saber kick, crouch kick, diverse moves; fragile
  { name: "Rem Koolhaas", health:  85, speed: 1.40, attack: 1.00, defense: 0.80, sprite_key: "remkoolhaas" },
  // The complete fighter — glass cannon with uppercut, jump kick, crouch
  { name: "Tadao Ando",   health:  90, speed: 1.25, attack: 1.30, defense: 0.85, sprite_key: "tadaoando"   },
  // The tank — slow but devastating, high defense
  { name: "Zaha Hadid",   health:  125, speed: 0.85, attack: 1.15, defense: 0.90, sprite_key: "zahahadid"   },
];

// ─── Maps ─────────────────────────────────────────────────────────────────────
// sprite_key matches the key used in client/config/maps.config.js

const maps = [
  { name: "Acropole",      sprite_key: "acropole"     },
  { name: "Autocad",       sprite_key: "autocad"      },
  { name: "Bourse",        sprite_key: "bourse"       },
  { name: "Chantier",      sprite_key: "chantier"     },
  { name: "Cité Radieuse", sprite_key: "cite_radieuse"},
  { name: "Egypte",        sprite_key: "egypte"       },
  { name: "Germania",      sprite_key: "germania"     },
  { name: "Promoteur",     sprite_key: "promoteur_map"},
  { name: "Saint-Cloud",   sprite_key: "saint_cloud"  },
];

export async function runSeeds() {

  // Upsert characters 
  for (const c of characters) {
    await db.query(
      `INSERT INTO characters (name, health, speed, attack, defense, sprite_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET
         health     = EXCLUDED.health,
         speed      = EXCLUDED.speed,
         attack     = EXCLUDED.attack,
         defense    = EXCLUDED.defense,
         sprite_key = EXCLUDED.sprite_key`,
      [c.name, c.health, c.speed, c.attack, c.defense, c.sprite_key],
    );
  }

  // Upsert maps — updates sprite_key if name already exists
  for (const m of maps) {
    await db.query(
      `INSERT INTO maps (name, sprite_key)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET
         sprite_key = EXCLUDED.sprite_key`,
      [m.name, m.sprite_key],
    );
  }

  console.log("%cSeeds complete.", "color:green");
}

// Allows running directly: deno task db:seed
if (import.meta.main) {
  await db.connect();
  await runMigrations();
  await runSeeds();
  await db.disconnect();
}
