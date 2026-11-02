import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";

import { createApi } from "../server/src/api/routes.ts";
import { createApp } from "../server/src/app.ts";
import { AuditService } from "../server/src/audit/service.ts";
import { SitePlanner } from "../server/src/plan/planner.ts";
import { RunQueue } from "../server/src/runner/queue.ts";
import { SignInService } from "../server/src/signin/service.ts";
import { AuditStore } from "../server/src/store/auditStore.ts";
import { DomainMemory } from "../server/src/store/domainMemory.ts";
import { loadRun } from "../server/src/testing/fixtures.ts";
import type { RunEvent, RunRequest } from "../server/src/tinyfish/client.ts";

/** The real app with TinyFish replaced by saved runs, so the test costs nothing and is repeatable. */
const SAVED_RUNS: Record<string, string> = {
  "adobe.com": "adobe-subscription",
  "linkedin.com": "linkedin-subscription",
};
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const PORT = Number(process.env["E2E_PORT"] ?? 4173);

function savedRun(url: string) {
  const name = SAVED_RUNS[new URL(url).hostname.replace(/^www\./, "")];
  if (!name) throw new Error(`No saved run for ${url}`);
  return loadRun(name);
}

const runsById = new Map(
  Object.values(SAVED_RUNS).map((name) => {
    const run = loadRun(name);
    return [run.run_id, run];
  }),
);

const client = {
  async *streamRun({ url }: RunRequest): AsyncGenerator<RunEvent> {
    const run = savedRun(url);
    yield { type: "started", runId: run.run_id };
    for (const step of run.steps.slice(0, 3)) {
      yield { type: "progress", runId: run.run_id, text: step.action ?? "", at: step.timestamp };
    }
    yield { type: "complete", runId: run.run_id, status: run.status };
  },
  async getRun(runId: string) {
    const run = runsById.get(runId);
    if (!run) throw new Error(`No saved run ${runId}`);
    return run;
  },
  cancelRun: () => Promise.resolve(),
  getStepHtml: () => Promise.resolve(""),
  getScreenshot: () => Promise.resolve(JPEG),
  createProfile: () => Promise.reject(new Error("Sign-in is not part of this test.")),
  deleteProfile: () => Promise.resolve(),
  startSetup: () => Promise.reject(new Error("Sign-in is not part of this test.")),
  saveSetup: () => Promise.resolve(),
  cancelSetup: () => Promise.resolve(),
};

const dataDir = await mkdtemp(join(tmpdir(), "aletheia-e2e-"));
const store = new AuditStore(dataDir);
const domains = new DomainMemory(dataDir);
await Promise.all([store.load(), domains.load()]);

const queue = new RunQueue(2);
const signIns = new SignInService({
  client,
  openScreen: () => Promise.reject(new Error("Sign-in is not part of this test.")),
  runLogout: () => Promise.resolve(true),
  dataDir,
});
const audits = new AuditService({ client, store, domains, queue, signIns });

const webRoot = fileURLToPath(new URL("../web/dist", import.meta.url));
const planner = new SitePlanner(() => Promise.resolve([]));
const api = createApi({ audits, signIns, store, domains, queue, client, planner });
serve({ fetch: createApp({ webRoot, api }).fetch, port: PORT });
