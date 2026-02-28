import { Router } from "oak";
import { getAll, getById } from "../controllers/character.controller.ts";

const router = new Router();

router
  .get("/characters", getAll)
  .get("/characters/:id", getById);

export default router;
