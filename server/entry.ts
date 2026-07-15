import { app } from "./server.ts";
import { db } from "./database/database.ts";

await db.connect();

// Oak v12.6.1's `app.handle()` returns `Promise<Response | undefined>` — the
// `undefined` case occurs only when middleware sets `context.respond = false`.
// Deno.serve requires a Response, so we fall back to 404 to satisfy the type
// and guard against any future middleware that short-circuits the response.
Deno.serve((req) =>
  app.handle(req).then((res) => res ?? new Response("Not Found", { status: 404 }))
);
