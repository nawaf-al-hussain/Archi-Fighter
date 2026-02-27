import { db } from "./database.ts";

export async function runMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id         SERIAL PRIMARY KEY,
      name       TEXT  NOT NULL UNIQUE,
      health     INT   NOT NULL DEFAULT 100,
      speed      FLOAT NOT NULL DEFAULT 1.0,
      attack     FLOAT NOT NULL DEFAULT 1.0,
      defense    FLOAT NOT NULL DEFAULT 1.0,
      sprite_key TEXT  NOT NULL
    )
  `);
  console.log("%cMigrations complete.", "color:green");
}

// Allows running directly: deno run database/migrations.ts
if (import.meta.main) {
  await db.connect();
  await runMigrations();
  await db.disconnect();
}
