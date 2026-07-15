import { Router } from "oak";
import characterRouter from "./character.routes.ts";
import mapRouter from "./map.routes.ts";
import playerRouter from "./player.routes.ts";
import gameRouter from "./game.routes.ts";
import docsRouter from "./docs.routes.ts";
import matchmakingRouter from "./matchmaking.routes.ts";
import { db } from "../database/database.ts";

const clientPort = Deno.env.get("CLIENT_PORT") || "8080";
const serverPort = Deno.env.get("SERVER_PORT") || "3000";


const apiRouter = new Router({ prefix: "/api/v1" });

apiRouter.get("/", (ctx) => {
  ctx.response.body = {
    message: "Archi-Fighter API is running!",
    status: "running",
    client: `http://localhost:${clientPort}`,
        docs: `http://localhost:${serverPort}/api/v1/docs`

  };
});

// Health check endpoint — used by client warm-up ping + monitoring.
// Pings the DB to verify the pool is alive.
apiRouter.get("/healthz", async (ctx) => {
  try {
    await db.query("SELECT 1");
    ctx.response.body = { ok: true };
  } catch (err) {
    ctx.response.status = 503;
    ctx.response.body = { ok: false, error: String(err) };
  }
});

apiRouter.use(characterRouter.routes(), characterRouter.allowedMethods());
apiRouter.use(mapRouter.routes(), mapRouter.allowedMethods());
apiRouter.use(playerRouter.routes(), playerRouter.allowedMethods());
apiRouter.use(gameRouter.routes(), gameRouter.allowedMethods());
apiRouter.use(docsRouter.routes(), docsRouter.allowedMethods());
apiRouter.use(matchmakingRouter.routes(), matchmakingRouter.allowedMethods());

export default apiRouter;
