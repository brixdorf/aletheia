import { z } from "zod";

import type { PatternId, PatternStatus, PlanOption, StopPoint, Term } from "./types.ts";
import { PATTERN_IDS } from "./types.ts";

// Agent output is untrusted: a field of the wrong shape becomes "absent", never a crash.
const num = z.number().nullish().catch(null);
const str = z.string().nullish().catch(null);
const step = z.number().int().nullish().catch(null);

function list<T extends z.ZodType>(item: T) {
  return z.array(item.nullable().catch(null)).nullish().catch([]);
}

const pageSchema = z.object({
  step: z.number().int(),
  page: z.string().catch("Page"),
  url: str,
  note: str,
  total_shown: num,
  price_shown: num,
});

const feeSchema = z.object({
  name: z.string(),
  amount: num,
  first_seen_at_step: step,
  included_in_first_price: z.boolean().nullish().catch(null),
});

const preTickedSchema = z.object({
  label: z.string(),
  cost: num,
  included_in_total: z.boolean().nullish().catch(null),
  seen_at_step: step,
});

const addedSchema = z.object({ name: z.string(), cost: num, seen_at_step: step });

const pressureSchema = z.object({ text: z.string(), seen_at_step: step });

const consentSchema = z.object({
  text: z.string(),
  seen_at_step: step,
  can_decline_separately: z.boolean().nullish().catch(null),
});

const termSchema = z.object({
  term: z.enum(["trial", "renewal", "price_after_intro", "cancellation", "cancellation_fee"]),
  quote: str,
  shown_where: z
    .enum(["main_page", "fine_print", "info_icon", "faq", "later_page", "not_shown"])
    .catch("not_shown"),
  seen_at_step: step,
});

const planOptionSchema = z.object({
  label: z.string(),
  price: num,
  period: str,
  commitment: str,
  fee_line: str,
  selected_by_default: z.boolean().nullish().catch(null),
  first_seen_at_step: step,
});

const patternCheckSchema = z.object({
  pattern: z.enum(PATTERN_IDS),
  status: z.enum(["found", "not_found", "not_checked"]),
  quote: str,
  seen_at_step: step,
  note: str,
});

const resultSchema = z.object({
  stopped_at: str,
  stop_note: str,
  stopped_reason: str,
  login_wall_at: str,
  login_required: z.boolean().nullish().catch(null),
  reached_payment_page: z.boolean().nullish().catch(null),
  blocked_by_bot_protection: z.boolean().nullish().catch(null),
  bill_itemised: z.boolean().nullish().catch(null),
  item_name: str,
  item_listed_price: num,
  plan_name: str,
  billing_period: str,
  plan_default_selected: str,
  currency: str,
  origin: str,
  destination: str,
  first_price_shown: num,
  intro_price: num,
  intro_period: str,
  price_after_intro: num,
  final_price: num,
  steps: list(pageSchema),
  fees: list(feeSchema),
  pre_ticked_options: list(preTickedSchema),
  added_without_asking: list(addedSchema),
  pressure_messages: list(pressureSchema),
  decline_wording: z.array(z.string()).nullish().catch([]),
  consent_text: list(consentSchema),
  terms: list(termSchema),
  plan_options: list(planOptionSchema),
  pattern_checks: list(patternCheckSchema),
});

export interface EvidencePage {
  step: number;
  name: string;
  url: string | null;
  note: string | null;
  price: number | null;
}

export interface EvidenceFee {
  name: string;
  amount: number | null;
  firstSeenAtStep: number | null;
  includedInFirstPrice: boolean | null;
}

export interface PreTicked {
  label: string;
  cost: number | null;
  includedInTotal: boolean | null;
  seenAtStep: number | null;
}

export interface Added {
  name: string;
  cost: number | null;
  seenAtStep: number | null;
}

export interface Pressure {
  text: string;
  seenAtStep: number | null;
}

export interface Consent {
  text: string;
  seenAtStep: number | null;
  canDeclineSeparately: boolean | null;
}

export interface PatternCheck {
  status: PatternStatus;
  quote: string | null;
  seenAtStep: number | null;
  note: string | null;
}

export interface Evidence {
  stoppedAt: string | null;
  stopPoint: StopPoint;
  stopNote: string | null;
  loginWallAt: string | null;
  billItemised: boolean;
  itemName: string | null;
  listedPrice: number | null;
  planName: string | null;
  billingPeriod: string | null;
  defaultSelected: string | null;
  currency: string | null;
  origin: string | null;
  destination: string | null;
  introPrice: number | null;
  introPeriod: string | null;
  priceAfterIntro: number | null;
  finalPrice: number | null;
  pages: EvidencePage[];
  fees: EvidenceFee[];
  preTicked: PreTicked[];
  added: Added[];
  pressure: Pressure[];
  declineWording: string[];
  consent: Consent[];
  terms: Term[];
  planOptions: PlanOption[];
  checks: Partial<Record<PatternId, PatternCheck>>;
}

