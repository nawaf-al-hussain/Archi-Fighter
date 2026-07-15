import { Router } from "oak";
import * as ctrl from "../controllers/matchmaking.controller.ts";

const router = new Router();
router.post("/matchmaking/join", ctrl.join);
router.post("/matchmaking/leave", ctrl.leave);

export default router;
