import { assertEquals, assertThrows } from "jsr:@std/assert@^0.225.0";
import { validateEnv } from "../config.ts";

Deno.test("validateEnv throws if DATABASE_URL missing", () => {
  const saved = Deno.env.get("DATABASE_URL");
  Deno.env.delete("DATABASE_URL");
  try {
    assertThrows(
      () => validateEnv(),
      Error,
      "DATABASE_URL"
    );
  } finally {
    if (saved) Deno.env.set("DATABASE_URL", saved);
  }
});

Deno.test("validateEnv throws if ALLOWED_ORIGINS missing", () => {
  const saved = Deno.env.get("ALLOWED_ORIGINS");
  Deno.env.delete("ALLOWED_ORIGINS");
  try {
    assertThrows(
      () => validateEnv(),
      Error,
      "ALLOWED_ORIGINS"
    );
  } finally {
    if (saved) Deno.env.set("ALLOWED_ORIGINS", saved);
  }
});

Deno.test("validateEnv passes when all required vars set", () => {
  Deno.env.set("DATABASE_URL", "postgres://test");
  Deno.env.set("ALLOWED_ORIGINS", "http://localhost:8080");
  // Should not throw
  validateEnv();
});
