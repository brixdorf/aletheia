import { money, plural } from "./format.ts";
import { billMismatch, counts, headline, orderedPatterns, stopSummary } from "./report.ts";
import type { AuditSummary, PatternFinding, Screenshot, SiteReport } from "./types.ts";

/** Writes "Drip Pricing" as "Drip pricing". Only the first word keeps its capitals, as in SaaS. */
export function patternName(label: string): string {
  const [first = "", ...rest] = label.split(" ");
  return [first, ...rest.map((word) => word.toLowerCase())].join(" ");
}

const found = (report: SiteReport, id: PatternFinding["id"]) =>
  report.patterns.find((entry) => entry.id === id && entry.status === "found") ?? null;

const strongest = (report: SiteReport) => {
  const first = orderedPatterns(report)[0];
  return first?.status === "found" ? first : null;
};

const grew = ({ bill }: SiteReport) =>
  bill.firstPrice !== null && bill.total !== null && (bill.increase ?? 0) > 0;

function renewal({ subscription }: SiteReport) {
  if (!subscription) return null;
  const { introPrice, priceAfterIntro } = subscription;
  if (introPrice === null || priceAfterIntro === null || priceAfterIntro <= introPrice) return null;
  return { ...subscription, introPrice, priceAfterIntro };
}

function periodSuffix(billingPeriod: string | null): string {
  if (!billingPeriod) return "";
  if (/month/i.test(billingPeriod)) return "/mo";
  return /year|annual/i.test(billingPeriod) ? "/yr" : "";
}

export interface PriceJump {
  from: number | null;
  to: number | null;
  suffix: string;
  currency: string | null;
}

/** The two prices a row of the audit list shows: what was shown, then what it became. */
export function priceJump(report: SiteReport): PriceJump {
  const { bill } = report;
  const after = renewal(report);
  if (grew(report)) {
    return { from: bill.firstPrice, to: bill.total, suffix: "", currency: bill.currency };
  }
  if (after) {
    return {
      from: after.introPrice,
      to: after.priceAfterIntro,
      suffix: periodSuffix(after.billingPeriod),
      currency: bill.currency,
    };
  }
  return { from: null, to: bill.total, suffix: "", currency: bill.currency };
}

export interface Story {
  /** Sets the wash behind the bill and the badge colour. */
  tone: "found" | "open" | "clear";
  badge: string;
  lead: string;
  /** The one word set in the serif accent. */
  accent: string;
  tail: string;
  body: string;
  /** The finding the headline is about. Its row in the grid stays folded. */
  finding: PatternFinding | null;
  quote: string | null;
}

function findingBadge(finding: PatternFinding | null, fallback: string): string {
  return finding ? `${patternName(finding.label)}, found` : fallback;
}

function quoteOf(finding: PatternFinding | null, currency: string | null): string | null {
  if (!finding) return null;
  if (finding.quote) return finding.quote;
  const largest = finding.amounts.toSorted((a, b) => b.amount - a.amount)[0];
  return largest ? `${largest.label} ${money(largest.amount, currency)}` : null;
}

function billStory(report: SiteReport): Story {
  const { bill } = report;
  const finding = found(report, "drip_pricing") ?? strongest(report);
  const late = lateCharges(report);
  const added = late === 1 ? "1 charge shows up" : `${late} charges show up`;
  const where =
    bill.firstPriceSource === "product_page"
      ? `None of ${late === 1 ? "it" : "them"} was on the product page`
      : `None of ${late === 1 ? "it" : "them"} was in the first price`;
  const times =
    bill.multiple === null
      ? ""
      : `, so the price you pay is ${bill.multiple.toFixed(1)} times the price you were shown`;
  return {
    tone: "found",
    badge: findingBadge(finding, "Price went up"),
    lead: `${money(bill.increase ?? 0, bill.currency)} appeared`,
    accent: "after",
    tail: "you chose.",
    body: `${added} after the first price. ${where}${times}.`,
    finding,
    quote: quoteOf(finding, bill.currency),
  };
}

