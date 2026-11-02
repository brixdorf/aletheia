import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { RunQueue } from "../runner/queue.ts";
import { AuditStore } from "../store/auditStore.ts";
import { DomainMemory } from "../store/domainMemory.ts";
import { loadRun } from "../testing/fixtures.ts";
import type { RunEvent, RunRequest } from "../tinyfish/client.ts";
import type { RunRecord } from "../tinyfish/types.ts";
import type { AuditClient, AuditSignIns } from "./service.ts";
import { AuditService } from "./service.ts";
import type { Audit } from "./types.ts";

const SITE = "https://shop.test/";
const timing = { pollMs: 1, quietMs: 10_000, graceMs: 5000 };

function clientFor(run: RunRecord, overrides: Partial<AuditClient> = {}): AuditClient {
  return {
    streamRun: async function* (): AsyncGenerator<RunEvent> {
      yield { type: "started", runId: run.run_id };
      yield { type: "live", runId: run.run_id, streamingUrl: "https://live.test/1" };
      yield { type: "progress", runId: run.run_id, text: "Open the cart", at: "t1" };
      yield { type: "complete", runId: run.run_id, status: run.status };
    },
    getRun: () => Promise.resolve(run),
    cancelRun: () => Promise.resolve(),
    getStepHtml: () => Promise.resolve(""),
    ...overrides,
  };
}

