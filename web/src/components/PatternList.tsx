import type { ReportScope } from "../lib/api.ts";
import { screenshotUrl } from "../lib/api.ts";
import { money } from "../lib/format.ts";
import { orderedPatterns, proofLabel } from "../lib/report.ts";
import { patternName } from "../lib/story.ts";
import type { PatternFinding, SiteReport } from "../lib/types.ts";
import { Chevron } from "./icons.tsx";
import { Screenshot } from "./Screenshot.tsx";
import { StatusPill } from "./ui.tsx";

interface ProofProps {
  finding: PatternFinding;
  currency: string | null;
  screenshot: string | null;
}

function Proof({ finding, currency, screenshot }: ProofProps) {
  const { quote, amounts, note, step, label } = finding;
  return (
    <div className="flex flex-col gap-4 px-3.5 pb-4 sm:flex-row sm:justify-between sm:gap-8">
      <div className="flex min-w-0 flex-col gap-3">
        {quote ? (
          <blockquote className="max-w-prose border-l-2 border-found py-0.5 pl-3.5 font-serif text-xl/snug text-ink italic">
            &ldquo;{quote}&rdquo;
          </blockquote>
        ) : null}
        {amounts.length > 0 ? (
          <ul className="num max-w-sm text-sm">
            {amounts.map((amount) => (
              <li key={amount.label} className="flex justify-between gap-6 py-0.5">
                <span>{amount.label}</span>
                <span>{money(amount.amount, currency)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {note ? <p className="max-w-prose text-body">{note}</p> : null}
        <p className="text-[13px] text-body">
          {step === null ? null : <span className="num">Step {step}. </span>}
          {proofLabel(finding)}
        </p>
      </div>
      {screenshot ? (
        <div className="shrink-0">
          <Screenshot
            src={screenshot}
            label={`${label}${step === null ? "" : `, step ${step}`}: what the agent saw`}
          />
        </div>
      ) : null}
    </div>
  );
}

const ROW_TINT: Record<PatternFinding["status"], string> = {
  found: "bg-peach",
  not_found: "bg-wash",
  not_checked: "bg-wash",
};

interface PatternListProps {
  report: SiteReport;
  siteId: string;
  scope: ReportScope;
  /** True when this report arrived while the page was open, so the found pills pop. */
  press: boolean;
  /** The finding the headline already tells, which stays folded here. */
  told: PatternFinding["id"] | null;
}

export function PatternList({ report, siteId, scope, press, told }: PatternListProps) {
  const rows = orderedPatterns(report);
  const partial = rows.some((row) => row.status === "not_found" && row.soFar);

  return (
    <>
      {partial ? (
        <p className="px-4 pb-2 text-[13px] text-mute">
          Not found holds only up to the last page the agent reached.
        </p>
      ) : null}
      {/* An opened row takes the full width, so the grid stays three columns of plain rows. */}
      <ul className="grid grid-flow-row-dense gap-2 p-1.5 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((row, index) => {
          const shot =
            row.status === "found" && row.screenshot
              ? screenshotUrl(scope, siteId, row.screenshot.stepId)
              : null;
          return (
            <li key={row.id} className="has-[details[open]]:col-span-full">
              <details
                open={row.status === "found" && row.id !== told}
                className={`group rounded-[14px] ${ROW_TINT[row.status]}`}
              >
                <summary className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] py-2 pr-2.5 pl-3.5 font-medium text-text transition-colors hover:text-ink">
                  <span className="min-w-0">{patternName(row.label)}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <StatusPill status={row.status} {...(press ? { popOrder: index } : {})} />
                    <span
                      aria-hidden="true"
                      className="text-faint transition-transform group-open:rotate-90"
                    >
                      <Chevron size={14} />
                    </span>
                  </span>
                </summary>
                {row.status === "found" ? (
                  <Proof finding={row} currency={report.bill.currency} screenshot={shot} />
                ) : row.note ? (
                  <p className="px-3.5 pb-3 text-[13px] text-mute">{row.note}</p>
                ) : null}
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}
