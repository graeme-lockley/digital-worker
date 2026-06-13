import path from "node:path";
import { fileURLToPath } from "node:url";

import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function registerStaticRoutes(app: Hono): void {
  const publicDir = path.resolve(moduleDir, "../public");

  app.use(
    "/styles.css",
    serveStatic({ root: publicDir, path: "styles.css" }),
  );
  app.use("/app.js", serveStatic({ root: publicDir, path: "app.js" }));
  app.get("/", serveStatic({ root: publicDir, path: "index.html" }));
}