describe("AuditService", () => {
  let dataDir: string;
  let store: AuditStore;
  let domains: DomainMemory;

  function service(client: AuditClient, signIns?: AuditSignIns, limit = 2) {
    return new AuditService({
      client,
      store,
      domains,
      queue: new RunQueue(limit),
      signIns: signIns ?? {
        claim: () => "prof_1",
        release: () => Promise.resolve(true),
      },
      timing,
      now: () => new Date("2026-11-01T06:30:00Z"),
    });
  }

  async function finished(audits: AuditService, id: string, visitor = "visitor"): Promise<Audit> {
    await vi.waitFor(() => {
      expect(audits.get(visitor, id).status).toBe("finished");
    });
    return audits.get(visitor, id);
  }

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "aletheia-audit-"));
    store = new AuditStore(dataDir);
    domains = new DomainMemory(dataDir);
    await store.load();
    await domains.load();
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("walks a site to a judged report", async () => {
    const audits = service(clientFor(loadRun("blinkit-2")));

    const created = await audits.create({
      visitorId: "visitor",
      task: "buy one packet of milk",
      sites: [{ url: SITE }],
    });
    const audit = await finished(audits, created.id);
    const [site] = audit.sites;

    expect(audit.flow).toBe("checkout");
    expect(site?.state).toBe("done");
    expect(site?.steps.map((step) => step.text)).toContain("Open the cart");
    expect(site?.report?.bill.total).toBe(81);
    expect(site?.report?.host).toBe("shop.test");
  });

  it("browses from the audit's country and keeps it on the audit", async () => {
    const client = clientFor(loadRun("blinkit-2"));
    const streamRun = vi.fn((request: RunRequest) => client.streamRun(request));
    const audits = service({ ...client, streamRun });

    const created = await audits.create({
      visitorId: "visitor",
      task: "buy one packet of milk",
      country: "GB",
      sites: [{ url: SITE }],
    });
    const audit = await finished(audits, created.id);

    expect(audit.country).toBe("GB");
    const [request] = streamRun.mock.calls[0] as unknown as [RunRequest];
    expect(request.proxyCountry).toBe("GB");
    expect(request.goal).toContain("SW1A 1AA");
    expect(audit.sites[0]?.report?.missing.join(" ")).not.toMatch(/browse from/);
  });

  it("says so in the report when TinyFish cannot browse from the country", async () => {
    const client = clientFor(loadRun("blinkit-2"));
    const streamRun = vi.fn((request: RunRequest) => client.streamRun(request));
    const audits = service({ ...client, streamRun });

    const created = await audits.create({
      visitorId: "visitor",
      task: "buy one packet of milk",
      country: "BR",
      sites: [{ url: SITE }],
    });
    const audit = await finished(audits, created.id);

    const [request] = streamRun.mock.calls[0] as unknown as [RunRequest];
    expect(request.proxyCountry).toBeNull();
    expect(audit.sites[0]?.report?.missing).toContain(
      "TinyFish cannot browse from Brazil, so this run came from another country and prices may differ.",
    );
  });

  it("checks agent quotes against the page text captured in the run", async () => {
    const run = loadRun("adobe-subscription");
    run.steps[0] = { ...(run.steps[0] as RunRecord["steps"][number]), html: "url" };
    const getStepHtml = vi.fn(() =>
      Promise.resolve(
        "<p>Fee applies of half your remaining annual commitment if you cancel after Nov 14</p>",
      ),
    );
    const audits = service(clientFor(run, { getStepHtml }));

    const { id } = await audits.create({
      visitorId: "visitor",
      task: "subscribe to the plan",
      sites: [{ url: SITE }],
    });
    const audit = await finished(audits, id);
    const trap = audit.sites[0]?.report?.patterns.find((entry) => entry.id === "subscription_trap");

    expect(getStepHtml).toHaveBeenCalledOnce();
    expect(trap?.quoteCheck).toBe("matched");
    expect(JSON.stringify(audit)).not.toContain("<p>");
  });

  it("still reports when the page text cannot be fetched", async () => {
    const run = loadRun("adobe-subscription");
    run.steps[0] = { ...(run.steps[0] as RunRecord["steps"][number]), html: "url" };
    const audits = service(
      clientFor(run, { getStepHtml: () => Promise.reject(new Error("gone")) }),
    );

    const { id } = await audits.create({
      visitorId: "visitor",
      task: "subscribe to the plan",
      sites: [{ url: SITE }],
    });
    const audit = await finished(audits, id);
    const trap = audit.sites[0]?.report?.patterns.find((entry) => entry.id === "subscription_trap");

    expect(trap?.status).toBe("found");
    expect(trap?.quoteCheck).toBe("unavailable");
  });

  it("runs one agent per site, each told to stay on its site", async () => {
    const goals: RunRequest[] = [];
    const run = loadRun("blinkit-2");
    const base = clientFor(run);
    const audits = service({
      ...base,
      streamRun(request, signal) {
        goals.push(request);
        return base.streamRun(request, signal);
      },
    });

    const created = await audits.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: "https://a.test/" }, { url: "https://b.test/" }],
    });
    await finished(audits, created.id);

    expect(goals.map((request) => request.url)).toEqual(["https://a.test/", "https://b.test/"]);
    expect(goals[0]?.goal).toContain("Work only on https://a.test/");
    expect(goals[1]?.goal).toContain("Work only on https://b.test/");
  });

  it("gives guests 300 seconds", async () => {
    const seen: RunRequest[] = [];
    const base = clientFor(loadRun("blinkit-2"));
    const audits = service({
      ...base,
      streamRun(request, signal) {
        seen.push(request);
        return base.streamRun(request, signal);
      },
    });

    const { id } = await audits.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: SITE }],
    });
    await finished(audits, id);

    expect(seen[0]?.maxDurationSeconds).toBe(300);
    expect(seen[0]?.profileId).toBeUndefined();
  });

  it("drops the live browser link once a run ends", async () => {
    const audits = service(clientFor(loadRun("blinkit-2")));

    const { id } = await audits.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: SITE }],
    });
    const audit = await finished(audits, id);

    expect(audit.sites[0]?.streamingUrl).toBeNull();
  });

  it("publishes each change, ending with the finished audit", async () => {
    const audits = service(clientFor(loadRun("blinkit-2")));
    const seen: string[] = [];

    const { id } = await audits.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: SITE }],
    });
    audits.subscribe("visitor", id, (audit) => seen.push(audit.status));
    await finished(audits, id);

    expect(seen.at(-1)).toBe("finished");
  });

  it("remembers that a domain needed a login", async () => {
    const audits = service(clientFor(loadRun("blinkit-2")));

    const { id } = await audits.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: "https://www.shop.test/" }],
    });
    await finished(audits, id);

    expect(domains.needsLogin("https://shop.test/cart")).toBe(true);
    expect(domains.needsLogin("https://other.test/")).toBe(false);
  });

  it("saves no phone number or email the agent wrote down", async () => {
    const run = loadRun("blinkit-2");
    if (run.result) run.result["stop_note"] = "Deliver to 9876543210, mail me@example.com";
    const audits = service(clientFor(run));

    const { id } = await audits.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: SITE }],
    });
    const audit = await finished(audits, id);

    expect(JSON.stringify(audit)).not.toMatch(/9876543210|me@example/);
  });

  it("reports a site that never started, and still finishes the audit", async () => {
    const audits = service(
      clientFor(loadRun("blinkit-2"), {
        // eslint-disable-next-line require-yield
        streamRun: async function* () {
          throw new Error("Insufficient credits");
        },
      }),
    );

    const { id } = await audits.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: SITE }],
    });
    const audit = await finished(audits, id);

    expect(audit.sites[0]?.state).toBe("failed");
    expect(audit.sites[0]?.error).toMatch(/could not start/i);
  });

  it("reports a run over its hard limit as incomplete and says what is missing", async () => {
    const running = { ...loadRun("blinkit-2"), status: "RUNNING" as const, result: null };
    const audits = new AuditService({
      client: clientFor(running, {
        streamRun: async function* () {
          yield { type: "started", runId: "run-1" };
        },
      }),
      store,
      domains,
      queue: new RunQueue(2),
      signIns: { claim: () => "prof_1", release: () => Promise.resolve(true) },
      timing: { ...timing, graceMs: -299_950 },
      now: () => new Date(),
    });

    const { id } = await audits.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: SITE }],
    });
    const audit = await finished(audits, id);
    const report = audit.sites[0]?.report;

    expect(audit.sites[0]?.state).toBe("done");
    expect(report?.stop.at).toBe("incomplete");
    expect(report?.missing.join(" ")).toMatch(/time limit/i);
  });

  describe("signed-in checks", () => {
    function signIns() {
      return {
        claim: vi.fn(() => "prof_1"),
        release: vi.fn(() => Promise.resolve(true)),
      } satisfies AuditSignIns;
    }

    it("runs with the profile, a longer budget, then logs out and deletes", async () => {
      const seen: RunRequest[] = [];
      const base = clientFor(loadRun("zomato-signed-in-2"));
      const session = signIns();
      const audits = service(
        {
          ...base,
          streamRun(request, signal) {
            seen.push(request);
            return base.streamRun(request, signal);
          },
        },
        session,
      );

      const { id } = await audits.create({
        visitorId: "visitor",
        task: "buy one biryani",
        sites: [{ url: SITE, signInId: "signin-1" }],
      });
      const audit = await finished(audits, id);

      expect(session.claim).toHaveBeenCalledWith("visitor", "signin-1");
      expect(seen[0]?.profileId).toBe("prof_1");
      expect(seen[0]?.maxDurationSeconds).toBe(450);
      expect(seen[0]?.goal).toMatch(/stop on the payment-method page/i);
      expect(session.release).toHaveBeenCalledWith("signin-1");
      expect(audit.sites[0]?.report?.signedIn).toBe(true);
      expect(audit.sites[0]?.logout).toBe("logged_out");
    });

    it("still logs out when the run fails", async () => {
      const session = signIns();
      const audits = service(
        clientFor(loadRun("blinkit-2"), {
          // eslint-disable-next-line require-yield
          streamRun: async function* () {
            throw new Error("boom");
          },
        }),
        session,
      );

      const { id } = await audits.create({
        visitorId: "visitor",
        task: "buy milk",
        sites: [{ url: SITE, signInId: "signin-1" }],
      });
      await finished(audits, id);

      expect(session.release).toHaveBeenCalledWith("signin-1");
    });

    it("says so when the logout could not be confirmed", async () => {
      const session = signIns();
      session.release.mockResolvedValueOnce(false);
      const audits = service(clientFor(loadRun("zomato-signed-in-2")), session);

      const { id } = await audits.create({
        visitorId: "visitor",
        task: "buy milk",
        sites: [{ url: SITE, signInId: "signin-1" }],
      });
      const audit = await finished(audits, id);

      expect(audit.sites[0]?.logout).toBe("not_confirmed");
    });

    it("stops the running check when the visitor signs out", async () => {
      const running = { ...loadRun("blinkit-2"), status: "RUNNING" as const, result: null };
      const cancelRun = vi.fn(() => Promise.resolve());
      const session = signIns();
      const audits = service(
        clientFor(running, {
          cancelRun,
          streamRun: async function* () {
            yield { type: "started", runId: "run-1" };
          },
        }),
        session,
      );

      const { id } = await audits.create({
        visitorId: "visitor",
        task: "buy milk",
        sites: [{ url: SITE, signInId: "signin-1" }],
      });
      await vi.waitFor(() => {
        expect(audits.get("visitor", id).sites[0]?.runId).toBe("run-1");
      });
      await audits.stopCheckUsing("signin-1");
      await finished(audits, id);

      expect(cancelRun).toHaveBeenCalledWith("run-1");
      expect(session.release).toHaveBeenCalledOnce();
    });
  });

  it("hands back claimed sign-ins when a later one cannot be claimed", async () => {
    const session = {
      claim: vi.fn((_visitor: string, id: string) => {
        if (id === "bad") throw new Error("not ready");
        return "prof_1";
      }),
      release: vi.fn(() => Promise.resolve(true)),
    };
    const audits = service(clientFor(loadRun("blinkit-2")), session);

    await expect(
      audits.create({
        visitorId: "visitor",
        task: "buy milk",
        sites: [
          { url: "https://a.test/", signInId: "good" },
          { url: "https://b.test/", signInId: "bad" },
        ],
      }),
    ).rejects.toThrow("not ready");

    expect(session.release).toHaveBeenCalledWith("good");
    expect(audits.list("visitor")).toEqual([]);
  });

  it("ends a signed-in check cut off by a restart, since its profile is gone", async () => {
    const cancelRun = vi.fn(() => Promise.resolve());
    const base = clientFor(loadRun("blinkit-2"));
    const streamRun = vi.fn(base.streamRun.bind(base));
    const client = clientFor(loadRun("blinkit-2"), { cancelRun, streamRun });
    const first = service(client);
    const { id } = await first.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: SITE, signInId: "signin-1" }],
    });
    await finished(first, id);

    const interrupted = first.get("visitor", id);
    const [site] = interrupted.sites;
    if (site) {
      site.state = "running";
      site.report = null;
      site.runId = "run-1";
    }
    interrupted.status = "running";
    await store.save(interrupted);
    streamRun.mockClear();

    const restarted = service(client);
    await restarted.resume();
    const audit = await finished(restarted, id);

    expect(cancelRun).toHaveBeenCalledWith("run-1");
    expect(streamRun).not.toHaveBeenCalled();
    expect(audit.sites[0]?.state).toBe("failed");
    expect(audit.sites[0]?.error).toMatch(/restart/i);
  });

  it("keeps audits to their owner", async () => {
    const audits = service(clientFor(loadRun("blinkit-2")));

    const { id } = await audits.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: SITE }],
    });
    await finished(audits, id);

    expect(() => audits.get("stranger", id)).toThrow(/not found|no audit/i);
    expect(audits.list("stranger")).toEqual([]);
    expect(audits.list("visitor")).toHaveLength(1);
  });

  it("deletes an audit, cancelling its run, and it stays deleted", async () => {
    const running = { ...loadRun("blinkit-2"), status: "RUNNING" as const, result: null };
    const cancelRun = vi.fn(() => Promise.resolve());
    const audits = service(
      clientFor(running, {
        cancelRun,
        streamRun: async function* () {
          yield { type: "started", runId: "run-1" };
        },
      }),
    );

    const { id } = await audits.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: SITE }],
    });
    await vi.waitFor(() => {
      expect(audits.get("visitor", id).sites[0]?.runId).toBe("run-1");
    });

    await audits.remove("visitor", id);
    await vi.waitFor(() => {
      expect(cancelRun).toHaveBeenCalledWith("run-1");
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(audits.list("visitor")).toEqual([]);
    const reloaded = new AuditStore(dataDir);
    await reloaded.load();
    expect(reloaded.get(id)).toBeNull();
  });

  it("follows a run again after a restart instead of starting a new one", async () => {
    const run = loadRun("blinkit-2");
    const base = clientFor(run);
    const streamRun = vi.fn(base.streamRun.bind(base));
    const client = clientFor(run, { streamRun });
    const first = service(client);
    const { id } = await first.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: SITE }],
    });
    await finished(first, id);

    const interrupted = first.get("visitor", id);
    const [site] = interrupted.sites;
    if (site) {
      site.state = "running";
      site.report = null;
      site.runId = "run-1";
    }
    interrupted.status = "running";
    await store.save(interrupted);
    streamRun.mockClear();

    const restarted = service(client);
    await restarted.resume();
    const audit = await finished(restarted, id);

    expect(streamRun).not.toHaveBeenCalled();
    expect(audit.sites[0]?.report?.bill.total).toBe(81);
  });

  it("shares a finished audit by a token nobody can guess", async () => {
    const audits = service(clientFor(loadRun("blinkit-2")));
    const { id } = await audits.create({
      visitorId: "visitor",
      task: "buy milk",
      sites: [{ url: SITE }],
    });
    await finished(audits, id);

    const token = await audits.share("visitor", id);

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(audits.shared(token).id).toBe(id);
  });
});
