import { randomBytes, randomUUID } from "node:crypto";

import { ApiError } from "../errors.ts";
import { judgeRun } from "../judge/judge.ts";
import type { Flow } from "../judge/types.ts";
import type { DriveClient, DriveOutcome } from "../runner/drive.ts";
import { driveRun, RunStartError } from "../runner/drive.ts";
import type { RunQueue } from "../runner/queue.ts";
import { QueueCancelledError } from "../runner/queue.ts";
import type { AuditStore } from "../store/auditStore.ts";
import type { DomainMemory } from "../store/domainMemory.ts";
import { budgetSeconds, buildGoal, detectFlow } from "./goals.ts";
import { OUTPUT_SCHEMA } from "./outputSchema.ts";
import { scrubPersonal } from "./scrub.ts";
import type { Audit, SiteRun } from "./types.ts";

export type AuditClient = DriveClient;

export interface AuditSignIns {
  claim(visitorId: string, signInId: string): string;
  release(signInId: string): Promise<boolean>;
}

export interface Timing {
  pollMs: number;
  /** How long the agent may stay silent before we say it is writing up. */
  quietMs: number;
  /** How long past its budget a run may go before we cancel it. */
  graceMs: number;
}

export const DEFAULT_TIMING: Timing = { pollMs: 5000, quietMs: 45_000, graceMs: 300_000 };

export interface AuditDeps {
  client: AuditClient;
  store: AuditStore;
  domains: DomainMemory;
  queue: RunQueue;
  signIns: AuditSignIns;
  timing?: Timing;
  now?: () => Date;
}

export interface NewAudit {
  visitorId: string;
  task: string;
  flow?: Flow | undefined;
  sites: { url: string; signInId?: string | undefined }[];
}

type Listener = (audit: Audit) => void;

