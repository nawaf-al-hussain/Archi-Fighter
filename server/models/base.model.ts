import { db } from "../database/database.ts";

export abstract class BaseModel<T, TRow = T> {
  protected abstract table: string;

  protected normalizeRow(row: TRow): T {
    return row as unknown as T;
  }

  async getAll(): Promise<T[]> {
    const rows = await db.query<TRow>(`SELECT * FROM ${this.table}`);
    return rows.map((row) => this.normalizeRow(row));
  }

  async getById(id: number): Promise<T | null> {
    const rows = await db.query<TRow>(
      `SELECT * FROM ${this.table} WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.normalizeRow(rows[0]) : null;
  }
}
