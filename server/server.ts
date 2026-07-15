import "@std/dotenv/load";
import { Application, type Context, type Next } from "oak";
import { db } from "./database/database.ts";
import apiRouter from "./routes/index.ts";
import docsRouter from "./routes/docs.routes.ts";
import { validateEnv, getAllowedOrigins } from "./config.ts";

/**
 * CORS middleware — reflects the request Origin back as ACAO only when it
 * appears in ALLOWED_ORIGINS (parsed via getAllowedOrigins()).
 *
 * The `next` parameter is typed as `Next` for runtime compatibility with
 * Oak's middleware chain, but is accepted more permissively at the type
 * level (`Next | (() => void)`) so unit tests can pass plain `() => void`
 * stub callbacks without `as any` casts on every call site.
 */
export function corsMiddleware(
  ctx: Context,
  next: Next | (() => void),
): Promise<unknown> | unknown {
  const origin = ctx.request.headers.get("Origin");
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    ctx.response.headers.set("Access-Control-Allow-Origin", origin);
    ctx.response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    ctx.response.headers.set("Vary", "Origin");
  }
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }
  return next();
}

export const app = new Application();

validateEnv(); // Fail fast on missing config

app.use(corsMiddleware);
app.use(docsRouter.routes());
app.use(apiRouter.routes());

console.log("Archi-Fighter server ready");

// Local dev: deno task dev runs server.ts directly → call listen()
// Deno Deploy: entry.ts imports `app` and calls Deno.serve(app.handle)
if (import.meta.main) {
  const port = parseInt(Deno.env.get("SERVER_PORT") ?? "3000");
  db.connect().then(() => {
    console.log(`Server listening on http://localhost:${port}`);
    app.listen({ port });
  });
}
