import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "./app.ts";

describe("createApp", () => {
  let webRoot: string;

  beforeAll(async () => {
    webRoot = await mkdtemp(join(tmpdir(), "aletheia-web-"));
    await mkdir(join(webRoot, "assets"));
    await writeFile(join(webRoot, "index.html"), "<h1>app shell</h1>");
    await writeFile(join(webRoot, "assets", "app.js"), "console.log('bundle')");
  });

  afterAll(async () => {
    await rm(webRoot, { recursive: true, force: true });
  });

  it("reports health on the API", async () => {
    const response = await createApp({ webRoot }).request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("answers unknown API paths with JSON, never the app shell", async () => {
    const response = await createApp({ webRoot }).request("/api/nope");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("serves the built web app at the root", async () => {
    const response = await createApp({ webRoot }).request("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("app shell");
  });

  it("serves built assets", async () => {
    const response = await createApp({ webRoot }).request("/assets/app.js");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("bundle");
  });

  it("answers missing assets with 404, never the app shell", async () => {
    const response = await createApp({ webRoot }).request("/assets/missing.js");

    expect(response.status).toBe(404);
  });

  it("falls back to the app shell for client routes", async () => {
    const response = await createApp({ webRoot }).request("/audits/42");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("app shell");
  });
});
