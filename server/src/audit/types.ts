import type { Flow, SiteReport } from "../judge/types.ts";

export type SiteState = "queued" | "running" | "writing_up" | "done" | "failed" | "cancelled";

export interface SiteStep {
  text: string;
  at: string;
}

export type LogoutResult = "logged_out" | "not_confirmed";

export interface SiteRun {
  id: string;
  url: string;
  host: string;
  signInId: string | null;
  state: SiteState;
  queuePosition: number | null;
  runId: string | null;
  /** The site blocked a run and this one fresh run followed. Saved so a restart adds no third. */
  retried?: boolean;
  streamingUrl: string | null;
  steps: SiteStep[];
  startedAt: string | null;
  finishedAt: string | null;
  report: SiteReport | null;
  error: string | null;
  logout: LogoutResult | null;
}

export interface Audit {
  id: string;
  visitorId: string;
  task: string;
  flow: Flow;
  /** Null for a worldwide audit. Saved audits from before countries have none. */
  country?: string | null;
  createdAt: string;
  status: "running" | "finished";
  shareToken: string | null;
  sites: SiteRun[];
}
