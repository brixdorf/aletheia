import { describe, expect, it } from "vite-plus/test";

import { loadRun } from "../testing/fixtures.ts";
import { compareReports } from "./compare.ts";
import { judgeRun } from "./judge.ts";
import type { SiteReport } from "./types.ts";

function report(overrides: {
  host: string;
  total?: number | null;
  currency?: string | null;
  destination?: string | null;
}): SiteReport {
  const base = judgeRun({
    flow: "checkout",
    url: `https://${overrides.host}/`,
    run: loadRun("blinkit-2"),
  });
  return {
    ...base,
    destination: overrides.destination ?? null,
    bill: {
      ...base.bill,
      total: overrides.total === undefined ? base.bill.total : overrides.total,
      currency: overrides.currency === undefined ? "INR" : overrides.currency,
    },
  };
}

describe("compareReports", () => {
  it("ranks like-for-like totals, lowest first", () => {
    const comparison = compareReports("buy one packet of milk", [
      report({ host: "a.test", total: 90 }),
      report({ host: "b.test", total: 81 }),
    ]);

    expect(comparison.rankable).toBe(true);
    expect(comparison.rows.map((row) => [row.host, row.rank])).toEqual([
      ["b.test", 1],
      ["a.test", 2],
    ]);
  });

  it("never ranks mixed currencies and says why", () => {
    const comparison = compareReports("flight", [
      report({ host: "a.test", total: 9528, currency: "INR" }),
      report({ host: "b.test", total: 99.68, currency: "USD" }),
    ]);

    expect(comparison.rankable).toBe(false);
    expect(comparison.reasons.join(" ")).toMatch(/currenc/i);
    expect(comparison.rows.every((row) => row.rank === null)).toBe(true);
  });

  it("never ranks a result for a different place than the task names", () => {
    const comparison = compareReports("One-way flight from Bangalore to Delhi on 25 Nov", [
      report({ host: "ixigo.test", total: 9973, destination: "Delhi (DEL)" }),
      report({ host: "cleartrip.test", total: 9528, destination: "Noida (DXN)" }),
    ]);

    expect(comparison.rankable).toBe(false);
    expect(comparison.reasons.join(" ")).toMatch(/Noida/);
    expect(comparison.rows.find((row) => row.host === "cleartrip.test")?.comparable).toBe(false);
  });

  it("leaves a site with no total unranked but keeps it in the table", () => {
    const comparison = compareReports("buy milk", [
      report({ host: "a.test", total: 81 }),
      report({ host: "b.test", total: null }),
    ]);

    expect(comparison.rows.find((row) => row.host === "b.test")?.rank).toBeNull();
    expect(comparison.rows).toHaveLength(2);
    expect(comparison.reasons.join(" ")).toMatch(/b\.test/);
  });

  it("counts patterns found per site, since that is the real question", () => {
    const [row] = compareReports("buy milk", [report({ host: "a.test" })]).rows;

    expect(row?.found).toBe(1);
    expect(row?.notChecked).toBeGreaterThan(0);
  });
});
