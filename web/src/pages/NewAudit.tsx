import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { SignInPanel } from "../components/SignInPanel.tsx";
import { usePageTitle } from "../components/ui.tsx";
import type { NewAudit as NewAuditRequest } from "../lib/api.ts";
import { loginHint, signOut, startAudit } from "../lib/api.ts";
import { rememberSignIn } from "../lib/signInMemory.ts";
import type { PlannedSite } from "../lib/sites.ts";
import { addSite, MAX_SITES, parseSite } from "../lib/sites.ts";
import { navigate } from "../lib/useRoute.ts";

type FlowChoice = "auto" | NonNullable<NewAuditRequest["flow"]>;

const FLOWS: { value: FlowChoice; label: string; hint: string }[] = [
  { value: "auto", label: "Work it out from my task", hint: "Picks one of the two for you." },
  { value: "checkout", label: "Buying something", hint: "Stops before payment." },
  { value: "subscription", label: "Signing up for a plan", hint: "Records the renewal terms." },
];

/** Sites the agent has already been tested on. Any other address works the same way. */
const SUGGESTED = [
  "blinkit.com",
  "zomato.com",
  "croma.com",
  "flipkart.com",
  "myntra.com",
  "adobe.com/in",
  "spotify.com/in-en/premium",
];

function initialSites(url: string): PlannedSite[] {
  if (!url) return [];
  const parsed = parseSite(url);
  return parsed.ok ? [{ url: parsed.url, host: parsed.host, signInId: null }] : [];
}

interface SiteRowProps {
  site: PlannedSite;
  loginExpected: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onRemove: () => void;
}

function SiteRow({ site, loginExpected, onSignIn, onSignOut, onRemove }: SiteRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
      <div className="min-w-0">
        <p className="font-medium wrap-anywhere">{site.host}</p>
        <p className="text-sm text-muted">
          {site.signInId
            ? "Signed in for one check"
            : loginExpected
              ? "Guest. This site asked for a login last time, so signing in will show more."
              : "Guest"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4">
        {site.signInId ? (
          <button
            type="button"
            className="link inline-flex min-h-11 items-center"
            onClick={onSignOut}
          >
            Sign out<span className="sr-only"> of {site.host}</span>
          </button>
        ) : (
          <button
            type="button"
            className="link inline-flex min-h-11 items-center"
            onClick={onSignIn}
          >
            Sign in to see more<span className="sr-only"> on {site.host}</span>
          </button>
        )}
        <button type="button" className="link inline-flex min-h-11 items-center" onClick={onRemove}>
          Remove<span className="sr-only"> {site.host}</span>
        </button>
      </div>
    </li>
  );
}

interface NewAuditProps {
  prefill: { task: string; url: string; signIn: boolean };
}

