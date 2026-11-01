import type { SiteReport } from "./types.ts";

export interface ComparisonRow {
  host: string;
  total: number | null;
  currency: string | null;
  destination: string | null;
  comparable: boolean;
  rank: number | null;
  found: number;
  notChecked: number;
}

export interface Comparison {
  rankable: boolean;
  reasons: string[];
  rows: ComparisonRow[];
}

const TASK_DESTINATION = /\bto\s+([a-z][a-z ]*?)(?=\s+(?:on|for|in|by)\b|[,.?!]|$)/i;

function wantedPlace(task: string): string | null {
  return task.match(TASK_DESTINATION)?.[1]?.trim().toLowerCase() ?? null;
}

function samePlace(wanted: string, seen: string): boolean {
  return seen.toLowerCase().includes(wanted);
}

/** Only like-for-like results are ever ranked: same currency, and the place the task named. */
export function compareReports(task: string, reports: readonly SiteReport[]): Comparison {
  const wanted = wantedPlace(task);
  const reasons: string[] = [];

  const rows: ComparisonRow[] = reports.map((report) => {
    const elsewhere =
      wanted !== null && report.destination !== null && !samePlace(wanted, report.destination);
    if (elsewhere) {
      reasons.push(`${report.host} priced ${report.destination}, not the place in the task.`);
    }
    if (report.bill.total === null) reasons.push(`${report.host} has no total to compare.`);

    return {
      host: report.host,
      total: report.bill.total,
      currency: report.bill.currency,
      destination: report.destination,
      comparable: !elsewhere && report.bill.total !== null,
      rank: null,
      found: report.patterns.filter((entry) => entry.status === "found").length,
      notChecked: report.patterns.filter((entry) => entry.status === "not_checked").length,
    };
  });

  const comparable = rows.filter((row) => row.comparable);
  const currencies = new Set(comparable.map((row) => row.currency));
  if (currencies.size > 1) {
    reasons.push(`Prices are in different currencies: ${[...currencies].join(", ")}.`);
  }

  const everyRowComparable = comparable.length === rows.length;
  const rankable = comparable.length >= 2 && currencies.size === 1 && everyRowComparable;
  if (currencies.size <= 1 && comparable.length >= 1) {
    const ranked = comparable.toSorted((a, b) => (a.total ?? 0) - (b.total ?? 0));
    ranked.forEach((row, index) => {
      row.rank = index + 1;
    });
  }

  return {
    rankable,
    reasons,
    rows: rows.toSorted((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)),
  };
}
