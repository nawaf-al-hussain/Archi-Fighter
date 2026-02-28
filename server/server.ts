import "@std/dotenv/load";
import { Application, Router } from "oak";
import { db } from "./database/database.ts";
import { runMigrations } from "./database/migrations.ts";
import apiRouter from "./routes/index.ts";
import docsRouter from "./routes/docs.routes.ts";


const router = new Router();
const app = new Application();

const clientPort = Deno.env.get("CLIENT_PORT") || "8080";
const serverPort = Deno.env.get("SERVER_PORT") || "3000";

// Root endpoint
router.get("/", (ctx) => {
  ctx.response.body = {
    message: "Archi-Fighter Server",
    status: "running",
    client: `http://localhost:${clientPort}`,

  };
});

// Register router middleware
app.use(router.routes());       // GET /
app.use(docsRouter.routes());   // GET /docs, GET /openapi.json
app.use(apiRouter.routes());    // GET /api/v1/characters, etc.

console.log("Hi from the server I am working fine");
console.log(`%cServer is running at: http://localhost:${serverPort}`, "color:yellow");

await db.connect();

if (Deno.env.get("NODE_ENV") !== "production") {
  await runMigrations();
}

await app.listen({ port: parseInt(serverPort) });
