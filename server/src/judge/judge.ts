import type { RunRecord } from "../tinyfish/types.ts";
import { buildBill } from "./bill.ts";
import type { Evidence } from "./evidence.ts";
import { parseEvidence } from "./evidence.ts";
import { checkQuote } from "./pageText.ts";
import { judgePattern, PATTERNS } from "./patterns.ts";
import { scanSafety } from "./safety.ts";
import { locateScreenshots } from "./screenshots.ts";
import { resolveReach, resolveStop } from "./stop.ts";
import { summariseSubscription } from "./subscription.ts";
import type {
  Bill,
  Flow,
  PatternFinding,
  PriceLabel,
  Screenshot,
  SiteReport,
  StopPoint,
} from "./types.ts";

export interface JudgeInput {
  flow: Flow;
  url: string;
  run: RunRecord;
  signedIn?: boolean;
  /** Text of every page captured during the run, from `htmlToText`. Null if none was. */
  pageText?: string | null;
}

const EMPTY_BILL: Bill = {
  currency: null,
  firstPrice: null,
  firstPriceStep: null,
  firstPriceSource: null,
  itemsTotal: null,
  charges: [],
  notInTotal: [],
  includedCharges: [],
  discounts: [],
  extras: [],
  total: null,
  addsUp: null,
  unexplained: null,
  linesOverTotal: null,
  increase: null,
  multiple: null,
};

const QUOTE_NOT_CONFIRMED =
  "This wording was not found in the saved page text, so rely on the screenshot.";

const STOP_WORDS = /\b(add|one|the|to|cart|bag|basket|click|select|item|first)\b/gi;

/** An item the agent added itself is the agent's mistake, not the site's. */
function dropOwnAdds(evidence: Evidence, actions: readonly string[]): Evidence {
  const addActions = actions.filter((action) => /\badd\b/i.test(action));
  const added = evidence.added.filter((item) => {
    const name = item.name.replace(STOP_WORDS, " ").toLowerCase();
    const words = name.split(/\W+/).filter((word) => word.length > 2);
    const own = addActions.some((action) =>
      words.every((word) => action.toLowerCase().includes(word)),
    );
    return !own;
  });
  return { ...evidence, added };
}

function priceLabel(stop: StopPoint, bill: Bill): PriceLabel {
  if (bill.total === null) return "none";
  if (stop === "payment_page") return "final";
  return stop === "login_wall" ? "price_before_sign_in" : "last_seen";
}

function describeMissing(
  run: RunRecord,
  stop: StopPoint,
  evidence: Evidence | null,
  bill: Bill,
  hidesFees: boolean,
): string[] {
  const missing: string[] = [];

  if (run.status === "CANCELLED") {
    missing.push("The run was stopped at our time limit before it finished.");
  }
  if (!evidence) {
    missing.push("The agent returned no results, so nothing from this run can be judged.");
    return missing;
  }
  if (stop !== "payment_page") {
    missing.push("The payment page was not reached, so anything added there is unknown.");
  }
  if (hidesFees) missing.push("The site shows no fees before sign-in.");
  if (evidence.pages.length === 0) {
    missing.push("The agent returned no list of pages, so no step can be shown.");
  }
  if (evidence.finalPrice !== null && bill.total === null) {
    missing.push(
      `The agent reported a final price of ${evidence.finalPrice}, but no bill backs it up, so it is not used.`,
    );
  }
  for (const fee of evidence.fees) {
    if (fee.amount === null) missing.push(`"${fee.name}" was listed with no amount.`);
  }
  for (const line of bill.notInTotal) {
    missing.push(`${line.name} of ${line.amount} was offered but is not in this total yet.`);
  }
  return missing;
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

export function judgeRun({
  flow,
  url,
  run,
  signedIn = false,
  pageText = null,
}: JudgeInput): SiteReport {
  const actions = run.steps.map((step) => step.action ?? "");
  const parsed = parseEvidence(run.result);
  const evidence = parsed && dropOwnAdds(parsed, actions);

  const stop = resolveStop(run, evidence);
  const bill = evidence ? buildBill(flow, evidence) : EMPTY_BILL;
  const reach = resolveReach(stop, evidence, evidence ? bill : null);
  const shots = locateScreenshots(evidence?.pages ?? [], run.steps);
  const screenshotFor = (step: number | null): Screenshot | null =>
    step === null ? null : (shots.get(step) ?? null);

  const context = { evidence, bill, stop, reach, actions };
  const patterns: PatternFinding[] = PATTERNS.map((definition) => {
    const draft = judgePattern(definition, context);
    const quoteCheck = draft.quote === null ? null : checkQuote(draft.quote, pageText);
    return {
      id: definition.id,
      label: definition.label,
      ...draft,
      quoteCheck,
      note: quoteCheck === "not_matched" ? `${draft.note} ${QUOTE_NOT_CONFIRMED}` : draft.note,
      soFar: draft.status === "not_found" && stop !== "payment_page",
      screenshot: screenshotFor(draft.step),
    };
  });

  const wall = stop === "login_wall";
  const hidesFees = wall && bill.total === null;

  return {
    url,
    host: hostOf(url),
    flow,
    signedIn,
    runId: run.run_id,
    item: evidence?.itemName ?? evidence?.planName ?? null,
    origin: evidence?.origin ?? null,
    destination: evidence?.destination ?? null,
    stop: {
      at: stop,
      claimed: evidence?.stoppedAt ?? null,
      note: evidence?.stopNote ?? run.error?.message ?? null,
      reach,
    },
    priceLabel: priceLabel(stop, bill),
    bill,
    subscription: flow === "subscription" && evidence ? summariseSubscription(evidence) : null,
    patterns,
    pages: (evidence?.pages ?? []).map((page) => ({
      ...page,
      screenshot: screenshotFor(page.step),
    })),
    flags: scanSafety(run.steps, evidence),
    missing: describeMissing(run, stop, evidence, bill, hidesFees),
    login: {
      wallAt: wall ? (evidence?.loginWallAt ?? null) : null,
      hidesFees,
      offerSignIn: wall && !signedIn,
    },
  };
}