function renewalStory(report: SiteReport, after: NonNullable<ReturnType<typeof renewal>>): Story {
  const { currency } = report.bill;
  const finding = found(report, "subscription_trap") ?? strongest(report);
  const gap = Math.round((after.priceAfterIntro - after.introPrice) * 100) / 100;
  const period = after.introPeriod ?? "the offer";
  const times =
    after.renewalMultiple === null ? "" : `, ${after.renewalMultiple.toFixed(1)} times as much`;
  return {
    tone: "found",
    badge: findingBadge(finding, "Price goes up"),
    lead: `${money(gap, currency)} more`,
    accent: "after",
    tail: `${period}.`,
    body: `The site leads with ${money(after.introPrice, currency)} for ${period}. Then you pay ${money(after.priceAfterIntro, currency)}${times}.`,
    finding,
    quote: quoteOf(finding, currency),
  };
}

/** The headline, wash and copy of a report, all of it taken from what the run proved. */
export function story(report: SiteReport): Story {
  const lead = headline(report);
  const after = renewal(report);
  if (lead.kind === "price")
    return after && !grew(report) ? renewalStory(report, after) : billStory(report);

  if (lead.kind === "finding") {
    const finding = strongest(report);
    return {
      tone: "found",
      badge: findingBadge(finding, lead.title),
      lead: patternName(lead.title),
      accent: "seen",
      tail: "with proof.",
      body: lead.detail,
      finding,
      quote: quoteOf(finding, report.bill.currency),
    };
  }

  const quiet = { finding: null, quote: null };
  if (report.login.hidesFees) {
    return {
      ...quiet,
      tone: "open",
      badge: "Fees behind a login",
      lead: "The fees are",
      accent: "hidden",
      tail: "behind a login.",
      body: stopSummary(report),
    };
  }
  if (lead.kind === "open" && report.bill.total !== null) {
    return {
      ...quiet,
      tone: "clear",
      badge: "Nothing hidden so far",
      lead: "No fee added",
      accent: "so far",
      tail: ".",
      body: stopSummary(report),
    };
  }
  if (lead.kind === "open") {
    const { notChecked } = counts(report);
    return {
      ...quiet,
      tone: "open",
      badge: "Not checked",
      lead: `${notChecked} of 13`,
      accent: "not",
      tail: "checked.",
      body: lead.detail,
    };
  }
  return {
    ...quiet,
    tone: "clear",
    badge: "None of the 13 found",
    lead: "None of the 13",
    accent: "found",
    tail: ".",
    body: lead.detail,
  };
}

function lateCharges({ bill }: SiteReport): number {
  const { firstPriceStep, charges, extras } = bill;
  const late = [...charges, ...extras].filter(({ amount, firstSeenAtStep }) => {
    if (amount <= 0) return false;
    if (firstPriceStep === null || firstSeenAtStep === null) return true;
    return firstSeenAtStep > firstPriceStep;
  });
  return late.length;
}

export interface ProofCheck {
  ok: boolean;
  text: string;
  shot?: Screenshot;
}

function quoteCheck(finding: PatternFinding): ProofCheck | null {
  const at = finding.step === null ? "" : ` at step ${finding.step}`;
  if (finding.quoteCheck === "matched") {
    return { ok: true, text: `Quote found on the page text${at}` };
  }
  if (finding.quoteCheck === "not_matched") {
    return { ok: false, text: "Quote not found in the page text, so check the screenshot" };
  }
  if (finding.quote) return null;
  return finding.step === null ? null : { ok: true, text: `Charges first seen${at}` };
}

