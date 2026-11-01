import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

import type { ApiEnv } from "./api/routes.ts";

export interface AppOptions {
  webRoot: string;
  api?: Hono<ApiEnv>;
}

export function createApp({ webRoot, api }: AppOptions): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ status: "ok" }));
  if (api) app.route("/api", api);
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  app.use("*", serveStatic({ root: webRoot }));
  app.get("/assets/*", (c) => c.notFound());
  app.get("*", serveStatic({ root: webRoot, path: "index.html" }));

  return app;
}
