import { useState } from "react";

import type { CompareColumn, ComparisonView } from "../lib/compare.ts";
import { money } from "../lib/format.ts";
import { counts, stopSummary } from "../lib/report.ts";
import { Stamp } from "./ui.tsx";

function price(amount: number | null, currency: string | null): string {
  return amount === null ? "Not reached" : money(amount, currency);
}

const headCell =
  "bg-sheet px-3 py-2 text-left align-top font-normal text-muted sm:sticky sm:left-0";
const cell = "px-3 py-2 align-top";

interface ComparisonTableProps {
  view: ComparisonView;
  showTasks: boolean;
  headingLevel?: "h2" | "h1";
  /** Where a site's name leads, which differs for a visitor reading a shared report. */
  linkFor: (column: CompareColumn) => string;
  /** Sits above the reports on an audit page, so the 13 rows start folded away. */
  foldPatterns?: boolean;
}

export function ComparisonTable({
  view,
  showTasks,
  headingLevel = "h2",
  linkFor,
  foldPatterns = false,
}: ComparisonTableProps) {
  const { columns, patternRows, ranked, notes } = view;
  const Heading = headingLevel;
  const [patternsShown, setPatternsShown] = useState(!foldPatterns);

  return (
    <section aria-labelledby="comparison-title" className="flex flex-col gap-3">
      <Heading id="comparison-title" className="text-2xl font-semibold">
        Side by side
      </Heading>
      {ranked ? (
        <p className="text-muted">Same task and currency, so these are ranked by the total.</p>
      ) : null}
      {notes.length > 0 ? (
        <ul className="text-muted">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {/* The table keeps its columns aligned and scrolls inside this box on a phone. */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="comparison-title"
        className="overflow-x-auto rounded-sm border border-rule bg-sheet"
      >
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr className="border-b-2 border-ink">
              <td className={headCell} />
              {columns.map((column) => (
                <th key={column.key} scope="col" className={`${cell} min-w-40 text-left`}>
                  <a className="link font-semibold" href={linkFor(column)}>
                    {column.host}
                  </a>
                  {column.rank === null ? null : (
                    <span className="mono block text-sm font-normal text-muted">
                      {column.rank === 1 ? "Lowest total" : `Number ${column.rank} by total`}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {showTasks ? (
              <tr>
                <th scope="row" className={headCell}>
                  Task
                </th>
                {columns.map((column) => (
                  <td key={column.key} className={`${cell} max-w-56`}>
                    {column.task}
                  </td>
                ))}
              </tr>
            ) : null}
            <tr>
              <th scope="row" className={headCell}>
                First price shown
              </th>
              {columns.map(({ key, report: { bill } }) => (
                <td key={key} className={`${cell} mono`}>
                  {price(bill.firstPrice, bill.currency)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={headCell}>
                Last total seen
              </th>
              {columns.map(({ key, report: { bill } }) => (
                <td key={key} className={`${cell} mono font-semibold`}>
                  {price(bill.total, bill.currency)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={headCell}>
                Added on the way
              </th>
              {columns.map(({ key, report: { bill } }) => (
                <td
                  key={key}
                  className={`${cell} mono ${(bill.increase ?? 0) > 0 ? "font-semibold text-signal" : ""}`}
                >
                  {bill.increase === null ? "Unknown" : money(bill.increase, bill.currency)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={headCell}>
                Patterns found
              </th>
              {columns.map(({ key, report }) => {
                const { found, notChecked } = counts(report);
                return (
                  <td key={key} className={cell}>
                    <span className="mono">{found}</span> found,{" "}
                    <span className="mono">{notChecked}</span> not checked
                  </td>
                );
              })}
            </tr>
            <tr>
              <th scope="row" className={headCell}>
                Where it stopped
              </th>
              {columns.map(({ key, report }) => (
                <td key={key} className={`${cell} max-w-56 text-sm text-muted`}>
                  {stopSummary(report)}
                </td>
              ))}
            </tr>
            {patternsShown
              ? patternRows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className={headCell}>
                      {row.label}
                    </th>
                    {row.statuses.map((status, index) => (
                      <td key={columns[index]?.key} className={cell}>
                        <Stamp status={status} className="text-xs" />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
      {foldPatterns ? (
        <button
          type="button"
          className="link inline-flex min-h-11 w-fit items-center"
          aria-expanded={patternsShown}
          onClick={() => setPatternsShown((shown) => !shown)}
        >
          {patternsShown ? "Hide the 13 patterns" : "Compare all 13 patterns"}
        </button>
      ) : null}
    </section>
  );
}
