import type { FormEvent } from "react";
import { useState } from "react";

import { newAuditHref } from "../lib/route.ts";
import { parseSite } from "../lib/sites.ts";
import { navigate } from "../lib/useRoute.ts";

/** Real results from our test runs on 29 and 31 Oct 2026. */
const EVIDENCE = [
  {
    where: "Blinkit cart, step 4",
    what: "High demand surge charge Rs 30",
    place: "float-1",
  },
  {
    where: "Adobe, second page",
    what: "“Fee applies of half your remaining annual commitment”",
    place: "float-2",
  },
  { where: "Zomato bill", what: "Platform fee Rs 14.99", place: "float-3" },
  { where: "Croma cart", what: "Rs 549 shown, Rs 549 to pay", place: "float-4" },
];

const TESTED = ["blinkit.com", "zomato.com", "croma.com", "adobe.com/in", "flipkart.com"];

export function Hero() {
  const [site, setSite] = useState("");
  const [task, setTask] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = site.trim() ? parseSite(site) : null;
    if (parsed && !parsed.ok) {
      setError(parsed.message);
      return;
    }
    navigate(newAuditHref({ task: task.trim(), url: parsed?.url ?? "", signIn: false }));
  }

  return (
    <section className="relative pt-8 pb-10 text-center sm:pt-[50px] sm:pb-[70px]">
      <div aria-hidden="true" className="aurora" />

      <ul aria-label="Evidence from our test runs" className="hidden min-[1300px]:contents">
        {EVIDENCE.map(({ where, what, place }) => (
          <li key={where} className={`rise card float ${place}`}>
            <p className="text-xs text-mute">{where}</p>
            <p className="mt-0.5 text-[15px]/snug font-semibold text-ink">{what}</p>
          </li>
        ))}
      </ul>

      <p className="inline-block rounded-full border border-line bg-white px-[13px] py-[5px] text-[13px] text-[#4b5b70]">
        Checks the 13 dark patterns India banned in 2023
      </p>
      <h1 className="mx-auto mt-[22px] max-w-[820px] text-[44px]/[1.04] tracking-[-0.035em] sm:text-[72px]/[1.02]">
        See what a site hides <span className="accent">before</span> you pay.
      </h1>
      <p className="mx-auto mt-[22px] max-w-[560px] text-base text-body sm:text-lg">
        An agent goes through the checkout like a customer, stops before payment, and brings back
        proof for every finding.
      </p>

      <form noValidate onSubmit={submit} className="audit-bar">
        <div className="audit-bar-fields">
          <label className="sr-only" htmlFor="hero-site">
            Site address
          </label>
          <input
            id="hero-site"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={site}
            onChange={(event) => {
              setSite(event.target.value);
              setError(null);
            }}
            placeholder="blinkit.com"
            aria-invalid={error !== null}
            aria-describedby={error ? "hero-error" : undefined}
            className="audit-bar-site"
          />
          <span aria-hidden="true" className="audit-bar-slash">
            /
          </span>
          <label className="sr-only" htmlFor="hero-task">
            What the agent should try to do
          </label>
          <input
            id="hero-task"
            type="text"
            maxLength={300}
            autoComplete="off"
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="buy 500 ml toned milk"
            className="audit-bar-task"
          />
        </div>
        <button type="submit" className="btn btn-ring shrink-0 px-[26px] py-3.5 text-base">
          Run audit
        </button>
      </form>
      {error ? (
        <p id="hero-error" role="alert" className="mt-3 font-medium text-peach-ink">
          {error}
        </p>
      ) : null}

      <div className="mt-[18px] flex flex-wrap items-center justify-center gap-x-3 text-[13px] text-mute">
        <span id="tested-on">Tested on</span>
        <ul aria-labelledby="tested-on" className="contents">
          {TESTED.map((address) => (
            <li key={address}>
              <button
                type="button"
                onClick={() => {
                  setSite(address);
                  setError(null);
                }}
                className="inline-flex min-h-11 items-center font-medium text-text hover:underline hover:underline-offset-4 sm:min-h-6"
              >
                {address.split("/")[0]}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
