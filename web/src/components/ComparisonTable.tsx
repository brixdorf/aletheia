import { useState } from "react";

import { hiddenCostLabel, type CompareColumn, type ComparisonView } from "../lib/compare.ts";
import { counts, stopSummary } from "../lib/report.ts";
import { siteName } from "../lib/sites.ts";
import { patternName } from "../lib/story.ts";
import { Link, Money, PatternStrip, SiteAvatar, StatusPill } from "./ui.tsx";

function Price({ amount, currency }: { amount: number | null; currency: string | null }) {
  if (amount === null) return <span className="text-mute">Not reached</span>;
  return <Money amount={amount} currency={currency} />;
}

const headCell =
  "bg-white px-4 py-3 text-left align-top font-normal text-mute sm:sticky sm:left-0 sm:z-1";
const cell = "px-4 py-3 align-top";

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
    <section aria-labelledby="comparison-title" className="flex flex-col gap-4">
      <div>
        <Heading id="comparison-title" className="text-[28px]/[1.1] sm:text-[34px]/[1.1]">
          Side by side
        </Heading>
        {ranked ? (
          <p className="mt-1.5 text-mute">
            Same task and currency, so these are ranked by the total.
          </p>
        ) : null}
        {notes.length > 0 ? (
          <ul className="mt-1.5 text-mute">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* The table keeps its columns aligned and scrolls inside this box on a phone. */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="comparison-title"
        className="card overflow-x-auto p-2"
      >
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr className="border-b border-line">
              <td className={headCell} />
              {columns.map((column) => {
                const statuses = column.report.patterns.map(({ status }) => status);
                return (
                  <th key={column.key} scope="col" className={`${cell} min-w-56 text-left`}>
                    <div className="flex items-center gap-3">
                      <SiteAvatar host={column.host} />
                      <div>
                        <Link
                          className="text-base font-semibold text-ink hover:underline hover:underline-offset-4"
                          href={linkFor(column)}
                        >
                          {siteName(column.host)}
                        </Link>
                        {column.rank === null ? null : (
                          <span className="block text-[13px] font-normal text-mute">
                            {column.rank === 1 ? "Lowest total" : `Number ${column.rank} by total`}
                          </span>
                        )}
                      </div>
                    </div>
                    <PatternStrip statuses={statuses} className="mt-3" />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
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
                Item
              </th>
              {columns.map(({ key, report }) => (
                <td key={key} className={`${cell} max-w-56`}>
                  {report.item ?? <span className="text-mute">Not named</span>}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={headCell}>
                First price shown
              </th>
              {columns.map(({ key, report: { bill } }) => (
                <td key={key} className={cell}>
                  <Price amount={bill.firstPrice} currency={bill.currency} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={headCell}>
                Last total seen
              </th>
              {columns.map(({ key, report: { bill } }) => (
                <td key={key} className={`${cell} text-lg font-semibold text-ink`}>
                  <Price amount={bill.total} currency={bill.currency} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={headCell}>
                Hidden cost
              </th>
              {columns.map(({ key, hiddenCost, report: { bill } }) => (
                <td
                  key={key}
                  className={`${cell} num ${(hiddenCost?.amount ?? 0) > 0 ? "font-semibold text-peach-ink" : ""}`}
                >
                  {hiddenCostLabel(hiddenCost, bill.currency)}
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
                  <td key={key} className={`${cell} num`}>
                    {found} found, {notChecked} not checked
                  </td>
                );
              })}
            </tr>
            <tr>
              <th scope="row" className={headCell}>
                Where it stopped
              </th>
              {columns.map(({ key, report }) => (
                <td key={key} className={`${cell} max-w-56 text-[13px] text-mute`}>
                  {stopSummary(report)}
                </td>
              ))}
            </tr>
            {patternsShown
              ? patternRows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className={headCell}>
                      {patternName(row.label)}
                    </th>
                    {row.statuses.map((status, index) => (
                      <td key={columns[index]?.key} className={cell}>
                        <StatusPill status={status} />
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
          className="btn btn-soft btn-sm w-fit"
          aria-expanded={patternsShown}
          onClick={() => setPatternsShown((shown) => !shown)}
        >
          {patternsShown ? "Hide the 13 patterns" : "Compare all 13 patterns"}
        </button>
      ) : null}
    </section>
  );
}
