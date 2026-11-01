import { money } from "../lib/format.ts";
import { SHOWN_WHERE_LABEL, TERM_LABEL } from "../lib/report.ts";
import type { SubscriptionSummary } from "../lib/types.ts";

interface SubscriptionFactsProps {
  subscription: SubscriptionSummary;
  currency: string | null;
}

export function SubscriptionFacts({ subscription, currency }: SubscriptionFactsProps) {
  const { plan, billingPeriod, options, terms, contractTotal, renewalTotal, noCommitmentPrice } =
    subscription;

  const totals = [
    ["Contract total", contractTotal],
    ["Renewal total", renewalTotal],
    ["Price with no commitment", noCommitmentPrice],
  ] as const;
  const shownTotals = totals.filter(([, amount]) => amount !== null);

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-rule p-4">
      <div>
        <h3 className="font-semibold">The plan</h3>
        {plan || billingPeriod ? (
          <p className="text-muted">{[plan, billingPeriod].filter(Boolean).join(", ")}</p>
        ) : null}
      </div>

      {shownTotals.length > 0 ? (
        <dl>
          {shownTotals.map(([label, amount]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-0.5">
              <dt>{label}</dt>
              <dd className="mono">{money(amount ?? 0, currency)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {options.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold">Every billing option</h4>
          <ul className="mt-1 divide-y divide-rule">
            {options.map((option) => (
              <li key={option.label} className="py-2">
                <div className="flex items-baseline justify-between gap-4">
                  <span>
                    {option.label}
                    {option.selectedByDefault ? (
                      <span className="text-sm text-muted"> (picked by default)</span>
                    ) : null}
                  </span>
                  {option.price === null ? null : (
                    <span className="mono shrink-0">
                      {money(option.price, currency)}
                      {option.period ? `/${option.period}` : ""}
                    </span>
                  )}
                </div>
                {option.commitment ? (
                  <p className="text-sm text-muted">{option.commitment}</p>
                ) : null}
                {option.feeLine ? <p className="text-sm text-muted">{option.feeLine}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {terms.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold">Terms, and where the site shows them</h4>
          <ul className="mt-1 divide-y divide-rule">
            {terms.map((term) => (
              <li key={term.term} className="py-2">
                <p className="flex flex-wrap justify-between gap-x-4">
                  <span>{TERM_LABEL[term.term]}</span>
                  <span className="text-sm text-muted">
                    {SHOWN_WHERE_LABEL[term.shownWhere]}
                    {term.seenAtStep === null ? null : (
                      <span className="mono">, step {term.seenAtStep}</span>
                    )}
                  </span>
                </p>
                {term.quote ? <p className="text-sm text-muted">{term.quote}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
