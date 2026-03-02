import { Router } from "oak";
import { create, getMe, getMyStats, updateMe } from "../controllers/player.controller.ts";

const router = new Router();

router
  .post("/players", create)
  .get("/players/me", getMe)
  .patch("/players/me", updateMe)
  .get("/players/me/stats", getMyStats);

export default router;
