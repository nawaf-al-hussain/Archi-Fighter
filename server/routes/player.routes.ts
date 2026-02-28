import { Router } from "oak";
import { create, getMe } from "../controllers/player.controller.ts";

const router = new Router();

router
  .post("/players", create)
  .get("/players/me", getMe);

export default router;
