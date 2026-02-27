import { db } from "../database/database.ts";

export abstract class BaseModel<T> {
  protected abstract table: string;

  async getAll(): Promise<T[]> {
    return await db.query<T>(`SELECT * FROM ${this.table}`);
  }

  async getById(id: number): Promise<T | null> {
    const rows = await db.query<T>(
      `SELECT * FROM ${this.table} WHERE id = ${id}`
    );
    return rows[0] ?? null;
  }
}
