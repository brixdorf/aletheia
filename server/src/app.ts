import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

export interface AppOptions {
  webRoot: string;
}

export function createApp({ webRoot }: AppOptions): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ status: "ok" }));
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  app.use("*", serveStatic({ root: webRoot }));
  app.get("/assets/*", (c) => c.notFound());
  app.get("*", serveStatic({ root: webRoot, path: "index.html" }));

  return app;
}
