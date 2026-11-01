import { describe, expect, it } from "vite-plus/test";

import { bill, finding, report } from "../testing/report.ts";
import { buildComparison, hiddenCostLabel } from "./compare.ts";
import type { AuditPublic, SiteView } from "./types.ts";

function site(host: string, reportOverrides: Parameters<typeof report>[0] = {}): SiteView {
  return {
    id: `site-${host}`,
    url: `https://${host}`,
    host,
    signedIn: false,
    state: "done",
    queuePosition: null,
    runId: "run_1",
    streamingUrl: null,
    steps: [],
    startedAt: null,
    finishedAt: null,
    report: report({ host, ...reportOverrides }),
    error: null,
    logout: null,
  };
}

function audit(overrides: Partial<AuditPublic>): AuditPublic {
  return {
    id: "a1",
    task: "Buy milk",
    flow: "checkout",
    createdAt: "2026-11-01T08:00:00.000Z",
    status: "finished",
    sites: [],
    comparison: null,
    ...overrides,
  };
}

const row = (host: string, rank: number | null, total: number | null) => ({
  host,
  total,
  currency: "INR",
  destination: null,
  comparable: total !== null,
  rank,
  item: null,
  hiddenCost: null,
  found: 0,
  notChecked: 0,
});

describe("hiddenCostLabel", () => {
  it("shows the gap in money and as a percentage", () => {
    expect(hiddenCostLabel({ amount: 57, percent: 238, final: true }, "INR")).toBe("+Rs 57, +238%");
  });

  it("shows no percentage when nothing was added", () => {
    expect(hiddenCostLabel({ amount: 0, percent: 0, final: true }, "INR")).toBe("+Rs 0");
  });

  it("says so far when the run stopped before payment", () => {
    expect(hiddenCostLabel({ amount: 0, percent: 0, final: false }, "INR")).toBe("+Rs 0 so far");
  });

  it("says unknown when there is no gap to show", () => {
    expect(hiddenCostLabel(null, "INR")).toBe("Unknown");
  });
});

describe("buildComparison", () => {
  it("ranks by the server's order when one audit is rankable", () => {
    const view = buildComparison([
      audit({
        sites: [site("blinkit.com"), site("zomato.com")],
        comparison: {
          rankable: true,
          reasons: [],
          rows: [row("zomato.com", 1, 60), row("blinkit.com", 2, 81)],
        },
      }),
    ]);
    expect(view.ranked).toBe(true);
    expect(view.columns.map((column) => [column.host, column.rank])).toEqual([
      ["zomato.com", 1],
      ["blinkit.com", 2],
    ]);
  });

  it("drops every rank when the server says the results are not like for like", () => {
    const view = buildComparison([
      audit({
        sites: [site("a.test"), site("b.test"), site("c.test")],
        comparison: {
          rankable: false,
          reasons: ["c.test priced Noida, not the place in the task."],
          rows: [row("a.test", 1, 60), row("b.test", 2, 81), row("c.test", null, 90)],
        },
      }),
    ]);
    expect(view.ranked).toBe(false);
    expect(view.columns.every((column) => column.rank === null)).toBe(true);
    expect(view.notes).toEqual(["c.test priced Noida, not the place in the task."]);
  });

  it("never ranks across audits, whose tasks can differ", () => {
    const view = buildComparison([
      audit({ id: "a1", task: "Buy milk", sites: [site("blinkit.com")] }),
      audit({ id: "a2", task: "Buy a phone", sites: [site("croma.com")] }),
    ]);
    expect(view.ranked).toBe(false);
    expect(view.columns.map((column) => column.task)).toEqual(["Buy milk", "Buy a phone"]);
    expect(view.notes[0]).toContain("not ranked");
  });

  it("leaves out sites with no report and says so", () => {
    const unfinished = { ...site("slow.test"), state: "failed" as const, report: null };
    const view = buildComparison([audit({ sites: [site("a.test"), unfinished] })]);
    expect(view.columns.map((column) => column.host)).toEqual(["a.test"]);
    expect(view.notes).toContain("slow.test has no report to compare.");
  });

  it("gives every column its hidden cost, with no winner, even across audits", () => {
    const view = buildComparison([
      audit({
        id: "a1",
        sites: [
          site("blinkit.com", {
            priceLabel: "price_before_sign_in",
            bill: bill({ firstPrice: 24, total: 81, increase: 57 }),
          }),
        ],
      }),
      audit({
        id: "a2",
        sites: [site("croma.com", { bill: bill({ firstPrice: 549, total: 549, increase: 0 }) })],
      }),
    ]);

    expect(view.columns.map((column) => [column.host, column.rank, column.hiddenCost])).toEqual([
      ["blinkit.com", null, { amount: 57, percent: 238, final: false }],
      ["croma.com", null, { amount: 0, percent: 0, final: true }],
    ]);
  });

  it("lines up the 13 patterns across columns", () => {
    const view = buildComparison([
      audit({
        sites: [
          site("a.test", {
            bill: bill({ firstPrice: 24, total: 81, increase: 57 }),
            patterns: [finding({ id: "drip_pricing", label: "Drip Pricing", status: "found" })],
          }),
          site("b.test", {
            patterns: [
              finding({ id: "drip_pricing", label: "Drip Pricing", status: "not_checked" }),
            ],
          }),
        ],
      }),
    ]);
    const drip = view.patternRows.find((entry) => entry.id === "drip_pricing");
    expect(view.patternRows).toHaveLength(13);
    expect(drip?.label).toBe("Drip Pricing");
    expect(drip?.statuses).toEqual(["found", "not_checked"]);
  });

  it("is empty when nothing has a report", () => {
    const view = buildComparison([audit({})]);
    expect(view.columns).toEqual([]);
    expect(view.patternRows).toEqual([]);
  });
});
