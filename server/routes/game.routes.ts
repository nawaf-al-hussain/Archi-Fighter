import { Router } from "oak";
import * as gameController from "../controllers/game.controller.ts";

const gameRouter = new Router();

gameRouter.post("/games",        gameController.create);
gameRouter.post("/games/ai/start", gameController.startAiGame);
gameRouter.get( "/games/:id/ws", gameController.connect);
gameRouter.post("/games/:id/rounds", gameController.addRound);
gameRouter.patch("/games/:id/finish", gameController.finishGame);

export default gameRouter;
