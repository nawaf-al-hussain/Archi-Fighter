import { Client } from "@db/postgres";
import "@std/dotenv/load";

export class DatabaseHandler {
	private client: Client;

	constructor() {
		this.client = new Client({
			hostname: Deno.env.get("DB_HOST") ?? "localhost",
			port:     parseInt(Deno.env.get("DB_PORT") ?? "5432"),
			user:     Deno.env.get("DB_USER"),
			password: Deno.env.get("DB_PASSWORD"),
			database: Deno.env.get("DB_NAME"),
		});
	}

	async connect() { await this.client.connect(); }
	async disconnect() { await this.client.end(); }

	async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
		const result = await this.client.queryObject<T>(sql, params);
		return result.rows;
	}

}

export const db = new DatabaseHandler();
