import { useEffect, useRef, useState } from "react";

import { signOut } from "../lib/api.ts";
import { clock } from "../lib/format.ts";
import { siteStatus } from "../lib/live.ts";
import { logoutNote } from "../lib/report.ts";
import { newAuditHref } from "../lib/route.ts";
import { recallSignIn } from "../lib/signInMemory.ts";
import type { SiteView } from "../lib/types.ts";
import { Link } from "./ui.tsx";

function LiveMarker() {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-live">
      <span aria-hidden="true" className="size-2 rounded-full bg-live" />
      LIVE
    </span>
  );
}

function Timeline({ site, active }: { site: SiteView; active: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  const stepCount = site.steps.length;

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [stepCount, site.state]);

  if (stepCount === 0 && site.state === "queued") {
    return <p className="text-muted">Steps show up here once an agent picks this site up.</p>;
  }

  return (
    <ol
      ref={list}
      // A long run scrolls inside its card, so keyboard users need to be able to reach it.
      tabIndex={0}
      aria-label={`Steps on ${site.host}`}
      className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-2"
    >
      {stepCount === 0 ? <li className="text-muted">The agent is opening the site.</li> : null}
      {site.steps.map((step, index) => {
        const newest = active && site.state === "running" && index === stepCount - 1;
        return (
          <li key={`${step.at}-${index}`} className="grid grid-cols-[2.25rem_1fr] gap-x-2">
            <span className={`mono ${newest ? "font-semibold text-live" : "text-muted"}`}>
              {index + 1}
            </span>
            <span className={newest ? "font-medium text-live" : ""}>
              {step.text}
              <span className="mono block text-sm text-muted">{clock(step.at)}</span>
            </span>
          </li>
        );
      })}
      {site.state === "writing_up" ? (
        <li className="grid grid-cols-[2.25rem_1fr] gap-x-2 font-medium text-live">
          <span aria-hidden="true" className="mono">
            +
          </span>
          <span>
            Writing up the report
            <span className="block text-sm font-normal text-muted">
              The agent has finished walking the site. This part can take a few minutes.
            </span>
          </span>
        </li>
      ) : null}
    </ol>
  );
}

function LiveBrowser({ site, active }: { site: SiteView; active: boolean }) {
  const { streamingUrl, host, state } = site;
  const waiting =
    state === "queued"
      ? "The live browser opens when an agent is free."
      : active
        ? "Connecting to the live browser."
        : "The browser has closed.";

  return (
    <figure
      className={`min-w-0 rounded-sm border-2 bg-sheet ${active ? "border-live" : "border-rule"}`}
    >
      <figcaption
        className={`flex min-h-9 items-center justify-between gap-3 border-b-2 px-3 py-1.5 ${
          active ? "border-live bg-live-wash" : "border-rule"
        }`}
      >
        <span className="mono min-w-0 truncate text-sm">{host}</span>
        {active && streamingUrl ? <LiveMarker /> : null}
      </figcaption>
      {streamingUrl ? (
        <iframe
          src={streamingUrl}
          title={`Live browser on ${host}`}
          referrerPolicy="no-referrer"
          className="aspect-[16/10] w-full bg-paper"
        />
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center p-4 text-center text-muted">
          {waiting}
        </div>
      )}
      {streamingUrl ? (
        <p className="px-3 py-1.5 text-sm">
          <a className="link" href={streamingUrl} target="_blank" rel="noreferrer">
            Open the live browser in a new tab
          </a>
        </p>
      ) : null}
    </figure>
  );
}

function EarlySignOut({ auditId, site }: { auditId: string; site: SiteView }) {
  const signInId = recallSignIn(auditId, site.url);
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  if (!signInId) return null;

  async function stop(id: string) {
    setState("busy");
    try {
      await signOut(id);
      setState("done");
    } catch {
      setState("failed");
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="text-sm text-muted">
        Stopping the check and signing out.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="button button-quiet"
        disabled={state === "busy"}
        onClick={() => void stop(signInId)}
      >
        Sign out and stop this check
      </button>
      {state === "failed" ? (
        <p role="alert" className="text-sm text-signal-deep">
          That did not go through. Please try again.
        </p>
      ) : null}
    </div>
  );
}

interface LiveSiteProps {
  site: SiteView;
  task: string;
  /** Only the owner gets controls; a shared link is read-only. */
  auditId: string | null;
}

export function LiveSite({ site, task, auditId }: LiveSiteProps) {
  const status = siteStatus(site);
  const active = status.tone === "live";
  const logout = logoutNote(site.logout);

  return (
    <article
      aria-label={`${site.host}, ${status.label}`}
      className="flex flex-col gap-5 rounded-sm border border-rule bg-sheet p-4 sm:p-6"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-2xl font-semibold wrap-anywhere">{site.host}</h2>
        <p role="status" className={active ? "font-medium text-live" : "text-muted"}>
          {status.label}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Timeline site={site} active={active} />
        <LiveBrowser site={site} active={active} />
      </div>

      {site.signedIn && auditId && !site.finishedAt ? (
        <EarlySignOut auditId={auditId} site={site} />
      ) : null}
      {logout ? <p className="text-sm text-muted">{logout}</p> : null}
      {status.tone === "stopped" && auditId ? (
        <Link
          className="button w-fit"
          href={newAuditHref({ task, url: site.url, signIn: site.signedIn })}
        >
          Run this site again
        </Link>
      ) : null}
    </article>
  );
}
