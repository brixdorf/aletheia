import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import type { AuditService } from "../audit/service.ts";
import { ApiError } from "../errors.ts";
import type { RunQueue } from "../runner/queue.ts";
import type { Frame } from "../signin/remoteScreen.ts";
import type { SignInService } from "../signin/service.ts";
import type { AuditStore } from "../store/auditStore.ts";
import type { DomainMemory } from "../store/domainMemory.ts";
import { RateLimiter } from "./rateLimit.ts";
import { ownerView, sharedView, summaryView } from "./views.ts";

const VISITOR_COOKIE = "aletheia_visitor";
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STEP_ID = /^[A-Za-z0-9_-]+$/;
const LOCAL_HOST =
  /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[.*\])$/i;
const KEEP_ALIVE_MS = 20_000;
const HOUR_MS = 60 * 60 * 1000;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface ApiLimits {
  perVisitor: number;
  perAddress: number;
  maxWaiting: number;
}

const DEFAULT_LIMITS: ApiLimits = { perVisitor: 6, perAddress: 60, maxWaiting: 12 };

export interface ApiDeps {
  audits: AuditService;
  signIns: SignInService;
  store: AuditStore;
  domains: DomainMemory;
  queue: RunQueue;
  client: { getScreenshot(runId: string, stepId: string): Promise<Uint8Array> };
  limits?: Partial<ApiLimits>;
}

export interface ApiEnv {
  Variables: { visitorId: string };
}

const siteUrl = z
  .url({ protocol: /^https?$/ })
  .max(2000)
  .refine((url) => !LOCAL_HOST.test(new URL(url).hostname), "Only public sites can be audited");

const newAuditSchema = z.object({
  task: z.string().trim().min(3).max(300),
  flow: z.enum(["checkout", "subscription"]).optional(),
  sites: z
    .array(z.object({ url: siteUrl, signInId: z.uuid().optional() }))
    .min(1)
    .max(4),
});

const signInStartSchema = z.object({ url: siteUrl });

const coordinate = z.number().finite().min(-20_000).max(20_000);

const signInInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("click"), x: coordinate, y: coordinate }),
  z.object({ kind: z.literal("key"), key: z.string().min(1).max(32) }),
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(256) }),
  z.object({ kind: z.literal("scroll"), dx: coordinate, dy: coordinate }),
]);

/** Lets a stream sleep until there is something new, so slow readers only get the latest state. */
class Wakeup {
  #wake: (() => void) | undefined;

  ring(): void {
    this.#wake?.();
  }

  wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.#wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

function clientAddress(c: Context): string {
  // The last hop is the one our own proxy added, and a visitor cannot forge that.
  return c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "direct";
}

async function jsonBody(c: Context): Promise<unknown> {
  return c.req.json().catch(() => {
    throw new ApiError("invalid_request", "The request body is not valid JSON.");
  });
}

function parsed<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError("invalid_request", result.error.issues[0]?.message ?? "Invalid request.");
  }
  return result.data;
}

