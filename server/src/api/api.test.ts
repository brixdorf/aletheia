import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AuditService } from "../audit/service.ts";
import { RunQueue } from "../runner/queue.ts";
import type { Frame, RemoteScreen } from "../signin/remoteScreen.ts";
import { SignInService } from "../signin/service.ts";
import { AuditStore } from "../store/auditStore.ts";
import { DomainMemory } from "../store/domainMemory.ts";
import { loadRun } from "../testing/fixtures.ts";
import type { RunEvent } from "../tinyfish/client.ts";
import type { RunRecord } from "../tinyfish/types.ts";
import type { ApiLimits } from "./routes.ts";
import { createApi } from "./routes.ts";

const SECRET = "tf-secret-key";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff]);

function fakeScreen() {
  let listener: ((frame: Frame) => void) | undefined;
  return {
    onFrame: (fn: (frame: Frame) => void) => {
      listener = fn;
      return () => undefined;
    },
    emit: (frame: Frame) => listener?.(frame),
    click: vi.fn(() => Promise.resolve()),
    press: vi.fn(() => Promise.resolve()),
    type: vi.fn(() => Promise.resolve()),
    scroll: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  } satisfies RemoteScreen & { emit: (frame: Frame) => void };
}

describe("api", () => {
  let dataDir: string;
  let api: ReturnType<typeof createApi>;
  let run: RunRecord;
  let getScreenshot: ReturnType<typeof vi.fn<() => Promise<Uint8Array>>>;
  let screen: ReturnType<typeof fakeScreen>;
  let domains: DomainMemory;
  let limits: Partial<ApiLimits>;

  function build() {
    const client = {
      streamRun: async function* (): AsyncGenerator<RunEvent> {
        yield { type: "started", runId: run.run_id };
        yield { type: "live", runId: run.run_id, streamingUrl: "https://live.test/1" };
        yield { type: "complete", runId: run.run_id, status: run.status };
      },
      getRun: () => Promise.resolve(run),
      cancelRun: () => Promise.resolve(),
      getScreenshot,
      createProfile: () => Promise.resolve("prof_1"),
      deleteProfile: () => Promise.resolve(),
      startSetup: () =>
        Promise.resolve({
          sessionId: "sess_1",
          cdpUrl: "wss://cdp.test",
          expiresAt: "2099-01-01T00:00:00.000Z",
        }),
      saveSetup: () => Promise.resolve(),
      cancelSetup: () => Promise.resolve(),
    };
    return { client };
  }

  async function setup() {
    const { client } = build();
    const store = new AuditStore(dataDir);
    domains = new DomainMemory(dataDir);
    await store.load();
    await domains.load();
    const queue = new RunQueue(2);
    const signIns = new SignInService({
      client,
      openScreen: () => Promise.resolve(screen),
      runLogout: () => Promise.resolve(true),
      dataDir,
    });
    const audits = new AuditService({
      client,
      store,
      domains,
      queue,
      signIns,
      timing: { pollMs: 1, quietMs: 10_000, graceMs: 5000 },
    });
    api = createApi({ audits, signIns, store, domains, queue, client, limits });
  }

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "aletheia-api-"));
    run = loadRun("blinkit-2");
    getScreenshot = vi.fn(() => Promise.resolve(JPEG));
    screen = fakeScreen();
    limits = {};
    await setup();
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  function visitor(name: string) {
    let cookie = `aletheia_visitor=${name}`;
    return async (path: string, init: RequestInit = {}) => {
      const response = await api.request(path, {
        ...init,
        headers: {
          cookie,
          "content-type": "application/json",
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      const set = response.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0] ?? cookie;
      return response;
    };
  }

  const alice = () => visitor("00000000-0000-4000-8000-00000000000a");
  const task = { task: "buy one packet of milk", sites: [{ url: "https://shop.test/" }] };

  function post(body: unknown): RequestInit {
    return { method: "POST", body: JSON.stringify(body) };
  }

  async function createAudit(as: ReturnType<typeof visitor>): Promise<string> {
    const response = await as("/audits", post(task));
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    await finished(as, id);
    return id;
  }

  async function finished(as: ReturnType<typeof visitor>, id: string): Promise<void> {
    await vi.waitFor(async () => {
      const audit = (await (await as(`/audits/${id}`)).json()) as { status: string };
      expect(audit.status).toBe("finished");
    });
  }

  it("gives a new browser a visitor cookie that scripts cannot read", async () => {
    const response = await api.request("/audits");

    expect(response.headers.get("set-cookie")).toMatch(
      /aletheia_visitor=.+HttpOnly.+SameSite=Lax/i,
    );
  });

  it("marks the cookie secure behind https", async () => {
    const response = await api.request("/audits", {
      headers: { "x-forwarded-proto": "https" },
    });

    expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("replaces a forged visitor cookie", async () => {
    const response = await api.request("/audits", { headers: { cookie: "aletheia_visitor=me" } });

    expect(response.headers.get("set-cookie")).toMatch(/aletheia_visitor=/);
  });

  it("creates an audit and returns its report", async () => {
    const as = alice();
    const id = await createAudit(as);

    const audit = (await (await as(`/audits/${id}`)).json()) as {
      visitorId?: string;
      sites: { report: { bill: { total: number } } }[];
    };

    expect(audit.sites[0]?.report.bill.total).toBe(81);
    expect(audit).not.toHaveProperty("visitorId");
  });

  it("lists past audits in short form", async () => {
    const as = alice();
    await createAudit(as);

    const list = (await (await as("/audits")).json()) as {
      audits: { sites: { host: string; found: number; total: number }[] }[];
    };

    expect(list.audits[0]?.sites[0]).toMatchObject({ host: "shop.test", found: 1, total: 81 });
  });

  it("deletes an audit", async () => {
    const as = alice();
    const id = await createAudit(as);

    expect((await as(`/audits/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await as(`/audits/${id}`)).status).toBe(404);
  });

  it("hides one visitor's audits from another", async () => {
    const id = await createAudit(alice());
    const bob = visitor("00000000-0000-4000-8000-00000000000b");

    expect((await bob(`/audits/${id}`)).status).toBe(404);
    expect((await bob(`/audits/${id}`, { method: "DELETE" })).status).toBe(404);
    expect((await bob(`/audits/${id}/events`)).status).toBe(404);
  });

  it.each([
    ["no task", { sites: [{ url: "https://shop.test/" }] }],
    ["no sites", { task: "buy milk", sites: [] }],
    ["too many sites", { task: "buy milk", sites: Array(5).fill({ url: "https://a.test/" }) }],
    ["a non-web url", { task: "buy milk", sites: [{ url: "file:///etc/passwd" }] }],
    ["a local url", { task: "buy milk", sites: [{ url: "http://localhost:3000/" }] }],
    ["a private address", { task: "buy milk", sites: [{ url: "http://192.168.1.1/" }] }],
    ["an unknown flow", { task: "buy milk", flow: "x", sites: [{ url: "https://a.test/" }] }],
  ])("rejects %s", async (_name, body) => {
    expect((await alice()("/audits", post(body))).status).toBe(400);
  });

  it("limits how many sites one visitor can run", async () => {
    limits = { perVisitor: 2 };
    await setup();
    const as = alice();

    await createAudit(as);
    await createAudit(as);
    const refused = await as("/audits", post(task));

    expect(refused.status).toBe(429);
    expect(((await refused.json()) as { error: string }).error).toBe("rate_limited");
  });

  it("limits a network that keeps clearing its cookie", async () => {
    limits = { perAddress: 1 };
    await setup();
    const from = { "x-forwarded-for": "1.2.3.4" };

    const first = alice();
    const { id } = (await (await first("/audits", { ...post(task), headers: from })).json()) as {
      id: string;
    };
    const second = visitor("00000000-0000-4000-8000-00000000000b");
    const refused = await second("/audits", { ...post(task), headers: from });

    expect(refused.status).toBe(429);
    await finished(first, id);
  });

  it("streams the current state first, then ends when the audit is finished", async () => {
    const as = alice();
    const id = await createAudit(as);

    const response = await as(`/audits/${id}/events`);
    const text = await response.text();

    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(text).toContain("event: audit");
    expect(text).toContain('"status":"finished"');
  });

  it("includes a comparison once sites have reports", async () => {
    const as = alice();
    const response = await as(
      "/audits",
      post({
        task: "buy milk",
        sites: [{ url: "https://a.test/" }, { url: "https://b.test/" }],
      }),
    );
    const { id } = (await response.json()) as { id: string };

    await vi.waitFor(async () => {
      const audit = (await (await as(`/audits/${id}`)).json()) as {
        comparison: { rows: unknown[] } | null;
      };
      expect(audit.comparison?.rows).toHaveLength(2);
    });
    await finished(as, id);
  });

  describe("screenshots", () => {
    async function shotPath(as: ReturnType<typeof visitor>, id: string) {
      const audit = (await (await as(`/audits/${id}`)).json()) as {
        sites: {
          id: string;
          report: { patterns: { id: string; screenshot: { stepId: string } | null }[] };
        }[];
      };
      const site = audit.sites[0];
      const stepId = site?.report.patterns.find((entry) => entry.screenshot)?.screenshot?.stepId;
      return `/audits/${id}/sites/${site?.id}/steps/${stepId}/screenshot`;
    }

    it("proxies the image, so the key stays on the server, and keeps a copy", async () => {
      const as = alice();
      const path = await shotPath(as, await createAudit(as));

      const first = await as(path);
      const second = await as(path);

      expect(first.headers.get("content-type")).toBe("image/jpeg");
      expect(new Uint8Array(await first.arrayBuffer())).toEqual(JPEG);
      expect(new Uint8Array(await second.arrayBuffer())).toEqual(JPEG);
      expect(getScreenshot).toHaveBeenCalledOnce();
      expect(JSON.stringify([...first.headers])).not.toContain(SECRET);
    });

    it("keeps them from other visitors", async () => {
      const as = alice();
      const path = await shotPath(as, await createAudit(as));

      expect((await visitor("00000000-0000-4000-8000-00000000000b")(path)).status).toBe(404);
    });

    it("refuses a step id that could walk out of the folder", async () => {
      const as = alice();
      const id = await createAudit(as);
      const audit = (await (await as(`/audits/${id}`)).json()) as { sites: { id: string }[] };
      const site = audit.sites[0]?.id;

      const response = await as(`/audits/${id}/sites/${site}/steps/..%2F..%2Faudit/screenshot`);

      expect(response.status).toBe(400);
    });
  });

  describe("sharing", () => {
    it("opens a read-only copy with no visitor or sign-in details", async () => {
      const as = alice();
      const id = await createAudit(as);
      const { token } = (await (await as(`/audits/${id}/share`, { method: "POST" })).json()) as {
        token: string;
      };

      const response = await api.request(`/shared/${token}`);
      const audit = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(audit).not.toHaveProperty("visitorId");
      expect(audit).not.toHaveProperty("shareToken");
    });

    it("answers 404 for an unknown token", async () => {
      expect((await api.request("/shared/nope")).status).toBe(404);
    });
  });

  describe("sign-in", () => {
    async function startSignIn(as: ReturnType<typeof visitor>) {
      const response = await as("/signin", post({ url: "https://shop.test/" }));
      expect(response.status).toBe(201);
      return (await response.json()) as { id: string; state: string; expiresAt: string };
    }

    it("offers sign-in up front on a site that needed one", async () => {
      const as = alice();
      await createAudit(as);

      const known = await as("/signin/hint?url=https%3A%2F%2Fshop.test%2Fcart");
      const unknown = await as("/signin/hint?url=https%3A%2F%2Fother.test%2F");

      expect(await known.json()).toEqual({ loginNeeded: true });
      expect(await unknown.json()).toEqual({ loginNeeded: false });
    });

    it("starts a session and shows its time limit", async () => {
      const signIn = await startSignIn(alice());

      expect(signIn.state).toBe("setting_up");
      expect(signIn.expiresAt).toBeTruthy();
    });

    it("relays input and validates it", async () => {
      const as = alice();
      const { id } = await startSignIn(as);

      const typed = await as(`/signin/${id}/input`, post({ kind: "text", text: "98765" }));
      const bad = await as(`/signin/${id}/input`, post({ kind: "explode" }));

      expect(typed.status).toBe(204);
      expect(screen.type).toHaveBeenCalledWith("98765");
      expect(bad.status).toBe(400);
    });

    it("sends screen frames as events", async () => {
      const as = alice();
      const { id } = await startSignIn(as);

      const response = await as(`/signin/${id}/screen`);
      const reader = response.body?.getReader();
      screen.emit({ data: "abc", width: 1280, height: 720 });
      const { value } = (await reader?.read()) ?? {};
      await reader?.cancel();

      expect(new TextDecoder().decode(value)).toContain("abc");
    });

    it("runs a signed-in check after Done", async () => {
      run = loadRun("zomato-signed-in-2");
      const as = alice();
      const { id: signInId } = await startSignIn(as);
      await as(`/signin/${signInId}/done`, { method: "POST" });

      const response = await as(
        "/audits",
        post({ task: "buy a biryani", sites: [{ url: "https://shop.test/", signInId }] }),
      );

      expect(response.status).toBe(201);
      await finished(as, ((await response.json()) as { id: string }).id);
    });

    it("refuses a check before sign-in is done, and on a different site", async () => {
      const as = alice();
      const { id: signInId } = await startSignIn(as);

      const early = await as(
        "/audits",
        post({ task: "buy milk", sites: [{ url: "https://shop.test/", signInId }] }),
      );
      await as(`/signin/${signInId}/done`, { method: "POST" });
      const elsewhere = await as(
        "/audits",
        post({ task: "buy milk", sites: [{ url: "https://other.test/", signInId }] }),
      );

      expect(early.status).toBe(409);
      expect(elsewhere.status).toBe(400);
    });

    it("signs out at any time", async () => {
      const as = alice();
      const { id } = await startSignIn(as);

      expect((await as(`/signin/${id}`, { method: "DELETE" })).status).toBe(204);
      expect((await as(`/signin/${id}`)).status).toBe(404);
    });
  });
});
