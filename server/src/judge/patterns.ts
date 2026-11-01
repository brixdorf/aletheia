import type { Evidence, PatternCheck } from "./evidence.ts";
import { reached } from "./stop.ts";
import type { Amount, Bill, PatternId, PatternStatus, Proof, Reach, StopPoint } from "./types.ts";

export interface PatternContext {
  evidence: Evidence | null;
  bill: Bill | null;
  stop: StopPoint;
  reach: Reach;
  actions: readonly string[];
}

/** A context with evidence in hand: rules never run on a run that returned nothing. */
interface JudgedContext extends PatternContext {
  evidence: Evidence;
  bill: Bill;
}

export interface Draft {
  status: PatternStatus;
  proof: Proof | null;
  step: number | null;
  quote: string | null;
  amounts: Amount[];
  note: string;
}

interface Definition {
  id: PatternId;
  label: string;
  /** The furthest page this pattern lives on. Before it, the answer is "not checked". */
  needs: Reach;
  rule: (context: JudgedContext) => Draft | null;
  /** Patterns the run's own lists settle, so an empty list means "looked, found nothing". */
  listed: boolean;
  /** Arithmetic patterns ignore what the agent claims. */
  agentMayPropose: boolean;
}

const URGENCY =
  /countdown|hurry|last chance|selling fast|filling fast|almost gone|limited (time|stock|period)|offer ends|ends (in|today|soon)|only \d+|\d+\s+(seats?|left|remaining)|\bleft\b.*\b(stock|seats?)\b/i;
const SHAMING_DECLINE =
  /risk it|i don'?t (want|need|care)|no,? i (prefer|like|'?ll pay|will pay)|pay (more|full price)|stay unprotected|miss out|not interested in saving/i;
const GUILT_NUDGE =
  /malnutrition|brighten their day|help us|help (them|feed)|feed (a|the)|hungry|don'?t let|you'?ll regret/i;
const ACCOUNT_REQUIREMENT =
  /account|sign[ -]?(in|up)|log ?in|e-?mail|mobile number|phone|credential|authenticat/i;
const MARKETING_CONSENT =
  /market|promot|personali[sz]ed|newsletter|keep me informed|special offers|third part/i;
const FEE_WORD = /\bfees?\b|\bcharges?\b|penalt|remaining|lump sum|early terminat/i;
const NO_FEE =
  /\bno (cancell?ation )?(fee|charge|penalt)|without (any )?(fee|charge|penalt)|free of charge|not (mentioned|shown)/i;

function draft(status: PatternStatus, note: string, extra: Partial<Draft> = {}): Draft {
  return { status, proof: null, step: null, quote: null, amounts: [], note, ...extra };
}

function seen(quote: string | null, step: number | null, note: string): Draft {
  return draft("found", note, { proof: "seen", quote, step });
}

function stepExists(evidence: Evidence, step: number | null): boolean {
  return step !== null && evidence.pages.some((page) => page.step === step);
}

function fromAgent(evidence: Evidence, check: PatternCheck, needs: Reach): Draft {
  if (check.status === "found") {
    if (check.quote && stepExists(evidence, check.seenAtStep)) {
      return seen(check.quote, check.seenAtStep, check.note ?? "Seen on the page quoted.");
    }
    return draft(
      "not_found",
      "The agent suggested this but gave no quote on a real step, so it does not count.",
    );
  }
  // Anything that can sit on any page was in view on every page the agent saw.
  if (check.status === "not_checked" && needs === "pages") {
    return draft("not_found", "Nothing of this kind was on the pages seen.");
  }
  return draft(check.status, check.note ?? "");
}

function dripPricing({ bill, evidence, stop }: JudgedContext): Draft {
  if (bill.total === null || bill.firstPrice === null) {
    const hidden = stop === "login_wall";
    return draft(
      "not_checked",
      hidden
        ? "The site shows no bill before sign-in, so its fees are unknown."
        : "No bill was reached, so its fees are unknown.",
    );
  }
  const totalCents = Math.round(bill.total * 100);
  if (totalCents <= Math.round(bill.firstPrice * 100)) {
    return draft("not_found", "The total matches the first price shown.");
  }

  const amounts = [...bill.charges, ...bill.extras]
    .filter((charge) => charge.amount > 0)
    .map(({ name, amount }) => ({ label: name, amount }));
  const firstSeen = [...bill.charges, ...bill.extras]
    .map((charge) => charge.firstSeenAtStep)
    .filter((step) => step !== null);
  const step =
    firstSeen.length > 0 ? Math.min(...firstSeen) : (evidence.pages.at(-1)?.step ?? null);

  if (bill.addsUp) {
    return draft("found", "The fees added after the first price add up to the total exactly.", {
      proof: "verified",
      amounts,
      step,
    });
  }
  return draft(
    "found",
    `The total is above the first price, but ${bill.unexplained ?? "an amount"} of it is not on any line of the bill.`,
    { proof: "seen", amounts, step },
  );
}

