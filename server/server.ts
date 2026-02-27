import { Application, Router } from "oak";
import "@std/dotenv/load";
import { db } from "./database/database.ts";
import { runMigrations } from "./database/migrations.ts";

const router = new Router();
const app = new Application();

const port = parseInt(Deno.env.get("SERVER_PORT") || "3000");
const clientUrl = Deno.env.get("CLIENT_URL") || "http://localhost:8080";
const serverUrl = Deno.env.get("SERVER_URL") || "http://localhost:3000";

// Root endpoint
router.get("/", (ctx) => {
  ctx.response.body = {
    message: "Archi-Fighter Server",
    status: "running",
    client: clientUrl
  };
});

// Register router middleware
app.use(router.routes());
app.use(router.allowedMethods());


console.log("Hi from the server I am working fine");
console.log(`%cServer is running at: ${serverUrl}`, "color:yellow");

await db.connect();
await runMigrations();

await app.listen({ port });
