import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { Cross } from "../components/icons.tsx";
import { SignInPanel } from "../components/SignInPanel.tsx";
import { SiteAvatar, usePageTitle } from "../components/ui.tsx";
import { loginHint, signOut, startAudit } from "../lib/api.ts";
import { pickedSites, planNote } from "../lib/plan.ts";
import { rememberSignIn } from "../lib/signInMemory.ts";
import type { PlannedSite } from "../lib/sites.ts";
import { addSite, MAX_SITES, parseSite } from "../lib/sites.ts";
import type { Flow } from "../lib/types.ts";
import { useAuditPlan } from "../lib/useAuditPlan.ts";
import { navigate } from "../lib/useRoute.ts";

const FLOW_LABEL: Record<Flow, string> = { checkout: "Checkout", subscription: "Subscription" };

function pinnedSite(url: string): PlannedSite | null {
  if (!url) return null;
  const parsed = parseSite(url);
  return parsed.ok ? { url: parsed.url, host: parsed.host, signInId: null } : null;
}

interface SiteChipProps {
  site: PlannedSite;
  loginExpected: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onRemove: () => void;
}

function SiteChip({ site, loginExpected, onSignIn, onSignOut, onRemove }: SiteChipProps) {
  return (
    <li className="site-chip">
      <SiteAvatar host={site.host} small />
      <span className="min-w-0 truncate">{site.host}</span>
      {site.signInId ? (
        <button type="button" className="site-chip-action" onClick={onSignOut}>
          Sign out<span className="sr-only"> of {site.host}</span>
        </button>
      ) : (
        <button
          type="button"
          className={`site-chip-action ${loginExpected ? "text-ink" : ""}`}
          title="Sign in to see more"
          onClick={onSignIn}
        >
          Sign in<span className="sr-only"> to see more on {site.host}</span>
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
    </li>
  );
}

interface HomeProps {
  prefill: { task: string; url: string; signIn: boolean };
}

export function Home({ prefill }: HomeProps) {
  usePageTitle("Aletheia");
  const [task, setTask] = useState(prefill.task);
  const [countryChoice, setCountryChoice] = useState<string | null>(null);
  const [flowChoice, setFlowChoice] = useState<Flow | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<PlannedSite[]>(() => {
    const pinned = pinnedSite(prefill.url);
    return pinned ? [pinned] : [];
  });
  const [signIns, setSignIns] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [siteError, setSiteError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hints, setHints] = useState<Record<string, boolean>>({});
  const [signingIn, setSigningIn] = useState<PlannedSite | null>(() =>
    prefill.signIn ? pinnedSite(prefill.url) : null,
  );

  const { plan, pending, failed } = useAuditPlan(task, countryChoice);
  // A site carried over from a report is the whole audit, so the planner stays out of it.
  const pinned = pinnedSite(prefill.url) !== null;
  const picks = pinned ? [] : (plan?.sites ?? []);
  const sites = pickedSites(picks, { removed, added, signIns });
  const edited = pinned || removed.length > 0 || added.length > 0;
  const hasSignIn = Object.keys(signIns).length > 0;

  const started = useRef(false);
  const latestSignIns = useRef(signIns);
  latestSignIns.current = signIns;

  // A sign-in that never reached a check should not sit at TinyFish until the sweep finds it.
  useEffect(
    () => () => {
      if (started.current) return;
      for (const signInId of Object.values(latestSignIns.current)) {
        void signOut(signInId).catch(() => undefined);
      }
    },
    [],
  );

  const hosts = sites.map(({ host }) => host).join(" ");
  useEffect(() => {
    for (const site of sites) {
      if (hints[site.host] !== undefined) continue;
      loginHint(site.url).then(
        (needed) => setHints((current) => ({ ...current, [site.host]: needed })),
        () => undefined,
      );
    }
  }, [hosts]);

  function addDraft() {
    const parsed = parseSite(draft);
    const next = parsed.ok ? addSite(sites, parsed) : parsed;
    if (!next.ok) {
      setSiteError(next.message);
      return;
    }
    if (!parsed.ok) return;
    setSiteError(null);
    setDraft("");
    setAdding(false);
    setRemoved((current) => current.filter((host) => host !== parsed.host));
    setAdded((current) => [...current, { ...parsed, signInId: null }]);
  }

  function endSignIn(host: string) {
    const signInId = signIns[host];
    if (signInId) void signOut(signInId).catch(() => undefined);
    setSignIns(({ [host]: _ended, ...others }) => others);
  }

  function remove({ host }: PlannedSite) {
    endSignIn(host);
    setRemoved((current) => [...current, host]);
    setAdded((current) => current.filter((site) => site.host !== host));
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setFormError(null);

    const wording = task.trim();
    const taskProblem = wording.length < 3 ? "Say what you want to buy or subscribe to." : null;
    setTaskError(taskProblem);
    if (taskProblem) return;

    // With nothing edited the server can plan for itself, even if our own plan is still on its way.
    const letServerPick = !edited && !hasSignIn && (pending || !plan);
    if (!letServerPick && sites.length === 0) {
      setSiteError("Add at least one site.");
      setAdding(true);
      return;
    }

    setBusy(true);
    try {
      const flow = flowChoice ?? (pending ? null : plan?.flow);
      const audit = await startAudit({
        task: wording,
        ...(flow ? { flow } : {}),
        ...(countryChoice ? { country: countryChoice } : {}),
        ...(letServerPick
          ? {}
          : {
              sites: sites.map(({ url, signInId }) => ({
                url,
                ...(signInId ? { signInId } : {}),
              })),
            }),
      });
      started.current = true;
      for (const { url, signInId } of sites) {
        if (signInId) rememberSignIn(audit.id, url, signInId);
      }
      navigate(`/audits/${audit.id}`);
    } catch (error) {
      setBusy(false);
      setFormError(error instanceof Error ? error.message : "The audit could not start.");
    }
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void submit();
  }

  const note = plan && !pinned && !edited ? planNote(plan) : null;
  const typed = task.trim().length >= 3;
  const countryOff =
    plan && plan.country !== null && !plan.proxied
      ? `TinyFish cannot browse from ${plan.countryName}, so prices may differ. The report will say so.`
      : null;

  return (
    <div className="relative flex flex-col items-center pt-6 text-center sm:pt-14">
      <div aria-hidden="true" className="aurora" />

      <h1 className="max-w-[720px] text-[38px]/[1.06] tracking-[-0.035em] sm:text-[56px]/[1.04]">
        See what a site hides <span className="accent">before</span> you pay.
      </h1>

      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="mt-7 flex w-full flex-col items-center gap-4 sm:mt-9"
      >
        <div className="rise prompt-card">
          <label htmlFor="task" className="text-sm font-medium text-mute">
            What do you want to buy or subscribe to?
          </label>
          <textarea
            id="task"
            rows={3}
            maxLength={300}
            value={task}
            onChange={(event) => setTask(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="Buy a 500 ml pack of toned milk"
            aria-invalid={taskError !== null}
            aria-describedby={taskError ? "task-error" : undefined}
            className="prompt-field mt-1.5"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {taskError ? (
              <p id="task-error" className="font-medium text-peach-ink">
                {taskError}
              </p>
            ) : (
              <p className="text-[13px] text-mute">Aletheia picks the sites from your words.</p>
            )}
            <button type="submit" className="btn btn-ring ml-auto px-[26px]" disabled={busy}>
              {busy ? "Starting the audit" : "Run audit"}
            </button>
          </div>
        </div>

        <div className="flex w-full max-w-[720px] flex-col items-center gap-2.5">
          {sites.length > 0 ? (
            <ul aria-label="Sites to audit" className="flex flex-wrap justify-center gap-2">
              {sites.map((site) => (
                <SiteChip
                  key={site.host}
                  site={site}
                  loginExpected={hints[site.host] === true}
                  onSignIn={() => setSigningIn(site)}
                  onSignOut={() => endSignIn(site.host)}
                  onRemove={() => remove(site)}
                />
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-mute">
            {pending && typed ? (
              <span role="status" className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="spinner size-3" />
                Picking sites
              </span>
            ) : note ? (
              <span>{note}</span>
            ) : null}
            {failed && !pending ? (
              <span role="status">Could not pick sites yet. Run audit will try again.</span>
            ) : null}
            {sites.length < MAX_SITES && !adding ? (
              <button
                type="button"
                className="link inline-flex min-h-11 items-center sm:min-h-6"
                onClick={() => setAdding(true)}
              >
                Add a site
              </button>
            ) : null}
          </div>

          {adding ? (
            <div className="flex w-full max-w-[420px] gap-2">
              <label htmlFor="site" className="sr-only">
                Site address
              </label>
              <input
                id="site"
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addDraft();
                  }
                  if (event.key === "Escape") setAdding(false);
                }}
                placeholder="Any site address"
                aria-invalid={siteError !== null}
                aria-describedby={siteError ? "site-error" : undefined}
                className="field min-w-0 flex-1 py-1.5"
              />
              <button type="button" className="btn btn-soft btn-sm shrink-0" onClick={addDraft}>
                Add site
              </button>
            </div>
          ) : null}
          {siteError ? (
            <p id="site-error" className="font-medium text-peach-ink">
              {siteError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-center gap-2">
            {plan ? (
              <label className="choice-pill">
                Country
                <select
                  value={countryChoice ?? plan.country ?? "ZZ"}
                  onChange={(event) => setCountryChoice(event.target.value)}
                >
                  {plan.countries.map(({ code, name }) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="choice-pill">
              Flow
              <select
                value={flowChoice ?? plan?.flow ?? "checkout"}
                onChange={(event) => setFlowChoice(event.target.value as Flow)}
              >
                {(["checkout", "subscription"] as const).map((value) => (
                  <option key={value} value={value}>
                    {FLOW_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {countryOff ? <p className="text-[13px] text-mute">{countryOff}</p> : null}
        </div>

        {formError ? (
          <p role="alert" className="font-medium text-peach-ink">
            {formError}
          </p>
        ) : null}
      </form>

      <p className="mt-8 max-w-[560px] text-[13px] text-mute">
        An agent walks each site like a customer and stops before payment. It is told never to pay
        or enter contact details, and the report flags any step that looks like it did. Every site
        is a guest run unless you sign in, for one check only. Your audits stay tied to this
        browser.
      </p>

      {signingIn ? (
        <SignInPanel
          url={signingIn.url}
          host={signingIn.host}
          country={countryChoice ?? plan?.country ?? null}
          onReady={(signIn) => {
            setSignIns((current) => ({ ...current, [signingIn.host]: signIn.id }));
            setSigningIn(null);
          }}
          onClosed={() => setSigningIn(null)}
        />
      ) : null}
    </div>
  );
}