function basketSneaking({ bill }: JudgedContext): Draft | null {
  if (bill.extras.length === 0) return null;
  return draft("found", "Added without asking, and the amount is proven to be in the total.", {
    proof: "verified",
    amounts: bill.extras.map(({ name, amount }) => ({ label: name, amount })),
    step: bill.extras[0]?.firstSeenAtStep ?? null,
  });
}

function falseUrgency({ evidence }: JudgedContext): Draft | null {
  const message = evidence.pressure.find((entry) => URGENCY.test(entry.text));
  return message
    ? seen(
        message.text,
        message.seenAtStep,
        "Urgency message on the page. Our rules cannot test whether it is true.",
      )
    : null;
}

function confirmShaming({ evidence }: JudgedContext): Draft | null {
  const decline = evidence.declineWording.find((text) => SHAMING_DECLINE.test(text));
  if (decline) {
    const step = evidence.checks.confirm_shaming?.seenAtStep ?? null;
    return seen(decline, step, "The button to decline uses shaming wording.");
  }
  const nudge = evidence.pressure.find((entry) => GUILT_NUDGE.test(entry.text));
  return nudge
    ? seen(nudge.text, nudge.seenAtStep, "A guilt nudge beside an optional extra.")
    : null;
}

function forcedAction({ evidence }: JudgedContext): Draft | null {
  const consent = evidence.consent.find(
    (entry) => entry.canDeclineSeparately !== true && MARKETING_CONSENT.test(entry.text),
  );
  if (consent) {
    return seen(
      consent.text,
      consent.seenAtStep,
      "Going on means agreeing to this, and it cannot be declined on its own.",
    );
  }
  const check = evidence.checks.forced_action;
  if (check?.status === "found" && ACCOUNT_REQUIREMENT.test(`${check.quote} ${check.note}`)) {
    return draft(
      "not_found",
      "Needing an account for the product itself is not forced action, so this was dropped.",
    );
  }
  return null;
}

function subscriptionTrap({ evidence, bill, stop }: JudgedContext): Draft | null {
  const fee = evidence.terms.find(
    (term) =>
      term.term === "cancellation_fee" &&
      term.shownWhere !== "not_shown" &&
      FEE_WORD.test(term.quote ?? "") &&
      !NO_FEE.test(term.quote ?? ""),
  );
  if (fee) {
    const firstPriceStep = bill.firstPriceStep ?? evidence.pages[0]?.step ?? null;
    const later =
      fee.seenAtStep !== null && firstPriceStep !== null && fee.seenAtStep > firstPriceStep;
    return seen(
      fee.quote,
      fee.seenAtStep,
      later
        ? `A cancellation fee first shown on step ${fee.seenAtStep}, after the price on step ${firstPriceStep}.`
        : "A fee for leaving early.",
    );
  }
  const renewal = evidence.terms.find((term) => term.term === "renewal");
  if (stop === "payment_page" && renewal?.shownWhere === "not_shown") {
    return draft("found", "Up to the payment page, no text said how or when this renews.", {
      proof: "seen",
      step: evidence.pages.at(-1)?.step ?? null,
    });
  }
  return null;
}

function interfaceInterference({ evidence }: JudgedContext): Draft | null {
  const chosen = evidence.planOptions.find((option) => option.selectedByDefault);
  if (!chosen?.commitment) return null;
  const hidden = evidence.planOptions.find(
    (option) =>
      isNoCommitment(option.commitment) &&
      option.firstSeenAtStep !== null &&
      option.firstSeenAtStep > (chosen.firstSeenAtStep ?? 1),
  );
  if (!hidden) return null;
  return seen(
    hidden.feeLine ?? hidden.label,
    hidden.firstSeenAtStep,
    `The committed plan is the default. The option with no commitment appears only on step ${hidden.firstSeenAtStep}.`,
  );
}