export function NewAudit({ prefill }: NewAuditProps) {
  usePageTitle("New audit");
  const [task, setTask] = useState(prefill.task);
  const [flow, setFlow] = useState<FlowChoice>("auto");
  const [sites, setSites] = useState<PlannedSite[]>(() => initialSites(prefill.url));
  const [draft, setDraft] = useState("");
  const [siteError, setSiteError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hints, setHints] = useState<Record<string, boolean>>({});
  const [signingIn, setSigningIn] = useState<PlannedSite | null>(
    () => (prefill.signIn ? initialSites(prefill.url)[0] : undefined) ?? null,
  );

  const started = useRef(false);
  const latestSites = useRef(sites);
  latestSites.current = sites;

  // A sign-in that never reached a check should not sit at TinyFish until the sweep finds it.
  useEffect(
    () => () => {
      if (started.current) return;
      for (const { signInId } of latestSites.current) {
        if (signInId) void signOut(signInId).catch(() => undefined);
      }
    },
    [],
  );

  function checkHint(site: { url: string; host: string }) {
    loginHint(site.url).then(
      (needed) => setHints((current) => ({ ...current, [site.host]: needed })),
      () => undefined,
    );
  }

  function tryAdd(input: string): PlannedSite[] | null {
    const parsed = parseSite(input);
    if (!parsed.ok) {
      setSiteError(parsed.message);
      return null;
    }
    const added = addSite(sites, parsed);
    if (!added.ok) {
      setSiteError(added.message);
      return null;
    }
    setSiteError(null);
    setSites(added.sites);
    checkHint(parsed);
    return added.sites;
  }

  function addDraft() {
    if (tryAdd(draft)) setDraft("");
  }

  function setSignIn(host: string, signInId: string | null) {
    setSites((current) =>
      current.map((site) => (site.host === host ? { ...site, signInId } : site)),
    );
  }

  function endSignIn(site: PlannedSite) {
    if (site.signInId) void signOut(site.signInId).catch(() => undefined);
    setSignIn(site.host, null);
  }

  function remove(site: PlannedSite) {
    if (site.signInId) void signOut(site.signInId).catch(() => undefined);
    setSites((current) => current.filter((entry) => entry.host !== site.host));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const chosen = draft.trim() ? tryAdd(draft) : sites;
    if (draft.trim() && chosen) setDraft("");
    const wording = task.trim();
    const taskProblem = wording.length < 3 ? "Say what the agent should try to do." : null;
    setTaskError(taskProblem);
    if (!chosen || taskProblem) return;
    if (chosen.length === 0) {
      setSiteError("Add at least one site.");
      return;
    }

    setBusy(true);
    try {
      const audit = await startAudit({
        task: wording,
        ...(flow === "auto" ? {} : { flow }),
        sites: chosen.map(({ url, signInId }) => ({
          url,
          ...(signInId ? { signInId } : {}),
        })),
      });
      started.current = true;
      for (const { url, signInId } of chosen) {
        if (signInId) rememberSignIn(audit.id, url, signInId);
      }
      navigate(`/audits/${audit.id}`);
    } catch (error) {
      setBusy(false);
      setFormError(error instanceof Error ? error.message : "The audit could not start.");
    }
  }

  const suggestions = SUGGESTED.flatMap((address) => {
    const parsed = parseSite(address);
    return parsed.ok && !sites.some((site) => site.host === parsed.host)
      ? [{ address, host: parsed.host }]
      : [];
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold sm:text-4xl">New audit</h1>
      <p className="mt-1 max-w-prose text-muted">
        An agent walks each site like a customer and stops before payment. It is told never to pay
        or enter contact details, and the report flags any step that looks like it did.
      </p>

      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="mt-8 flex flex-col gap-8"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="task" className="text-lg font-semibold">
            What should the agent try to do?
          </label>
          <textarea
            id="task"
            rows={3}
            maxLength={300}
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="In your own words, for example: buy a 1 litre pack of milk"
            aria-invalid={taskError !== null}
            aria-describedby={taskError ? "task-error" : undefined}
            className="field"
          />
          {taskError ? (
            <p id="task-error" className="font-medium text-signal-deep">
              {taskError}
            </p>
          ) : null}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-lg font-semibold">What kind of flow is it?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {FLOWS.map((option) => (
              <label
                key={option.value}
                className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-sm border-2 bg-sheet p-3 hover:border-ink ${
                  flow === option.value ? "border-ink" : "border-rule"
                }`}
              >
                <input
                  type="radio"
                  name="flow"
                  value={option.value}
                  checked={flow === option.value}
                  onChange={() => setFlow(option.value)}
                  className="mt-1 accent-ink"
                />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-sm text-muted">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="site" className="text-lg font-semibold">
              Which sites?
            </label>
            <p className="text-muted">Up to {MAX_SITES}. Every site is a guest run by default.</p>
          </div>

          {sites.length > 0 ? (
            <ul className="divide-y divide-rule rounded-sm border border-rule bg-sheet px-3">
              {sites.map((site) => (
                <SiteRow
                  key={site.host}
                  site={site}
                  loginExpected={hints[site.host] === true}
                  onSignIn={() => setSigningIn(site)}
                  onSignOut={() => endSignIn(site)}
                  onRemove={() => remove(site)}
                />
              ))}
            </ul>
          ) : null}

          {sites.length < MAX_SITES ? (
            <>
              <div className="flex flex-wrap gap-2">
                <input
                  id="site"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    addDraft();
                  }}
                  placeholder="Any site address"
                  aria-invalid={siteError !== null}
                  aria-describedby={siteError ? "site-error" : undefined}
                  className="field min-w-0 flex-1 basis-56"
                />
                <button type="button" className="button" onClick={addDraft}>
                  Add site
                </button>
              </div>
              <div>
                <p className="text-sm text-muted">Sites we have tested</p>
                <ul className="mt-1 flex flex-wrap gap-x-1">
                  {suggestions.map(({ address, host }) => (
                    <li key={address}>
                      <button
                        type="button"
                        onClick={() => tryAdd(address)}
                        className="link inline-flex min-h-11 items-center px-1.5"
                      >
                        {host}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
          {siteError ? (
            <p id="site-error" className="font-medium text-signal-deep">
              {siteError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-3">
          {formError ? (
            <p role="alert" className="font-medium text-signal-deep">
              {formError}
            </p>
          ) : null}
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? "Starting the audit" : "Start audit"}
          </button>
        </div>
      </form>

      {signingIn ? (
        <SignInPanel
          url={signingIn.url}
          host={signingIn.host}
          onReady={(signIn) => {
            setSignIn(signingIn.host, signIn.id);
            setSigningIn(null);
          }}
          onClosed={() => setSigningIn(null)}
        />
      ) : null}
    </div>
  );
}
