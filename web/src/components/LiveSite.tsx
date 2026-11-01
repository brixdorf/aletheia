import { useEffect, useState } from "react";

import { signOut } from "../lib/api.ts";
import { ago } from "../lib/format.ts";
import { siteStatus } from "../lib/live.ts";
import { logoutNote } from "../lib/report.ts";
import { newAuditHref } from "../lib/route.ts";
import { recallSignIn } from "../lib/signInMemory.ts";
import { siteName } from "../lib/sites.ts";
import type { PatternStatus, SiteView } from "../lib/types.ts";
import { Link, PatternStrip, SiteAvatar } from "./ui.tsx";

const NOT_YET: PatternStatus[] = Array.from({ length: 13 }, () => "not_checked");
const TICK_MS = 1000;

function LivePill() {
  return (
    <span className="pill pill-live">
      <span aria-hidden="true" className="dot" />
      Live
    </span>
  );
}

function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

function Timeline({ site, active }: { site: SiteView; active: boolean }) {
  const now = useNow(active);
  const stepCount = site.steps.length;

  if (stepCount === 0 && site.state === "queued") {
    return <p className="py-3 text-mute">Steps show up here once an agent picks this site up.</p>;
  }

  const newestFirst = site.steps
    .map((step, index) => ({ ...step, number: index + 1 }))
    .toReversed();

  return (
    <ol
      // A long run scrolls inside its card, so keyboard users need to be able to reach it.
      tabIndex={0}
      aria-label={`Steps on ${site.host}`}
      className="flex max-h-[300px] min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto"
    >
      {site.state === "writing_up" ? (
        <li className="flex gap-2.5 py-2.5">
          <span aria-hidden="true" className="w-5 shrink-0 font-mono text-[13px] text-mute">
            +
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-medium text-ink">Writing up the report</span>
            <span className="block text-[13px] text-mute">
              The agent has finished walking the site. This part can take a few minutes.
            </span>
          </span>
        </li>
      ) : null}
      {stepCount === 0 ? <li className="py-3 text-mute">The agent is opening the site.</li> : null}
      {newestFirst.map((step) => {
        const newest = active && site.state === "running" && step.number === stepCount;
        return (
          <li key={`${step.at}-${step.number}`} className="flex items-baseline gap-2.5 py-2.5">
            <span className="w-5 shrink-0 font-mono text-[13px] text-mute">{step.number}</span>
            <span className={`min-w-0 flex-1 ${newest ? "font-medium text-ink" : "text-text"}`}>
              {step.text}
            </span>
            <span className="num shrink-0 text-xs text-mute">{ago(step.at, now)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function LiveBrowser({ site }: { site: SiteView }) {
  const { streamingUrl, host, state } = site;
  const waiting =
    state === "queued"
      ? "The live browser opens when an agent is free."
      : state === "running"
        ? "Connecting to the live browser."
        : "The browser has closed.";

  return (
    <figure className="card min-w-0 p-2">
      {streamingUrl ? (
        <iframe
          src={streamingUrl}
          title={`Live browser on ${host}`}
          referrerPolicy="no-referrer"
          className="aspect-[16/10] w-full rounded-[14px] bg-wash"
        />
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center rounded-[14px] bg-wash p-4 text-center text-mute">
          {waiting}
        </div>
      )}
      <figcaption className="flex min-h-9 items-center justify-between gap-3 px-2.5 pt-2 pb-0.5 text-[13px] text-mute">
        <span className="min-w-0 truncate">Live browser, {host}</span>
        {streamingUrl ? (
          <a className="link shrink-0" href={streamingUrl} target="_blank" rel="noreferrer">
            Open in a new tab
          </a>
        ) : null}
      </figcaption>
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
      <p role="status" className="text-[13px] text-mute">
        Stopping the check and signing out.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn btn-soft btn-sm"
        disabled={state === "busy"}
        onClick={() => void stop(signInId)}
      >
        Sign out and stop this check
      </button>
      {state === "failed" ? (
        <p role="alert" className="text-[13px] text-peach-ink">
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
  // The run reports no results until it ends, so the strip stays open and then fills in once.
  const statuses = site.report?.patterns.map(({ status: value }) => value);

  return (
    <article aria-label={`${site.host}, ${status.label}`} className="rise flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <SiteAvatar host={site.host} />
        <div className="min-w-0">
          <h2 className="text-2xl wrap-anywhere">{siteName(site.host)}</h2>
          <p role="status" className="text-mute">
            {status.label}
          </p>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <LiveBrowser site={site} />

        <section aria-label="Agent steps" className="card flex flex-col px-[18px] pt-4 pb-3.5">
          <div className="flex items-center justify-between gap-3 pb-1">
            <h3 className="text-sm tracking-normal">Agent steps</h3>
            {active ? <LivePill /> : null}
          </div>
          <Timeline site={site} active={active} />
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-3">
            <PatternStrip statuses={statuses ?? NOT_YET} fill={statuses !== undefined} />
            <span className="text-xs text-mute">
              {statuses ? "Results are in" : "13 patterns to check"}
            </span>
          </div>
        </section>
      </div>

      {site.signedIn && auditId && !site.finishedAt ? (
        <EarlySignOut auditId={auditId} site={site} />
      ) : null}
      {logout ? <p className="text-[13px] text-mute">{logout}</p> : null}
      {status.tone === "stopped" && auditId ? (
        <Link
          className="btn btn-soft w-fit"
          href={newAuditHref({ task, url: site.url, signIn: site.signedIn })}
        >
          Run this site again
        </Link>
      ) : null}
    </article>
  );
}
