import { useEffect, useState } from "react";

import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { Failed, Link, Loading, Notice, usePageTitle } from "../components/ui.tsx";
import { deleteAudit, listAudits } from "../lib/api.ts";
import { dateTime, plural } from "../lib/format.ts";
import { summaryPrice } from "../lib/report.ts";
import type { AuditSummary } from "../lib/types.ts";
import { useLoad } from "../lib/useLoad.ts";

const REFRESH_MS = 5000;
const MAX_PICKED = 4;

type SummarySite = AuditSummary["sites"][number];

const STATE_LABEL: Record<Exclude<SummarySite["state"], "done">, string> = {
  queued: "Waiting",
  running: "Running",
  writing_up: "Writing up",
  failed: "Failed",
  cancelled: "Stopped",
};

const doneSites = ({ sites }: AuditSummary) => sites.filter((site) => site.state === "done").length;

function SiteLine({ site }: { site: SummarySite }) {
  return (
    <li className="grid items-baseline gap-x-6 py-1.5 sm:grid-cols-[minmax(0,1fr)_11rem_16rem]">
      <span className="min-w-0 wrap-anywhere">{site.host}</span>
      {site.state === "done" ? (
        <>
          <span className="mono sm:order-last sm:text-right">{summaryPrice(site)}</span>
          <span className="text-sm">
            <span className={site.found > 0 ? "font-semibold text-signal" : ""}>
              <span className="mono">{site.found}</span> found
            </span>
            {site.notChecked > 0 ? (
              <span className="text-muted">
                , <span className="mono">{site.notChecked}</span> not checked
              </span>
            ) : null}
          </span>
        </>
      ) : (
        <span
          className={`text-sm sm:col-span-2 ${
            site.state === "running" || site.state === "writing_up"
              ? "font-medium text-live"
              : "text-muted"
          }`}
        >
          {STATE_LABEL[site.state]}
        </span>
      )}
    </li>
  );
}

interface AuditRowProps {
  audit: AuditSummary;
  picked: boolean;
  canPick: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

function AuditRow({ audit, picked, canPick, onToggle, onDelete }: AuditRowProps) {
  const running = audit.status === "running";
  const finished = doneSites(audit);

  return (
    <li className="flex flex-col gap-3 py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
        <div className="min-w-0 flex-1 basis-80">
          <Link href={`/audits/${audit.id}`} className="link text-lg font-semibold wrap-anywhere">
            {audit.task}
          </Link>
          <p className="text-sm text-muted">
            <span className="mono">{dateTime(audit.createdAt)}</span>
            {running ? <span className="ml-3 font-medium text-live">Running now</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4">
          {finished >= 2 ? (
            <Link
              href={`/compare?audits=${audit.id}`}
              className="link inline-flex min-h-11 items-center text-sm"
            >
              Compare these sites
            </Link>
          ) : null}
          {finished >= 1 ? (
            <label className="inline-flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={picked}
                disabled={!picked && !canPick}
                onChange={onToggle}
                className="size-4 accent-ink"
              />
              Compare
              <span className="sr-only">: {audit.task}</span>
            </label>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            className="link inline-flex min-h-11 items-center text-sm"
          >
            Delete<span className="sr-only">: {audit.task}</span>
          </button>
        </div>
      </div>
      <ul className="divide-y divide-rule rounded-sm border border-rule bg-sheet px-3">
        {audit.sites.map((site) => (
          <SiteLine key={site.host} site={site} />
        ))}
      </ul>
    </li>
  );
}

function ComparePick({ audits }: { audits: AuditSummary[] }) {
  const sites = audits.reduce((sum, audit) => sum + doneSites(audit), 0);
  return (
    <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink bg-paper px-4 py-3 sm:mx-0 sm:px-0">
      <p>
        {plural(audits.length, "audit")} picked, {plural(sites, "finished site")}
      </p>
      {sites >= 2 ? (
        <Link
          className="button button-primary"
          href={`/compare?audits=${audits.map((audit) => audit.id).join(",")}`}
        >
          Compare side by side
        </Link>
      ) : (
        <p className="text-muted">Pick one more to compare.</p>
      )}
    </div>
  );
}

export function Dashboard() {
  usePageTitle("Your audits");
  const { result, refresh } = useLoad("audits", listAudits);
  const [picked, setPicked] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<AuditSummary | null>(null);
  const anyRunning =
    result.state === "ready" && result.data.some((audit) => audit.status === "running");

  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [anyRunning, refresh]);

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  const audits = result.state === "ready" ? result.data : [];
  const pickedAudits = audits.filter((audit) => picked.includes(audit.id));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">Your audits</h1>
          <p className="mt-1 max-w-prose text-muted">
            Which banned dark patterns does a site use? Each audit answers that with proof.
          </p>
        </div>
        <Link className="button button-primary" href="/new">
          New audit
        </Link>
      </header>

      {result.state === "loading" ? <Loading what="Fetching your audits." /> : null}
      {result.state === "failed" ? (
        <Failed message={result.message} onRetry={() => void refresh()} />
      ) : null}

      {result.state === "ready" && audits.length === 0 ? (
        <Notice
          title="No audits yet"
          action={
            <Link className="button button-primary" href="/new">
              Start your first audit
            </Link>
          }
        >
          Give Aletheia a task and a site. The agent walks the site like a customer, stops before
          payment, and reports which of the 13 banned patterns it saw.
        </Notice>
      ) : null}

      {audits.length > 0 ? (
        <ul className="divide-y divide-rule border-y border-rule">
          {audits.map((audit) => (
            <AuditRow
              key={audit.id}
              audit={audit}
              picked={picked.includes(audit.id)}
              canPick={picked.length < MAX_PICKED}
              onToggle={() => toggle(audit.id)}
              onDelete={() => setDeleting(audit)}
            />
          ))}
        </ul>
      ) : null}

      {pickedAudits.length > 0 ? <ComparePick audits={pickedAudits} /> : null}

      {deleting ? (
        <ConfirmDialog
          title="Delete this audit?"
          confirmLabel={deleting.status === "running" ? "Stop and delete" : "Delete audit"}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteAudit(deleting.id);
            setPicked((current) => current.filter((entry) => entry !== deleting.id));
            setDeleting(null);
            await refresh();
          }}
        >
          {deleting.task}. The report, its screenshots and any share link go for good.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
