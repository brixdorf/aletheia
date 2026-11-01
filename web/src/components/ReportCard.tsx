import type { ReportScope } from "../lib/api.ts";
import { screenshotUrl } from "../lib/api.ts";
import { money, plural } from "../lib/format.ts";
import type { Headline } from "../lib/report.ts";
import { counts, headline, logoutNote, signInOffer, stopSummary } from "../lib/report.ts";
import { newAuditHref } from "../lib/route.ts";
import type { SiteReport, SiteView } from "../lib/types.ts";
import { PatternList } from "./PatternList.tsx";
import { Receipt } from "./Receipt.tsx";
import { Screenshot } from "./Screenshot.tsx";
import { SubscriptionFacts } from "./SubscriptionFacts.tsx";
import { Link, Stamp } from "./ui.tsx";

const FLOW_LABEL = { checkout: "Checkout", subscription: "Subscription sign-up" } as const;

function HeadlineBlock({ value }: { value: Headline }) {
  if (value.kind === "price") {
    return (
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p className="text-muted">{value.shownLabel}</p>
          <p className="mono text-4xl font-medium sm:text-6xl">{value.shown}</p>
        </div>
        <div>
          <p className="text-muted">{value.paidLabel}</p>
          <p className="mono text-4xl font-medium sm:text-6xl">{value.paid}</p>
        </div>
        <p className="mono pb-1 text-xl font-semibold text-signal sm:text-2xl">{value.gap}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-3xl font-semibold sm:text-4xl">{value.title}</p>
        {value.kind === "finding" ? <Stamp status="found" className="text-lg" /> : null}
      </div>
      <p className="max-w-prose text-muted">{value.detail}</p>
    </div>
  );
}

function Tally({ report }: { report: SiteReport }) {
  const { found, notChecked, notFound } = counts(report);
  return (
    <p className="text-sm text-muted">
      <span className={found > 0 ? "font-semibold text-signal" : ""}>
        <span className="mono">{found}</span> found
      </span>
      , <span className="mono">{notChecked}</span> not checked,{" "}
      <span className="mono">{notFound}</span> not found, of the 13 banned patterns.
    </p>
  );
}

function PagesWalked({
  report,
  siteId,
  scope,
}: {
  report: SiteReport;
  siteId: string;
  scope: ReportScope;
}) {
  if (report.pages.length === 0) return null;
  return (
    <details className="border-t border-rule pt-3">
      <summary className="flex min-h-11 items-center font-semibold hover:text-muted">
        Every page the agent reached ({report.pages.length})
      </summary>
      <ol className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {report.pages.map((page) => (
          <li key={page.step} className="flex min-w-0 flex-col gap-2">
            <p className="min-w-0 wrap-break-word">
              <span className="mono text-muted">{page.step}.</span> {page.name}
              {page.price === null ? null : (
                <span className="mono"> {money(page.price, report.bill.currency)}</span>
              )}
            </p>
            {page.screenshot ? (
              <Screenshot
                src={screenshotUrl(scope, siteId, page.screenshot.stepId)}
                label={`Step ${page.step}: ${page.name}`}
              />
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

interface ReportCardProps {
  site: SiteView;
  report: SiteReport;
  task: string;
  scope: ReportScope;
  press: boolean;
}

export function ReportCard({ site, report, task, scope, press }: ReportCardProps) {
  const offer = signInOffer(report);
  const logout = logoutNote(site.logout);
  const lead = headline(report);
  const detail = [
    report.item,
    FLOW_LABEL[report.flow],
    report.signedIn ? "Signed in for one check" : "Guest",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <article
      id={`site-${site.id}`}
      aria-labelledby={`site-title-${site.id}`}
      className="flex scroll-mt-4 flex-col gap-6 rounded-sm border border-rule bg-sheet p-4 sm:p-8"
    >
      <header className="flex flex-col gap-1">
        <h2 id={`site-title-${site.id}`} className="text-2xl font-semibold wrap-anywhere">
          {report.host}
        </h2>
        <p className="text-muted">{detail}</p>
      </header>

      <HeadlineBlock value={lead} />

      <div className="flex flex-col gap-1">
        <Tally report={report} />
        {lead.kind === "open" ? null : <p className="text-sm text-muted">{stopSummary(report)}</p>}
      </div>

      {offer && scope.kind === "owner" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            className="button button-primary"
            href={newAuditHref({ task, url: report.url, signIn: true })}
          >
            {offer}
          </Link>
          <p className="max-w-prose text-sm text-muted">
            You sign in yourself. The sign-in lasts for this one check.
          </p>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-4">
          <Receipt report={report} />
          {report.subscription ? (
            <SubscriptionFacts subscription={report.subscription} currency={report.bill.currency} />
          ) : null}
          {report.missing.length > 0 ? (
            <div>
              <h3 className="font-semibold">What this run could not see</h3>
              <ul className="mt-1 flex flex-col gap-1 text-muted">
                {report.missing.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.flags.length > 0 ? (
            <div className="rounded-sm border-2 border-ink p-4">
              <h3 className="font-semibold">
                {plural(report.flags.length, "thing")} to check in this run
              </h3>
              <ul className="mt-1 flex flex-col gap-1">
                {report.flags.map((flag) => (
                  <li key={flag.kind + flag.detail}>{flag.detail}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {logout ? <p className="text-sm text-muted">{logout}</p> : null}
        </div>

        <section aria-label={`The 13 patterns on ${report.host}`}>
          <h3 className="mb-2 font-semibold">The 13 banned patterns</h3>
          <PatternList report={report} siteId={site.id} scope={scope} press={press} />
        </section>
      </div>

      <PagesWalked report={report} siteId={site.id} scope={scope} />
    </article>
  );
}
