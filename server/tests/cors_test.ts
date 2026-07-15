import { assertEquals } from "jsr:@std/assert@^0.225.0";
import { corsMiddleware } from "../server.ts";

function makeCtx(origin: string | null) {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  return {
    request: { method: "GET", headers },
    response: { headers: new Headers(), status: 0 },
  } as any;
}

Deno.test("corsMiddleware reflects allowed origin", async () => {
  Deno.env.set("ALLOWED_ORIGINS", "http://localhost:8080,https://archi-fighter.vercel.app");
  const ctx = makeCtx("http://localhost:8080");
  let nextCalled = false;
  await corsMiddleware(ctx, () => { nextCalled = true; });
  assertEquals(nextCalled, true);
  assertEquals(ctx.response.headers.get("Access-Control-Allow-Origin"), "http://localhost:8080");
});

Deno.test("corsMiddleware does not set ACAO for disallowed origin", async () => {
  Deno.env.set("ALLOWED_ORIGINS", "http://localhost:8080");
  const ctx = makeCtx("https://evil.example.com");
  await corsMiddleware(ctx, () => {});
  assertEquals(ctx.response.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("corsMiddleware handles OPTIONS preflight with 204", async () => {
  Deno.env.set("ALLOWED_ORIGINS", "http://localhost:8080");
  const ctx = makeCtx("http://localhost:8080");
  ctx.request.method = "OPTIONS";
  await corsMiddleware(ctx, () => {});
  assertEquals(ctx.response.status, 204);
});
