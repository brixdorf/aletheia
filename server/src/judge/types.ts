export type Flow = "checkout" | "subscription";

export const PATTERN_IDS = [
  "false_urgency",
  "basket_sneaking",
  "confirm_shaming",
  "forced_action",
  "subscription_trap",
  "interface_interference",
  "bait_and_switch",
  "drip_pricing",
  "disguised_advertisement",
  "nagging",
  "trick_question",
  "saas_billing",
  "rogue_malware",
] as const;

export type PatternId = (typeof PATTERN_IDS)[number];

export type StopPoint =
  | "payment_page"
  | "login_wall"
  | "contact_required"
  | "blocked"
  | "error"
  | "incomplete";

/** How far into the flow the run really got, from the evidence and not the agent's word. */
export type Reach = "none" | "pages" | "offer" | "order" | "payment";

export type PatternStatus = "found" | "not_found" | "not_checked";

/** `verified` means our arithmetic proved it; `seen` means a quote and step back it up. */
export type Proof = "verified" | "seen";

/** Whether a quote was found in the page text captured during the run. */
export type QuoteCheck = "matched" | "not_matched" | "unavailable";

export interface Amount {
  label: string;
  amount: number;
}

export interface Screenshot {
  stepId: string;
  action: string | null;
}

export interface PatternFinding {
  id: PatternId;
  label: string;
  status: PatternStatus;
  proof: Proof | null;
  /** True when a clean result only holds up to the last page reached. */
  soFar: boolean;
  step: number | null;
  quote: string | null;
  quoteCheck: QuoteCheck | null;
  amounts: Amount[];
  screenshot: Screenshot | null;
  note: string;
}

export interface Charge {
  name: string;
  amount: number;
  firstSeenAtStep: number | null;
}

export type FirstPriceSource = "product_page" | "cart" | "agent";

export interface Bill {
  currency: string | null;
  firstPrice: number | null;
  firstPriceStep: number | null;
  firstPriceSource: FirstPriceSource | null;
  itemsTotal: number | null;
  charges: Charge[];
  /** Lines the site offered that the total does not contain yet, such as a delivery choice. */
  notInTotal: Charge[];
  /** Fees the site says the first price already contains, such as GST. */
  includedCharges: Charge[];
  discounts: Charge[];
  /** Pre-ticked options or added items whose amounts are proven to be in the total. */
  extras: Charge[];
  total: number | null;
  addsUp: boolean | null;
  unexplained: number | null;
  increase: number | null;
  multiple: number | null;
}

export type TermName =
  | "trial"
  | "renewal"
  | "price_after_intro"
  | "cancellation"
  | "cancellation_fee";

export type ShownWhere =
  | "main_page"
  | "fine_print"
  | "info_icon"
  | "faq"
  | "later_page"
  | "not_shown";

export interface Term {
  term: TermName;
  quote: string | null;
  shownWhere: ShownWhere;
  seenAtStep: number | null;
}

export interface PlanOption {
  label: string;
  price: number | null;
  period: string | null;
  commitment: string | null;
  feeLine: string | null;
  selectedByDefault: boolean;
  firstSeenAtStep: number | null;
}

export interface SubscriptionSummary {
  plan: string | null;
  billingPeriod: string | null;
  defaultSelected: string | null;
  options: PlanOption[];
  terms: Term[];
  introPrice: number | null;
  introPeriod: string | null;
  priceAfterIntro: number | null;
  contractTotal: number | null;
  renewalTotal: number | null;
  renewalMultiple: number | null;
  noCommitmentPrice: number | null;
}

export type FlagKind = "contact_entered" | "payment_click" | "browser_changed";

export interface SafetyFlag {
  kind: FlagKind;
  detail: string;
  stepId: string | null;
}

export type PriceLabel = "final" | "price_before_sign_in" | "last_seen" | "none";

export interface Page {
  step: number;
  name: string;
  url: string | null;
  note: string | null;
  price: number | null;
  screenshot: Screenshot | null;
}

export interface SiteReport {
  url: string;
  host: string;
  flow: Flow;
  signedIn: boolean;
  runId: string;
  item: string | null;
  origin: string | null;
  destination: string | null;
  stop: { at: StopPoint; claimed: string | null; note: string | null; reach: Reach };
  priceLabel: PriceLabel;
  bill: Bill;
  subscription: SubscriptionSummary | null;
  patterns: PatternFinding[];
  pages: Page[];
  flags: SafetyFlag[];
  missing: string[];
  login: { wallAt: string | null; hidesFees: boolean; offerSignIn: boolean };
}
