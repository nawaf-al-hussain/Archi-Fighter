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

  await db.query(`
    CREATE TABLE IF NOT EXISTS maps (
      id         SERIAL PRIMARY KEY,
      name       TEXT  NOT NULL UNIQUE,
      sprite_key TEXT  NOT NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS players (
      id         SERIAL PRIMARY KEY,
      pseudo     TEXT  NOT NULL,
      token      TEXT  NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS games (
      id           SERIAL PRIMARY KEY,
      type         TEXT NOT NULL CHECK (type IN ('1VS1', '2VS2', '1VSAI', '2VSAI')),
      status       TEXT NOT NULL CHECK (status IN ('pending', 'ongoing', 'finished')),
      map_id       INT  REFERENCES maps(id) ON DELETE SET NULL,
      winning_team INT  CHECK (winning_team IN (1, 2)),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS game_players (
      id           SERIAL PRIMARY KEY,
      game_id      INT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_id    INT REFERENCES players(id) ON DELETE SET NULL,
      character_id INT NOT NULL REFERENCES characters(id) ON DELETE RESTRICT,
      team         INT NOT NULL CHECK (team IN (1, 2))
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS rounds (
      id          SERIAL PRIMARY KEY,
      game_id     INT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      round       INT NOT NULL,
      winner_team INT CHECK (winner_team IN (1, 2)),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS images (
      id         SERIAL PRIMARY KEY,
      file_name  TEXT NOT NULL,
      file_path  TEXT NOT NULL,
      model_type TEXT NOT NULL,
      model_id   INT  NOT NULL
    )
  `);

  // Alter table image to add type column for categorization
  await db.query(`
    ALTER TABLE images
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'general'
  `);

  // Allow duplicate pseudos — pseudo is a display name, not a unique identifier
  await db.query(`
    ALTER TABLE players
    DROP CONSTRAINT IF EXISTS players_pseudo_key
  `);

  console.log("%cMigrations complete.", "color:green");
}

// Allows running directly: deno run database/migrations.ts
if (import.meta.main) {
  await db.connect();
  await runMigrations();
  await db.disconnect();
}
