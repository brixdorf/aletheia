import type { AuditPublic, PatternId, PatternStatus, SiteReport } from "./types.ts";

export interface CompareColumn {
  key: string;
  auditId: string;
  host: string;
  task: string;
  report: SiteReport;
  rank: number | null;
}

export interface PatternRow {
  id: PatternId;
  label: string;
  statuses: PatternStatus[];
}

export interface ComparisonView {
  columns: CompareColumn[];
  patternRows: PatternRow[];
  ranked: boolean;
  notes: string[];
}

function patternRows(columns: readonly CompareColumn[]): PatternRow[] {
  const first = columns[0];
  if (!first) return [];
  return first.report.patterns.map(({ id, label }) => ({
    id,
    label,
    statuses: columns.map(
      (column) => column.report.patterns.find((entry) => entry.id === id)?.status ?? "not_checked",
    ),
  }));
}

/** Ranks come only from the server's like-for-like check inside one audit. */
export function buildComparison(audits: readonly AuditPublic[]): ComparisonView {
  const single = audits.length === 1 ? audits[0] : undefined;
  const comparison = single?.comparison ?? null;
  const ranked = comparison?.rankable === true;
  const rankOf = new Map(comparison?.rows.map((row) => [row.host, row.rank]));

  const columns = audits.flatMap((audit) =>
    audit.sites.flatMap((site) =>
      site.report
        ? [
            {
              key: site.id,
              auditId: audit.id,
              host: site.host,
              task: audit.task,
              report: site.report,
              rank: ranked ? (rankOf.get(site.host) ?? null) : null,
            },
          ]
        : [],
    ),
  );

  const unreported = audits.flatMap((audit) =>
    audit.sites
      .filter((site) => !site.report)
      .map((site) => `${site.host} has no report to compare.`),
  );
  const notes = [
    ...(audits.length > 1 ? ["These are separate audits, so they are shown but not ranked."] : []),
    ...(comparison?.reasons ?? []),
    ...unreported,
  ];

  return {
    columns: ranked
      ? columns.toSorted((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
      : columns,
    patternRows: patternRows(columns),
    ranked,
    notes,
  };
}
