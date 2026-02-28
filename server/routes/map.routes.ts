import { Router } from "oak";
import { getAll, getById } from "../controllers/map.controller.ts";

const router = new Router();

router
  .get("/maps", getAll)
  .get("/maps/:id", getById);

export default router;