function missing(): ApiError {
  return new ApiError("not_found", "No audit with that id.");
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

export class AuditService {
  readonly #deps: AuditDeps;
  readonly #timing: Timing;
  readonly #now: () => Date;
  readonly #listeners = new Map<string, Set<Listener>>();
  /** One per site being worked on, keyed by site id. */
  readonly #stops = new Map<string, AbortController>();
  /** Profiles of running checks. Kept out of the audit, so they never reach disk or a browser. */
  readonly #profiles = new Map<string, string>();

  constructor(deps: AuditDeps) {
    this.#deps = deps;
    this.#timing = deps.timing ?? DEFAULT_TIMING;
    this.#now = deps.now ?? (() => new Date());
  }

  async create({ visitorId, task, flow, sites }: NewAudit): Promise<Audit> {
    const id = randomUUID();
    const audit: Audit = {
      id,
      visitorId,
      task,
      flow: flow ?? detectFlow(task),
      createdAt: this.#now().toISOString(),
      status: "running",
      shareToken: null,
      sites: sites.map(({ url, signInId }) => ({
        id: randomUUID(),
        url,
        host: hostOf(url),
        signInId: signInId ?? null,
        state: "queued",
        queuePosition: null,
        runId: null,
        streamingUrl: null,
        steps: [],
        startedAt: null,
        finishedAt: null,
        report: null,
        error: null,
        logout: null,
      })),
    };

    this.#claimSignIns(audit);
    await this.#deps.store.save(audit);
    for (const site of audit.sites) this.#launch(audit, site);
    return audit;
  }

  /** Picks up what a restart left behind. A run with an id goes on at TinyFish without us. */
  async resume(): Promise<void> {
    for (const audit of this.#deps.store.all()) {
      if (audit.status !== "running") continue;
      for (const site of audit.sites.filter((entry) => !this.#isOver(entry))) {
        if (site.signInId) await this.#abandon(audit, site);
        else this.#launch(audit, site);
      }
    }
  }

  /** Claiming first means a bad sign-in fails the request, before any run is paid for. */
  #claimSignIns({ visitorId, sites }: Audit): void {
    const claimed: string[] = [];
    try {
      for (const site of sites) {
        if (!site.signInId) continue;
        this.#profiles.set(site.id, this.#deps.signIns.claim(visitorId, site.signInId));
        claimed.push(site.signInId);
      }
    } catch (error) {
      for (const signInId of claimed) {
        this.#deps.signIns.release(signInId).catch(() => undefined);
      }
      for (const site of sites) this.#profiles.delete(site.id);
      throw error;
    }
  }

  /** Profiles are never saved, so a signed-in check cannot go on past a restart. */
  async #abandon(audit: Audit, site: SiteRun): Promise<void> {
    if (site.runId) await this.#deps.client.cancelRun(site.runId).catch(() => undefined);
    site.state = "failed";
    site.error =
      "The server restarted during this signed-in check. Please sign in and run it again.";
    await this.#finish(audit, site);
  }

  get(visitorId: string, id: string): Audit {
    const audit = this.#deps.store.get(id);
    if (audit?.visitorId !== visitorId) throw missing();
    return audit;
  }

  list(visitorId: string): Audit[] {
    return this.#deps.store
      .all()
      .filter((audit) => audit.visitorId === visitorId)
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  subscribe(visitorId: string, id: string, listener: Listener): () => void {
    this.get(visitorId, id);
    const listeners = this.#listeners.get(id) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(id, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(id);
    };
  }

  async remove(visitorId: string, id: string): Promise<void> {
    const audit = this.get(visitorId, id);
    for (const site of audit.sites) this.#stops.get(site.id)?.abort();
    await this.#deps.store.remove(id);
    this.#listeners.delete(id);
  }

  async stopCheckUsing(signInId: string): Promise<void> {
    for (const audit of this.#deps.store.all()) {
      const site = audit.sites.find((entry) => entry.signInId === signInId);
      if (site) this.#stops.get(site.id)?.abort();
    }
    await Promise.resolve();
  }

  async share(visitorId: string, id: string): Promise<string> {
    const audit = this.get(visitorId, id);
    audit.shareToken ??= randomBytes(24).toString("base64url");
    await this.#deps.store.save(audit);
    return audit.shareToken;
  }

  shared(token: string): Audit {
    const audit = this.#deps.store.all().find((entry) => entry.shareToken === token);
    if (!audit) throw missing();
    return audit;
  }

  #isOver(site: SiteRun): boolean {
    return site.state === "done" || site.state === "failed" || site.state === "cancelled";
  }

  #launch(audit: Audit, site: SiteRun): void {
    const stop = new AbortController();
    this.#stops.set(site.id, stop);

    this.#deps.queue
      .enqueue(
        () => this.#work(audit, site, stop.signal),
        (position) => {
          site.queuePosition = position;
          this.#publish(audit);
        },
        stop.signal,
      )
      .catch((error: unknown) => this.#failed(site, error))
      .then(() => this.#finish(audit, site))
      .catch(() => undefined);
  }

  async #work(audit: Audit, site: SiteRun, signal: AbortSignal): Promise<void> {
    site.queuePosition = null;
    site.state = "running";
    site.startedAt ??= this.#now().toISOString();
    this.#publish(audit);

    const signedIn = site.signInId !== null;
    const budget = budgetSeconds({ task: audit.task, signedIn });
    const profileId = this.#profiles.get(site.id);

    const outcome = await driveRun(
      this.#deps.client,
      {
        url: site.url,
        goal: buildGoal({
          flow: audit.flow,
          task: audit.task,
          url: site.url,
          signedIn,
          today: this.#now(),
        }),
        maxDurationSeconds: budget,
        outputSchema: OUTPUT_SCHEMA,
        profileId,
      },
      {
        onRunId: (runId) => {
          site.runId = runId;
          this.#publish(audit);
          this.#save(audit);
        },
        onLive: (streamingUrl) => {
          if (site.streamingUrl === streamingUrl) return;
          site.streamingUrl = streamingUrl;
          this.#publish(audit);
        },
        onStep: (text, at) => {
          site.state = "running";
          site.steps.push({ text, at });
          this.#publish(audit);
        },
        onQuiet: () => {
          site.state = "writing_up";
          this.#publish(audit);
        },
      },
      {
        hardTimeoutMs: budget * 1000 + this.#timing.graceMs,
        pollMs: this.#timing.pollMs,
        quietMs: this.#timing.quietMs,
        resumeRunId: site.runId,
        signal,
      },
    );

    await this.#judge(audit, site, outcome);
  }

  async #judge(audit: Audit, site: SiteRun, { end, run }: DriveOutcome): Promise<void> {
    if (end === "cancelled") {
      site.state = "cancelled";
      return;
    }
    if (!run) {
      site.state = "failed";
      site.error = "The run could not be read back from TinyFish.";
      return;
    }

    const stopped = end === "timed_out" ? { ...run, status: "CANCELLED" as const } : run;
    const report = judgeRun({
      flow: audit.flow,
      url: site.url,
      run: stopped,
      signedIn: site.signInId !== null,
    });
    site.report = scrubPersonal(report);
    site.steps = scrubPersonal(site.steps);
    site.state = "done";

    if (report.stop.at === "login_wall") await this.#deps.domains.rememberLogin(site.url);
  }

  #failed(site: SiteRun, error: unknown): void {
    if (error instanceof QueueCancelledError) {
      site.state = "cancelled";
      return;
    }
    site.state = "failed";
    site.error =
      error instanceof RunStartError
        ? `The run could not start: ${error.message}`
        : "The run failed unexpectedly.";
  }

  async #finish(audit: Audit, site: SiteRun): Promise<void> {
    this.#stops.delete(site.id);
    site.queuePosition = null;
    site.streamingUrl = null;
    site.finishedAt = this.#now().toISOString();
    this.#publish(audit);

    if (site.signInId) {
      this.#profiles.delete(site.id);
      const loggedOut = await this.#deps.signIns.release(site.signInId).catch(() => false);
      site.logout = loggedOut ? "logged_out" : "not_confirmed";
    }

    if (audit.sites.every((entry) => this.#isOver(entry))) audit.status = "finished";
    this.#publish(audit);
    if (this.#deps.store.get(audit.id)) await this.#deps.store.save(audit);
  }

  #publish(audit: Audit): void {
    for (const listener of this.#listeners.get(audit.id) ?? []) listener(audit);
  }

  #save(audit: Audit): void {
    if (this.#deps.store.get(audit.id)) this.#deps.store.save(audit).catch(() => undefined);
  }
}
