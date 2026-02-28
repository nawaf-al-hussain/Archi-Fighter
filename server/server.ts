import "@std/dotenv/load";
import { Application, Router } from "oak";
import { db } from "./database/database.ts";
import { runMigrations } from "./database/migrations.ts";
import apiRouter from "./routes/index.ts";
import docsRouter from "./routes/docs.routes.ts";

const app = new Application();

const serverPort = Deno.env.get("SERVER_PORT") || "3000";

// Register router middleware
app.use(docsRouter.routes());   // GET /docs, GET /openapi.json
app.use(apiRouter.routes());    // GET /api/v1/characters, etc.

console.log("Hi from the server I am working fine");
console.log(`%cServer is running at: http://localhost:${serverPort}`, "color:yellow");

await db.connect();

if (Deno.env.get("NODE_ENV") !== "production") {
  await runMigrations();
}

await app.listen({ port: parseInt(serverPort) });