const STOP_POINTS: ReadonlySet<string> = new Set<StopPoint>([
  "payment_page",
  "login_wall",
  "contact_required",
  "blocked",
  "error",
  "incomplete",
]);

function present<T>(items: readonly (T | null)[] | null | undefined): T[] {
  return (items ?? []).filter((item): item is T => item !== null);
}

/** Runs from before the schema gained `stopped_at` reported the same facts as booleans. */
function legacyStop(raw: z.infer<typeof resultSchema>): StopPoint {
  if (raw.blocked_by_bot_protection) return "blocked";
  if (raw.login_required) return "login_wall";
  if (raw.reached_payment_page) return "payment_page";
  return "incomplete";
}

function stopPoint(raw: z.infer<typeof resultSchema>): StopPoint {
  if (raw.stopped_at && STOP_POINTS.has(raw.stopped_at)) return raw.stopped_at as StopPoint;
  return raw.stopped_at ? "incomplete" : legacyStop(raw);
}

const CURRENCY_SYMBOLS: readonly (readonly [RegExp, string])[] = [
  [/\u20B9|^rs\.?$/i, "INR"],
  [/\$/, "USD"],
  [/\u20AC/, "EUR"],
  [/\u00A3/, "GBP"],
];

/** Agents write the code on some runs and the symbol on others. */
function currencyCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.match(/\b[A-Z]{3}\b/)?.[0];
  if (code) return code;
  return CURRENCY_SYMBOLS.find(([symbol]) => symbol.test(value.trim()))?.[1] ?? null;
}

export function parseEvidence(result: Record<string, unknown> | null): Evidence | null {
  if (!result) return null;
  const raw = resultSchema.parse(result);
  const stop = stopPoint(raw);
  const fees = present(raw.fees).map((fee) => ({
    name: fee.name,
    amount: fee.amount ?? null,
    firstSeenAtStep: fee.first_seen_at_step ?? null,
    includedInFirstPrice: fee.included_in_first_price ?? null,
  }));

  const checks: Evidence["checks"] = {};
  for (const check of present(raw.pattern_checks)) {
    checks[check.pattern] = {
      status: check.status,
      quote: check.quote?.trim() || null,
      seenAtStep: check.seen_at_step ?? null,
      note: check.note ?? null,
    };
  }

  return {
    stoppedAt: raw.stopped_at ?? (raw.reached_payment_page ? "payment_page" : null),
    stopPoint: stop,
    stopNote: raw.stop_note ?? raw.stopped_reason ?? null,
    loginWallAt: raw.login_wall_at ?? null,
    billItemised: raw.bill_itemised ?? fees.some((fee) => fee.amount !== null && fee.amount > 0),
    itemName: raw.item_name ?? null,
    listedPrice: raw.item_listed_price ?? raw.first_price_shown ?? null,
    planName: raw.plan_name ?? null,
    billingPeriod: raw.billing_period ?? null,
    defaultSelected: raw.plan_default_selected ?? null,
    currency: currencyCode(raw.currency),
    origin: raw.origin ?? null,
    destination: raw.destination ?? null,
    introPrice: raw.intro_price ?? null,
    introPeriod: raw.intro_period ?? null,
    priceAfterIntro: raw.price_after_intro ?? null,
    finalPrice: raw.final_price ?? null,
    pages: present(raw.steps).map((page) => ({
      step: page.step,
      name: page.page,
      url: page.url ?? null,
      note: page.note ?? null,
      price: page.total_shown ?? page.price_shown ?? null,
    })),
    fees,
    preTicked: present(raw.pre_ticked_options).map((option) => ({
      label: option.label,
      cost: option.cost ?? null,
      includedInTotal: option.included_in_total ?? null,
      seenAtStep: option.seen_at_step ?? null,
    })),
    added: present(raw.added_without_asking).map((item) => ({
      name: item.name,
      cost: item.cost ?? null,
      seenAtStep: item.seen_at_step ?? null,
    })),
    pressure: present(raw.pressure_messages).map((message) => ({
      text: message.text,
      seenAtStep: message.seen_at_step ?? null,
    })),
    declineWording: raw.decline_wording ?? [],
    consent: present(raw.consent_text).map((consent) => ({
      text: consent.text,
      seenAtStep: consent.seen_at_step ?? null,
      canDeclineSeparately: consent.can_decline_separately ?? null,
    })),
    terms: present(raw.terms).map((term) => ({
      term: term.term,
      quote: term.quote ?? null,
      shownWhere: term.shown_where,
      seenAtStep: term.seen_at_step ?? null,
    })),
    planOptions: present(raw.plan_options).map((option) => ({
      label: option.label,
      price: option.price ?? null,
      period: option.period ?? null,
      commitment: option.commitment ?? null,
      feeLine: option.fee_line ?? null,
      selectedByDefault: option.selected_by_default ?? false,
      firstSeenAtStep: option.first_seen_at_step ?? null,
    })),
    checks,
  };
}
