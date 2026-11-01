import type { AuditPublic, SiteView } from "./types.ts";

export type SiteTone = "waiting" | "live" | "stopped" | "done";

export interface SiteStatus {
  label: string;
  tone: SiteTone;
}

export function siteStatus({
  state,
  queuePosition,
  error,
}: Pick<SiteView, "state" | "queuePosition" | "error">): SiteStatus {
  switch (state) {
    case "queued":
      return {
        label:
          queuePosition === null
            ? "Waiting for a free agent"
            : `Waiting for a free agent, number ${queuePosition} in line`,
        tone: "waiting",
      };
    case "running":
      return { label: "Walking the site", tone: "live" };
    case "writing_up":
      return { label: "Writing up the report", tone: "live" };
    case "done":
      return { label: "Report ready", tone: "done" };
    case "failed":
      return { label: error ?? "The run failed.", tone: "stopped" };
    case "cancelled":
      return { label: "Stopped before it finished", tone: "stopped" };
  }
}

export function auditIsLive({ status }: Pick<AuditPublic, "status">): boolean {
  return status === "running";
}
