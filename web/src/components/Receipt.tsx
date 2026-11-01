import { money } from "../lib/format.ts";
import { billLines, paidLabel } from "../lib/report.ts";
import type { SiteReport } from "../lib/types.ts";

function signed(sign: "base" | "plus" | "minus", text: string): string {
  if (sign === "plus") return `+ ${text}`;
  return sign === "minus" ? `- ${text}` : text;
}

export function Receipt({ report }: { report: SiteReport }) {
  const { bill, priceLabel } = report;
  const lines = billLines(bill);

  if (lines.length === 0) {
    return (
      <div className="rounded-sm border border-rule bg-paper p-4">
        <h3 className="font-semibold">The bill</h3>
        <p className="mt-1 text-muted">The agent never reached a price on this site.</p>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-rule bg-paper p-4">
      <h3 className="font-semibold">The bill</h3>
      <ul className="mt-3 flex flex-col gap-2">
        {lines.map((line) => (
          <li key={line.label}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0">{line.label}</span>
              <span className="mono shrink-0">
                {signed(line.sign, money(line.amount, bill.currency))}
              </span>
            </div>
            {line.late || line.tag ? (
              <p className="text-sm text-signal">
                {line.tag ? `${line.tag}. ` : null}
                {line.late ? (
                  <span className="mono">First showed up at step {line.step}</span>
                ) : null}
              </p>
            ) : line.step !== null ? (
              <p className="mono text-sm text-muted">Step {line.step}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {bill.total === null ? (
        <p className="mt-3 border-t-2 border-dashed border-edge pt-3 text-muted">
          The run ended before a total appeared.
        </p>
      ) : (
        <div className="mt-3 flex items-baseline justify-between gap-4 border-y-2 border-dashed border-edge py-2 font-semibold">
          <span>{paidLabel(priceLabel)}</span>
          <span className="mono text-xl">{money(bill.total, bill.currency)}</span>
        </div>
      )}

      {bill.addsUp === true && bill.total !== null ? (
        <p className="mt-2 text-sm text-muted">These lines add up to the total exactly.</p>
      ) : null}
      {bill.addsUp === false && bill.unexplained !== null ? (
        <p className="mt-2 text-sm text-signal">
          <span className="mono">{money(bill.unexplained, bill.currency)}</span> of the total is on
          no line of the bill.
        </p>
      ) : null}

      {bill.includedCharges.length > 0 ? (
        <div className="mt-3 text-sm text-muted">
          <p>Already inside the first price:</p>
          <ul>
            {bill.includedCharges.map((charge) => (
              <li key={charge.name} className="flex justify-between gap-4">
                <span>{charge.name}</span>
                <span className="mono">{money(charge.amount, bill.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
