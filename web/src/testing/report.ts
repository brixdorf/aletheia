import type { Bill, PatternFinding, SiteReport, SubscriptionSummary } from "../lib/types.ts";

const PATTERNS: readonly [PatternFinding["id"], string][] = [
  ["false_urgency", "False Urgency"],
  ["basket_sneaking", "Basket Sneaking"],
  ["confirm_shaming", "Confirm Shaming"],
  ["forced_action", "Forced Action"],
  ["subscription_trap", "Subscription Trap"],
  ["interface_interference", "Interface Interference"],
  ["bait_and_switch", "Bait and Switch"],
  ["drip_pricing", "Drip Pricing"],
  ["disguised_advertisement", "Disguised Advertisement"],
  ["nagging", "Nagging"],
  ["trick_question", "Trick Question"],
  ["saas_billing", "SaaS Billing"],
  ["rogue_malware", "Rogue Malware"],
];

export function finding(overrides: Partial<PatternFinding> = {}): PatternFinding {
  return {
    id: "false_urgency",
    label: "False Urgency",
    status: "not_found",
    proof: null,
    soFar: false,
    step: null,
    quote: null,
    quoteCheck: null,
    amounts: [],
    screenshot: null,
    note: "",
    ...overrides,
  };
}

export function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    currency: "INR",
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
    increase: null,
    multiple: null,
    ...overrides,
  };
}

export function subscription(overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary {
  return {
    plan: null,
    billingPeriod: null,
    defaultSelected: null,
    options: [],
    terms: [],
    introPrice: null,
    introPeriod: null,
    priceAfterIntro: null,
    contractTotal: null,
    renewalTotal: null,
    renewalMultiple: null,
    noCommitmentPrice: null,
    ...overrides,
  };
}

/** Every report lists all 13 patterns, so overrides replace rows by id. */
export function report(
  overrides: Partial<Omit<SiteReport, "patterns">> & { patterns?: PatternFinding[] } = {},
): SiteReport {
  const { patterns = [], ...rest } = overrides;
  return {
    url: "https://shop.test",
    host: "shop.test",
    flow: "checkout",
    signedIn: false,
    runId: "run_1",
    item: null,
    origin: null,
    destination: null,
    stop: { at: "payment_page", claimed: "payment_page", note: null, reach: "payment" },
    priceLabel: "final",
    bill: bill(),
    subscription: null,
    pages: [],
    flags: [],
    missing: [],
    login: { wallAt: null, hidesFees: false, offerSignIn: false },
    ...rest,
    patterns: PATTERNS.map(
      ([id, label]) =>
        patterns.find((entry) => entry.id === id) ??
        finding({ id, label, status: "not_found", note: "Not seen." }),
    ),
  };
}
