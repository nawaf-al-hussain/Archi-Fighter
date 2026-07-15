import { Router } from "oak";
import * as gameController from "../controllers/game.controller.ts";

const gameRouter = new Router();

gameRouter.post("/games",                 gameController.create);
gameRouter.post("/games/ai/start",        gameController.startAiGame);
gameRouter.post("/games/:id/rounds",      gameController.addRound);
gameRouter.patch("/games/:id/finish",     gameController.finishGame);

// WebRTC signaling endpoints (replaces old WS endpoint)
gameRouter.post("/games/:id/signal/offer",  gameController.postOffer);
gameRouter.post("/games/:id/signal/answer", gameController.postAnswer);
gameRouter.post("/games/:id/signal/ice",    gameController.postIce);
gameRouter.get ("/games/:id/signal/poll",   gameController.pollSignal);

export default gameRouter;
