const REQUIRED_VARS = ["DATABASE_URL", "ALLOWED_ORIGINS"] as const;

/** Validates required env vars exist. Throws Error listing all missing vars. */
export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((v) => !Deno.env.get(v));
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

/** Returns parsed ALLOWED_ORIGINS as array. */
export function getAllowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
