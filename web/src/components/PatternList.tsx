import type { ReportScope } from "../lib/api.ts";
import { screenshotUrl } from "../lib/api.ts";
import { money } from "../lib/format.ts";
import { orderedPatterns, proofLabel } from "../lib/report.ts";
import type { PatternFinding, SiteReport } from "../lib/types.ts";
import { Screenshot } from "./Screenshot.tsx";
import { Stamp } from "./ui.tsx";

interface ProofProps {
  finding: PatternFinding;
  currency: string | null;
  screenshot: string | null;
}

function Proof({ finding, currency, screenshot }: ProofProps) {
  const { quote, amounts, note, step, label } = finding;
  return (
    <div className="flex flex-col gap-3 pt-1 pb-4">
      {quote ? (
        <blockquote className="relative max-w-prose pl-6 text-lg leading-snug">
          <span aria-hidden="true" className="absolute -top-1 left-0 text-3xl text-muted">
            &ldquo;
          </span>
          {quote}
        </blockquote>
      ) : null}
      {amounts.length > 0 ? (
        <ul className="mono max-w-sm text-sm">
          {amounts.map((amount) => (
            <li key={amount.label} className="flex justify-between gap-6 py-0.5">
              <span className="font-sans">{amount.label}</span>
              <span>{money(amount.amount, currency)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="max-w-prose text-muted">{note}</p> : null}
      <p className="text-sm text-muted">
        {step === null ? null : <span className="mono">Step {step}. </span>}
        {proofLabel(finding)}
      </p>
      {screenshot ? (
        <Screenshot
          src={screenshot}
          label={`${label}${step === null ? "" : `, step ${step}`}: what the agent saw`}
        />
      ) : null}
    </div>
  );
}

interface PatternListProps {
  report: SiteReport;
  siteId: string;
  scope: ReportScope;
  /** True when this report arrived while the page was open, so its stamps land. */
  press: boolean;
}

export function PatternList({ report, siteId, scope, press }: PatternListProps) {
  const rows = orderedPatterns(report);
  const firstFound = rows.findIndex((row) => row.status === "found");
  const partial = rows.some((row) => row.status === "not_found" && row.soFar);

  return (
    <>
      {partial ? (
        <p className="mb-2 text-sm text-muted">
          Not found holds only up to the last page the agent reached.
        </p>
      ) : null}
      <ul className="divide-y divide-rule border-y border-rule">
        {rows.map((row, index) => {
          const stamp = (
            <Stamp
              status={row.status}
              className="text-sm"
              {...(press ? { pressOrder: index } : {})}
            />
          );

          if (row.status === "found") {
            const shot = row.screenshot
              ? screenshotUrl(scope, siteId, row.screenshot.stepId)
              : null;
            return (
              <li key={row.id}>
                <details open={index === firstFound} className="group">
                  <summary className="flex min-h-12 items-center justify-between gap-3 py-2 font-semibold hover:bg-paper">
                    <span>
                      {row.label}
                      <span
                        aria-hidden="true"
                        className="ml-2 inline-block text-muted transition-transform group-open:rotate-90"
                      >
                        &#8250;
                      </span>
                    </span>
                    {stamp}
                  </summary>
                  <Proof finding={row} currency={report.bill.currency} screenshot={shot} />
                </details>
              </li>
            );
          }

          return (
            <li key={row.id} className="flex min-h-12 items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p>{row.label}</p>
                {row.note ? <p className="text-sm text-muted">{row.note}</p> : null}
              </div>
              {stamp}
            </li>
          );
        })}
      </ul>
    </>
  );
}
