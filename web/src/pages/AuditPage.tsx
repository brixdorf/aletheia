import { useEffect, useRef, useState } from "react";

import { ComparisonTable } from "../components/ComparisonTable.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { LiveSite } from "../components/LiveSite.tsx";
import { ReportCard } from "../components/ReportCard.tsx";
import { Failed, Link, Loading, Notice, usePageTitle } from "../components/ui.tsx";
import type { ReportScope } from "../lib/api.ts";
import { deleteAudit, getSharedAudit, shareAudit } from "../lib/api.ts";
import { buildComparison } from "../lib/compare.ts";
import { dateTime } from "../lib/format.ts";
import { auditIsLive } from "../lib/live.ts";
import type { AuditPublic, AuditView } from "../lib/types.ts";
import { useAudit } from "../lib/useAudit.ts";
import { useLoad } from "../lib/useLoad.ts";
import { navigate } from "../lib/useRoute.ts";

function ShareControl({ audit }: { audit: AuditView }) {
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function share() {
    setMessage(null);
    try {
      const token = await shareAudit(audit.id);
      const url = `${window.location.origin}/shared/${token}`;
      setLink(url);
      await navigator.clipboard.writeText(url).then(
        () => setMessage("Link copied."),
        () => setMessage("Copy the link below."),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The link could not be made.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="button" onClick={() => void share()}>
        Share this report
      </button>
      {link ? (
        <label className="flex flex-col gap-1 text-sm text-muted">
          Anyone with this link can read the report
          <input
            readOnly
            value={link}
            className="field mono text-sm text-ink"
            onFocus={(event) => event.target.select()}
          />
        </label>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function OwnerActions({ audit }: { audit: AuditView }) {
  const [confirming, setConfirming] = useState(false);
  const live = auditIsLive(audit);

  return (
    <div className="flex flex-wrap items-start gap-3">
      {live ? null : <ShareControl audit={audit} />}
      <button type="button" className="button button-danger" onClick={() => setConfirming(true)}>
        {live ? "Stop and delete" : "Delete"}
      </button>
      {confirming ? (
        <ConfirmDialog
          title={live ? "Stop this audit and delete it?" : "Delete this audit?"}
          confirmLabel={live ? "Stop and delete" : "Delete audit"}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await deleteAudit(audit.id);
            navigate("/", { replace: true });
          }}
        >
          The report, its screenshots and any share link go for good.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function AuditBody({
  audit,
  scope,
  owned,
}: {
  audit: AuditPublic;
  scope: ReportScope;
  owned: AuditView | null;
}) {
  usePageTitle(audit.task);
  // Reports already there on opening were confirmed earlier, so only new ones land a stamp.
  const presentAtOpen = useRef(
    new Set(audit.sites.filter((site) => site.report).map((site) => site.id)),
  );
  const comparison = buildComparison([audit]);
  const live = auditIsLive(audit);

  // Reports load after the page does, so the browser cannot jump to a site's link by itself.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (window.location.hash) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    }
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 basis-96">
          <h1 className="text-3xl font-semibold wrap-anywhere sm:text-4xl">{audit.task}</h1>
          <p className="mt-1 text-muted">
            <span className="mono text-sm">{dateTime(audit.createdAt)}</span>
            {live ? <span className="ml-3 font-medium text-live">Running now</span> : null}
          </p>
        </div>
        {owned ? <OwnerActions audit={owned} /> : null}
      </header>

      {comparison.columns.length >= 2 ? (
        <ComparisonTable
          view={comparison}
          showTasks={false}
          foldPatterns
          linkFor={({ key }) => `#site-${key}`}
        />
      ) : null}

      {audit.sites.map((site) =>
        site.report ? (
          <ReportCard
            key={site.id}
            site={site}
            report={site.report}
            task={audit.task}
            scope={scope}
            press={!presentAtOpen.current.has(site.id)}
          />
        ) : (
          <LiveSite key={site.id} site={site} task={audit.task} auditId={owned ? audit.id : null} />
        ),
      )}
    </div>
  );
}

export function AuditPage({ id }: { id: string }) {
  const { result, reconnecting, refresh } = useAudit(id);

  if (result.state === "loading") return <Loading what="Opening the audit." />;
  if (result.state === "failed") {
    if (result.code === "not_found") {
      return (
        <Notice
          title="This audit is gone"
          level="h1"
          action={
            <Link className="button" href="/">
              Back to your audits
            </Link>
          }
        >
          It may have been deleted, or it belongs to another browser.
        </Notice>
      );
    }
    return <Failed level="h1" message={result.message} onRetry={() => void refresh()} />;
  }
  return (
    <>
      {reconnecting ? (
        <p role="status" className="mb-4 text-muted">
          Reconnecting to the live view. The agent keeps working.
        </p>
      ) : null}
      <AuditBody audit={result.data} scope={{ kind: "owner", auditId: id }} owned={result.data} />
    </>
  );
}

export function SharedPage({ token }: { token: string }) {
  const { result, refresh } = useLoad(token, () => getSharedAudit(token));

  if (result.state === "loading") return <Loading what="Opening the shared report." />;
  if (result.state === "failed") {
    if (result.code === "not_found") {
      return (
        <Notice title="This shared report is gone" level="h1">
          Its owner may have deleted it. Links stop working when the audit is deleted.
        </Notice>
      );
    }
    return <Failed level="h1" message={result.message} onRetry={() => void refresh()} />;
  }
  return <AuditBody audit={result.data} scope={{ kind: "shared", token }} owned={null} />;
}