/** The proof list beside a finding. Each line is something this run can show. */
export function proofChecks(report: SiteReport, finding: PatternFinding | null): ProofCheck[] {
  const { addsUp, total } = report.bill;
  const mismatch = billMismatch(report.bill);
  const quote = finding ? quoteCheck(finding) : null;
  const sum: ProofCheck | null =
    addsUp === true && total !== null
      ? { ok: true, text: "Lines add up to the total" }
      : addsUp === false && mismatch !== null
        ? { ok: false, text: mismatch }
        : null;
  const shot: ProofCheck | null = finding?.screenshot
    ? {
        ok: true,
        text:
          finding.step === null
            ? "Screenshot attached"
            : `Screenshot of step ${finding.step} attached`,
        shot: finding.screenshot,
      }
    : null;
  return [quote, sum, shot].filter((check) => check !== null);
}

export interface Stat {
  value: string;
  label: string;
}

const MEANINGFUL_MULTIPLE = 1.05;

export function stats(report: SiteReport, steps: number): Stat[] {
  const after = renewal(report);
  const multiple = grew(report) ? report.bill.multiple : null;
  const first =
    multiple !== null && multiple >= MEANINGFUL_MULTIPLE
      ? { value: `${multiple.toFixed(1)}x`, label: "Shown to paid" }
      : after?.renewalMultiple
        ? { value: `${after.renewalMultiple.toFixed(1)}x`, label: "Offer to renewal" }
        : null;
  const rest = [
    { value: String(steps), label: "Steps walked" },
    { value: `${counts(report).found} of 13`, label: "Patterns found" },
  ];
  return first ? [first, ...rest] : rest;
}

const TOTAL_LEAD: Record<SiteReport["priceLabel"], string> = {
  final: "What you pay.",
  price_before_sign_in: "Before sign-in.",
  last_seen: "Last price seen.",
  none: "What you pay.",
};

const FIRST_PRICE_SAID: Record<NonNullable<SiteReport["bill"]["firstPriceSource"]>, string> = {
  product_page: "The product page said",
  cart: "The cart first said",
  agent: "The first price was",
};

export function totalLine(report: SiteReport) {
  const { bill, priceLabel } = report;
  const lead = TOTAL_LEAD[priceLabel];
  if (!grew(report) || bill.firstPrice === null) return { lead, said: null, shown: null };
  return {
    lead,
    said: FIRST_PRICE_SAID[bill.firstPriceSource ?? "agent"],
    shown: money(bill.firstPrice, bill.currency),
  };
}

export type PillTone = "found" | "clean" | "unchecked" | "live";

export interface Pill {
  tone: PillTone;
  text: string;
}

export function billPill(report: SiteReport): Pill {
  if (report.bill.total === null) return { tone: "unchecked", text: "No total reached" };
  const late = lateCharges(report);
  if (late === 0) return { tone: "clean", text: "Nothing added so far" };
  return { tone: "found", text: `${plural(late, "charge")} added after the first price` };
}

const STATE_PILL: Record<Exclude<AuditSummary["sites"][number]["state"], "done">, Pill> = {
  queued: { tone: "unchecked", text: "Waiting" },
  running: { tone: "live", text: "Running" },
  writing_up: { tone: "live", text: "Writing up" },
  failed: { tone: "unchecked", text: "Failed" },
  cancelled: { tone: "unchecked", text: "Stopped" },
};

/** The status at the end of a row. `report` arrives later than the summary and may be missing. */
export function rowPill(
  {
    state,
    found: foundCount,
    notChecked,
  }: Pick<AuditSummary["sites"][number], "state" | "found" | "notChecked">,
  report: SiteReport | null,
): Pill {
  if (state !== "done") return STATE_PILL[state];
  if (foundCount === 1) {
    const lone = report && strongest(report);
    return { tone: "found", text: lone ? patternName(lone.label) : "1 found" };
  }
  if (foundCount > 1) return { tone: "found", text: `${foundCount} found` };
  if (report?.login.hidesFees) return { tone: "unchecked", text: "Fees behind a login" };
  if (notChecked > 0) return { tone: "clean", text: "Nothing hidden so far" };
  return { tone: "clean", text: "None of the 13 found" };
}
