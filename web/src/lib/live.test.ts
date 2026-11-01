import { describe, expect, it } from "vite-plus/test";

import { auditIsLive, siteStatus } from "./live.ts";

describe("siteStatus", () => {
  it("gives the queue position", () => {
    expect(siteStatus({ state: "queued", queuePosition: 2, error: null })).toEqual({
      label: "Waiting for a free agent, number 2 in line",
      tone: "waiting",
    });
  });

  it("says it is queued before a position is known", () => {
    expect(siteStatus({ state: "queued", queuePosition: null, error: null }).label).toBe(
      "Waiting for a free agent",
    );
  });

  it("marks a running site as live", () => {
    expect(siteStatus({ state: "running", queuePosition: null, error: null })).toEqual({
      label: "Walking the site",
      tone: "live",
    });
  });

  it("has a clear end state while the agent writes up", () => {
    expect(siteStatus({ state: "writing_up", queuePosition: null, error: null })).toEqual({
      label: "Writing up the report",
      tone: "live",
    });
  });

  it("shows the reason a run failed", () => {
    expect(siteStatus({ state: "failed", queuePosition: null, error: "It broke." })).toEqual({
      label: "It broke.",
      tone: "stopped",
    });
  });

  it("has a fallback when a failure gives no reason", () => {
    expect(siteStatus({ state: "failed", queuePosition: null, error: null }).label).toBe(
      "The run failed.",
    );
  });

  it("says a cancelled run stopped", () => {
    expect(siteStatus({ state: "cancelled", queuePosition: null, error: null })).toEqual({
      label: "Stopped before it finished",
      tone: "stopped",
    });
  });
});

describe("auditIsLive", () => {
  it("is live until the server says finished", () => {
    expect(auditIsLive({ status: "running" })).toBe(true);
    expect(auditIsLive({ status: "finished" })).toBe(false);
  });
});
