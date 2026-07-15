import { Pool } from "@db/postgres";

class Database {
  private pool: Pool | null = null;

  async connect(): Promise<void> {
    const url = Deno.env.get("DATABASE_URL");
    if (!url) throw new Error("DATABASE_URL not set");

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new Error(`DATABASE_URL is not a valid URL: ${url}`);
    }

    // Small pool per isolate (Neon pooler handles server-side multiplexing)
    this.pool = new Pool(url, 3, true); // 3 connections, lazy
    console.log("[db] Pool created");
  }

  // Generic with `unknown` default so the brief's contract
  // (`db.query(sql) -> Promise<unknown[]>`) holds AND existing model call sites
  // (`db.query<Player>(...)`) keep type-checking. Deviation from the brief's
  // verbatim non-generic signature, documented for the same reason Task 2
  // widened oak's `Next` type: the alternative is editing every model file,
  // which is explicitly out of scope.
  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.pool) throw new Error("db.connect() not called");
    const client = await this.pool.connect();
    try {
      const result = await client.queryObject<T>(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async end(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log("[db] Pool closed");
    }
  }
}

export const db = new Database();