export function isNoCommitment(commitment: string | null): boolean {
  return commitment === null || /^(none|no\b|n\/a)/i.test(commitment.trim());
}

function baitAndSwitch({ bill }: JudgedContext): Draft | null {
  const { itemsTotal, firstPrice, firstPriceSource } = bill;
  if (itemsTotal === null || firstPrice === null || firstPriceSource !== "product_page") {
    return null;
  }
  if (Math.round(itemsTotal * 100) <= Math.round(firstPrice * 100)) return null;
  return draft(
    "found",
    "The item costs more in the cart than on its page. Check the screenshot, since the cart may hold extra items.",
    {
      proof: "seen",
      amounts: [
        { label: "Price on the product page", amount: firstPrice },
        { label: "Item total in the cart", amount: itemsTotal },
      ],
    },
  );
}

const none = () => null;

export const PATTERNS: readonly Definition[] = [
  {
    id: "false_urgency",
    label: "False Urgency",
    needs: "offer",
    rule: falseUrgency,
    listed: true,
    agentMayPropose: true,
  },
  {
    id: "basket_sneaking",
    label: "Basket Sneaking",
    needs: "order",
    rule: basketSneaking,
    listed: true,
    agentMayPropose: false,
  },
  {
    id: "confirm_shaming",
    label: "Confirm Shaming",
    needs: "order",
    rule: confirmShaming,
    listed: true,
    agentMayPropose: true,
  },
  {
    id: "forced_action",
    label: "Forced Action",
    needs: "pages",
    rule: forcedAction,
    listed: false,
    agentMayPropose: true,
  },
  {
    id: "subscription_trap",
    label: "Subscription Trap",
    needs: "order",
    rule: subscriptionTrap,
    listed: false,
    agentMayPropose: true,
  },
  {
    id: "interface_interference",
    label: "Interface Interference",
    needs: "offer",
    rule: interfaceInterference,
    listed: false,
    agentMayPropose: true,
  },
  {
    id: "bait_and_switch",
    label: "Bait and Switch",
    needs: "order",
    rule: baitAndSwitch,
    listed: true,
    agentMayPropose: true,
  },
  {
    id: "drip_pricing",
    label: "Drip Pricing",
    needs: "order",
    rule: dripPricing,
    listed: true,
    agentMayPropose: false,
  },
  {
    id: "disguised_advertisement",
    label: "Disguised Advertisement",
    needs: "pages",
    rule: none,
    listed: false,
    agentMayPropose: true,
  },
  {
    id: "nagging",
    label: "Nagging",
    needs: "pages",
    rule: none,
    listed: false,
    agentMayPropose: true,
  },
  {
    id: "trick_question",
    label: "Trick Question",
    needs: "order",
    rule: none,
    listed: false,
    agentMayPropose: true,
  },
  {
    id: "saas_billing",
    label: "SaaS Billing",
    needs: "payment",
    rule: none,
    listed: false,
    agentMayPropose: true,
  },
  {
    id: "rogue_malware",
    label: "Rogue Malware",
    needs: "pages",
    rule: none,
    listed: false,
    agentMayPropose: true,
  },
];

function unreachedNote(context: PatternContext, needs: Reach): string {
  if (context.reach === "none") return "The run returned no pages to judge.";
  if (needs === "payment") {
    return context.stop === "login_wall"
      ? "Sign-in stopped the run before the payment page."
      : "The payment page was not reached.";
  }
  return context.stop === "login_wall"
    ? "The site asked for sign-in before this point, so its price and bill stayed out of view."
    : "The run stopped before the page where this appears.";
}

export function judgePattern(definition: Definition, context: PatternContext): Draft {
  const { evidence, bill } = context;
  if (!evidence || !bill || !reached(context.reach, definition.needs)) {
    return draft("not_checked", unreachedNote(context, definition.needs));
  }

  const ruled = definition.rule({ ...context, evidence, bill });
  if (ruled) return ruled;

  const check = evidence.checks[definition.id];
  if (definition.agentMayPropose && check) return fromAgent(evidence, check, definition.needs);
  if (definition.listed) return draft("not_found", "Nothing of this kind was on the pages seen.");
  return draft("not_checked", "This run did not look for it.");
}
