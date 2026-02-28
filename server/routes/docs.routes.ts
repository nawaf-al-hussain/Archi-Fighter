import { Router } from "oak";

const router = new Router({ prefix: "/api/v1" });

// Resolve path relative to this module file, not the working directory
const specPath = new URL("../docs/openapi.json", import.meta.url).pathname;

router.get("/openapi.json", async (ctx) => {
  const spec = await Deno.readTextFile(specPath);
  ctx.response.headers.set("Content-Type", "application/json");
  ctx.response.body = spec;
});

router.get("/docs", (ctx) => {
  ctx.response.headers.set("Content-Type", "text/html");
  ctx.response.body = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Archi-Fighter API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: "/api/v1/openapi.json",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: "BaseLayout",
        deepLinking: true
      });
    </script>
  </body>
</html>`;
});

export default router;
