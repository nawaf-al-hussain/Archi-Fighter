import { Application, Router } from "oak";

const router = new Router();
const app = new Application();

// Root endpoint
router.get("/", (ctx) => {
  ctx.response.body = {
    message: "Archi-Fighter Server",
    status: "running",
    client: "http://localhost:8080"
  };
});

// Register router middleware
app.use(router.routes());
app.use(router.allowedMethods());

const port = 3000;

console.log("Hi from the server I am working fine here");

await app.listen({ port });
