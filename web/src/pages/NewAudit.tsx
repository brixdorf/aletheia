import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { ArrowLeft, Cross } from "../components/icons.tsx";
import { SignInPanel } from "../components/SignInPanel.tsx";
import { Link, SiteAvatar, usePageTitle } from "../components/ui.tsx";
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
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[14px] bg-wash py-1.5 pr-1.5 pl-3">
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-2.5">
        <SiteAvatar host={site.host} />
        <div className="min-w-0">
          <p className="font-medium wrap-anywhere text-ink">{site.host}</p>
          <p className="text-[13px] text-mute">
            {site.signInId
              ? "Signed in for one check"
              : loginExpected
                ? "Guest. This site asked for a login last time, so signing in will show more."
                : "Guest"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {site.signInId ? (
          <button type="button" className="btn btn-soft btn-sm" onClick={onSignOut}>
            Sign out<span className="sr-only"> of {site.host}</span>
          </button>
        ) : (
          <button type="button" className="btn btn-soft btn-sm" onClick={onSignIn}>
            Sign in to see more<span className="sr-only"> on {site.host}</span>
          </button>
        )}
        <button
          type="button"
          className="round-button"
          aria-label={`Remove ${site.host}`}
          onClick={onRemove}
        >
          <Cross />
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

  // A site filled in from the dashboard gets the same sign-in offer as one added here.
  useEffect(() => {
    for (const site of initialSites(prefill.url)) checkHint(site);
  }, [prefill.url]);

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
    <div className="relative flex flex-col items-center gap-3.5 pt-2">
      <div aria-hidden="true" className="aurora" />
      <div className="rise card w-full max-w-[560px] p-5 sm:p-7">
        <div className="flex justify-end">
          <Link href="/" aria-label="Close and go back to your audits" className="round-button">
            <Cross />
          </Link>
        </div>
        <div className="text-center">
          <h1 className="text-[28px]/[1.1]">New audit</h1>
          <p className="mx-auto mt-2 max-w-md text-body">
            An agent walks each site like a customer and stops before payment. It is told never to
            pay or enter contact details, and the report flags any step that looks like it did.
          </p>
        </div>

        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className="mt-6 flex flex-col gap-6"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="task" className="font-semibold text-ink">
              What should the agent try to do?
            </label>
            <textarea
              id="task"
              rows={2}
              maxLength={300}
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="In your own words, for example: buy a 1 litre pack of milk"
              aria-invalid={taskError !== null}
              aria-describedby={taskError ? "task-error" : undefined}
              className="field resize-y"
            />
            {taskError ? (
              <p id="task-error" className="font-medium text-peach-ink">
                {taskError}
              </p>
            ) : null}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold text-ink">What kind of flow is it?</legend>
            <div className="mt-2 grid gap-2">
              {FLOWS.map((option) => (
                <label
                  key={option.value}
                  className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[14px] border px-3.5 py-2.5 transition-colors ${
                    flow === option.value
                      ? "border-ink bg-white"
                      : "border-line bg-wash hover:border-dash"
                  }`}
                >
                  <input
                    type="radio"
                    name="flow"
                    value={option.value}
                    checked={flow === option.value}
                    onChange={() => setFlow(option.value)}
                    className="accent-ink"
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{option.label}</span>{" "}
                    <span className="text-[13px] text-mute">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="site" className="font-semibold text-ink">
                Which sites?
              </label>
              <p className="text-[13px] text-mute">
                Up to {MAX_SITES}. Every site is a guest run by default.
              </p>
            </div>

            {sites.length > 0 ? (
              <ul className="flex flex-col gap-2">
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
                <div className="flex gap-2">
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
                    className="field min-w-0 flex-1"
                  />
                  <button type="button" className="btn btn-soft shrink-0" onClick={addDraft}>
                    Add site
                  </button>
                </div>
                {suggestions.length > 0 ? (
                  <div>
                    <p className="text-[13px] text-mute">Sites we have tested</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {suggestions.map(({ address, host }) => (
                        <li key={address}>
                          <button
                            type="button"
                            onClick={() => tryAdd(address)}
                            className="btn btn-soft btn-sm px-3 text-[13px]"
                          >
                            {host}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}
            {siteError ? (
              <p id="site-error" className="font-medium text-peach-ink">
                {siteError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            {formError ? (
              <p role="alert" className="font-medium text-peach-ink">
                {formError}
              </p>
            ) : null}
            <button type="submit" className="btn btn-dark w-full" disabled={busy}>
              {busy ? "Starting the audit" : "Start audit"}
            </button>
            <p className="text-center text-[13px] text-mute">
              Your sign-ins and audits stay tied to this browser.
            </p>
          </div>
        </form>
      </div>

      <Link href="/" className="back-pill">
        <ArrowLeft />
        Back
      </Link>

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
