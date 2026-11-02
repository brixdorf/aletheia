import type { RunRecord } from "../tinyfish/types.ts";
import { buildBill } from "./bill.ts";
import type { Evidence } from "./evidence.ts";
import { parseEvidence } from "./evidence.ts";
import type { PageCapture } from "./pageText.ts";
import { locateQuote } from "./pageText.ts";
import type { Draft } from "./patterns.ts";
import { judgePattern, PATTERNS, UNCONFIRMED } from "./patterns.ts";
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

/** Raised when the rules change, so reports saved under older ones are judged again. */
export const RULES_VERSION = 3;

export interface JudgeInput {
  flow: Flow;
  url: string;
  run: RunRecord;
  signedIn?: boolean;
  /** The pages saved during the run. A finding needs its words on one of them. */
  captures?: readonly PageCapture[];
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

/** A subscription whose terms were all seen by the login wall has nothing more to give. */
function termsSettled(flow: Flow, evidence: Evidence | null): boolean {
  if (flow !== "subscription" || !evidence) return false;
  return (["renewal", "cancellation"] as const).every((name) =>
    evidence.terms.some(
      ({ term, quote, shownWhere }) => term === name && quote && shownWhere !== "not_shown",
    ),
  );
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

interface RunPages {
  steps: readonly RunRecord["steps"][number][];
  captures: readonly PageCapture[];
  shots: ReadonlyMap<number, Screenshot>;
}

function pageOfStep({ steps, shots }: RunPages, stepId: string): number | null {
  const position = (id: string) => steps.findIndex((step) => step.id === id);
  const at = position(stepId);
  let page: number | null = null;
  for (const [number, shot] of shots) {
    if (position(shot.stepId) <= at) page = number;
  }
  return page ?? shots.keys().next().value ?? null;
}

/**
 * The last word on what a reader may see. A claim whose words are not on a saved page with a
 * screenshot goes no further, and the page that holds the words picks the screenshot.
 */
function confirmed(draft: Draft, pages: RunPages): Draft & { screenshot: Screenshot | null } {
  const { steps, captures, shots } = pages;
  const named = draft.step === null ? null : (shots.get(draft.step)?.stepId ?? null);
  if (draft.status !== "found") {
    return { ...draft, screenshot: draft.step === null ? null : (shots.get(draft.step) ?? null) };
  }

  for (const anchor of draft.anchors) {
    const stepId = locateQuote(anchor, captures, named);
    const page = captures.find((capture) => capture.stepId === stepId);
    const step = steps.find((entry) => entry.id === stepId);
    if (!stepId || !page || !step?.screenshot) continue;
    if (draft.alongside.some((words) => locateQuote(words, [page]) === null)) continue;
    return {
      ...draft,
      step: stepId === named ? draft.step : (pageOfStep(pages, stepId) ?? draft.step),
      screenshot: { stepId, action: step.action },
    };
  }
  return {
    ...draft,
    status: "not_checked",
    quote: null,
    step: null,
    amounts: [],
    note: UNCONFIRMED,
    screenshot: null,
  };
}

export function judgeRun({
  flow,
  url,
  run,
  signedIn = false,
  captures = [],
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

  const context = { flow, evidence, bill, stop, reach, captures };
  const pages = { steps: run.steps, captures, shots };
  const patterns: PatternFinding[] = PATTERNS.map((definition) => {
    const { status, quote, step, amounts, note, screenshot } = confirmed(
      judgePattern(definition, context),
      pages,
    );
    return {
      id: definition.id,
      label: definition.label,
      group: definition.group,
      severity: definition.severity,
      status,
      quote,
      step,
      amounts,
      note,
      soFar: status === "not_found" && stop !== "payment_page",
      screenshot,
    };
  });

  const wall = stop === "login_wall";
  const hidesFees = wall && bill.total === null;

  return {
    rules: RULES_VERSION,
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
      offerSignIn: wall && !signedIn && !termsSettled(flow, evidence),
    },
  };
}
