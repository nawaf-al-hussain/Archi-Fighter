import { Router } from "oak";
import characterRouter from "./character.routes.ts";
import mapRouter from "./map.routes.ts";
import playerRouter from "./player.routes.ts";
import docsRouter from "./docs.routes.ts";

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

apiRouter.use(characterRouter.routes(), characterRouter.allowedMethods());
apiRouter.use(mapRouter.routes(), mapRouter.allowedMethods());
apiRouter.use(playerRouter.routes(), playerRouter.allowedMethods());
apiRouter.use(docsRouter.routes(), docsRouter.allowedMethods());

export default apiRouter;