export function createApi(deps: ApiDeps): Hono<ApiEnv> {
  const { audits, signIns, store, domains, queue, client } = deps;
  const limits = { ...DEFAULT_LIMITS, ...deps.limits };
  const byVisitor = new RateLimiter(limits.perVisitor, HOUR_MS);
  const byAddress = new RateLimiter(limits.perAddress, HOUR_MS);
  const api = new Hono<ApiEnv>();

  function spend(c: Context<ApiEnv>, runs: number): void {
    const visitorId = c.get("visitorId");
    const address = clientAddress(c);
    if (!byVisitor.has(visitorId, runs) || !byAddress.has(address, runs)) {
      throw new ApiError(
        "rate_limited",
        "That is the limit for this hour. Please try again later.",
      );
    }
    byVisitor.take(visitorId, runs);
    byAddress.take(address, runs);
  }

  api.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: error.code, message: error.message }, error.status);
    }
    // Only the name: a message could carry what someone typed into the sign-in panel.
    console.error(`Request failed: ${c.req.method} ${c.req.routePath} ${error.name}`);
    return c.json({ error: "internal", message: "Something went wrong on our side." }, 500);
  });

  api.use("*", async (c, next) => {
    let visitorId = getCookie(c, VISITOR_COOKIE);
    if (!visitorId || !VISITOR_ID.test(visitorId)) {
      visitorId = randomUUID();
      setCookie(c, VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        sameSite: "Lax",
        secure: c.req.header("x-forwarded-proto") === "https",
        path: "/",
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });
    }
    c.set("visitorId", visitorId);
    await next();
  });

  api.get("/audits", (c) => c.json({ audits: audits.list(c.get("visitorId")).map(summaryView) }));

  api.post("/audits", async (c) => {
    const body = parsed(newAuditSchema, await jsonBody(c));
    const visitorId = c.get("visitorId");

    for (const { url, signInId } of body.sites) {
      if (!signInId) continue;
      const { host } = signIns.view(visitorId, signInId);
      if (new URL(url).hostname.replace(/^www\./, "") !== host) {
        throw new ApiError("invalid_request", "That sign-in belongs to a different site.");
      }
    }
    if (queue.waiting >= limits.maxWaiting) {
      throw new ApiError("busy", "Too many audits are waiting. Please try again in a few minutes.");
    }

    spend(c, body.sites.length);
    const audit = await audits.create({ ...body, visitorId });
    return c.json(ownerView(audit), 201);
  });

  api.get("/audits/:id", (c) =>
    c.json(ownerView(audits.get(c.get("visitorId"), c.req.param("id")))),
  );

  api.delete("/audits/:id", async (c) => {
    await audits.remove(c.get("visitorId"), c.req.param("id"));
    return c.body(null, 204);
  });

  api.post("/audits/:id/share", async (c) => {
    const token = await audits.share(c.get("visitorId"), c.req.param("id"));
    return c.json({ token });
  });

  api.get("/audits/:id/events", (c) => {
    const visitorId = c.get("visitorId");
    const id = c.req.param("id");
    const wakeup = new Wakeup();
    let changed = true;
    const unsubscribe = audits.subscribe(visitorId, id, () => {
      changed = true;
      wakeup.ring();
    });

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => wakeup.ring());
      try {
        while (!stream.aborted) {
          if (!changed) {
            await wakeup.wait(KEEP_ALIVE_MS);
            if (!changed) await stream.write(": keep-alive\n\n");
            continue;
          }
          changed = false;
          const audit = audits.get(visitorId, id);
          await stream.writeSSE({ event: "audit", data: JSON.stringify(ownerView(audit)) });
          if (audit.status === "finished") return;
        }
      } catch (error) {
        // The audit was deleted while someone was watching, which just ends the stream.
        if (!(error instanceof ApiError)) throw error;
      } finally {
        unsubscribe();
      }
    });
  });

  async function screenshot(c: Context<ApiEnv>, auditId: string, runId: string | null) {
    const stepId = c.req.param("stepId") ?? "";
    if (!STEP_ID.test(stepId)) throw new ApiError("invalid_request", "That is not a step id.");
    if (!runId) throw new ApiError("not_found", "This site has no run.");

    let image = await store.readScreenshot(auditId, stepId);
    if (!image) {
      image = await client.getScreenshot(runId, stepId).catch(() => {
        throw new ApiError("not_found", "That screenshot is not available.");
      });
      await store.saveScreenshot(auditId, stepId, image);
    }
    return c.body(Uint8Array.from(image), 200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    });
  }

  api.get("/audits/:id/sites/:siteId/steps/:stepId/screenshot", (c) => {
    const audit = audits.get(c.get("visitorId"), c.req.param("id"));
    const site = audit.sites.find((entry) => entry.id === c.req.param("siteId"));
    return screenshot(c, audit.id, site?.runId ?? null);
  });

  api.get("/shared/:token", (c) => c.json(sharedView(audits.shared(c.req.param("token")))));

  api.get("/shared/:token/sites/:siteId/steps/:stepId/screenshot", (c) => {
    const audit = audits.shared(c.req.param("token"));
    const site = audit.sites.find((entry) => entry.id === c.req.param("siteId"));
    return screenshot(c, audit.id, site?.runId ?? null);
  });

  api.get("/signin/hint", (c) => {
    const url = parsed(siteUrl, c.req.query("url"));
    return c.json({ loginNeeded: domains.needsLogin(url) });
  });

  api.post("/signin", async (c) => {
    const { url } = parsed(signInStartSchema, await jsonBody(c));
    spend(c, 1);
    return c.json(await signIns.start(c.get("visitorId"), url), 201);
  });

  api.get("/signin/:id", (c) => c.json(signIns.view(c.get("visitorId"), c.req.param("id"))));

  api.delete("/signin/:id", async (c) => {
    await signIns.signOut(c.get("visitorId"), c.req.param("id"));
    return c.body(null, 204);
  });

  api.post("/signin/:id/done", async (c) =>
    c.json(await signIns.done(c.get("visitorId"), c.req.param("id"))),
  );

  api.post("/signin/:id/input", async (c) => {
    const input = parsed(signInInputSchema, await jsonBody(c));
    await signIns.input(c.get("visitorId"), c.req.param("id"), input);
    return c.body(null, 204);
  });

  api.get("/signin/:id/screen", (c) => {
    const visitorId = c.get("visitorId");
    const id = c.req.param("id");
    const wakeup = new Wakeup();
    let frame: Frame | null = null;
    const unwatch = signIns.watch(visitorId, id, (next) => {
      frame = next;
      wakeup.ring();
    });

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => wakeup.ring());
      try {
        while (!stream.aborted) {
          const latest: Frame | null = frame;
          frame = null;
          if (latest) {
            await stream.writeSSE({ event: "frame", data: JSON.stringify(latest) });
            continue;
          }
          await wakeup.wait(KEEP_ALIVE_MS);
          signIns.view(visitorId, id);
          if (!frame) await stream.write(": keep-alive\n\n");
        }
      } catch (error) {
        // The sign-in ended, which just ends the stream.
        if (!(error instanceof ApiError)) throw error;
      } finally {
        unwatch();
      }
    });
  });

  return api;
}
