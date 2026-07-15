import { assertEquals, assertRejects } from "jsr:@std/assert@^0.225.0";
import { db } from "../database/database.ts";

Deno.test("db.connect throws on missing DATABASE_URL", async () => {
  const saved = Deno.env.get("DATABASE_URL");
  Deno.env.delete("DATABASE_URL");
  try {
    await assertRejects(() => db.connect(), Error, "DATABASE_URL");
  } finally {
    if (saved) Deno.env.set("DATABASE_URL", saved);
  }
});

Deno.test("db.connect throws on invalid URL format", async () => {
  const saved = Deno.env.get("DATABASE_URL");
  Deno.env.set("DATABASE_URL", "not-a-url");
  try {
    await assertRejects(() => db.connect());
  } finally {
    if (saved) Deno.env.set("DATABASE_URL", saved);
  }
});

Deno.test("db.query throws before connect() is called", async () => {
  // Use a fresh db state — since db is a singleton, we test the unconnected path
  await db.end(); // ensure disconnected
  await assertRejects(() => db.query("SELECT 1"), Error, "connect");
});
