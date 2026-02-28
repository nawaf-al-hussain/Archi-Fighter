import { Router } from "oak";
import characterRouter from "./character.routes.ts";
import mapRouter from "./map.routes.ts";
import playerRouter from "./player.routes.ts";
import docsRouter from "./docs.routes.ts";

const apiRouter = new Router({ prefix: "/api/v1" });

apiRouter.use(characterRouter.routes(), characterRouter.allowedMethods());
apiRouter.use(mapRouter.routes(), mapRouter.allowedMethods());
apiRouter.use(playerRouter.routes(), playerRouter.allowedMethods());
apiRouter.use(docsRouter.routes(), docsRouter.allowedMethods());

export default apiRouter;
