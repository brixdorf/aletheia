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
  createdAt: string;
  status: "running" | "finished";
  shareToken: string | null;
  sites: SiteRun[];
}
