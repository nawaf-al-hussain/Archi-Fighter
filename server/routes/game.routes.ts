import { Router } from "oak";
import * as gameController from "../controllers/game.controller.ts";

const gameRouter = new Router();

gameRouter.post("/games",        gameController.create);
gameRouter.get( "/games/:id/ws", gameController.connect);

export default gameRouter;
