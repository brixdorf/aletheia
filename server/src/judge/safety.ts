import type { StepRecord } from "../tinyfish/types.ts";
import type { Evidence } from "./evidence.ts";
import type { SafetyFlag } from "./types.ts";

const ENTRY_VERB = /\b(type[ds]?|enter(ed|s)?|fill(ed|s)?|input|provide[ds]?)\b/i;
const CONTACT_FIELD = /\b(e-?mail|phone|mobile|contact|otp|one[- ]time|card|cvv|upi)\b/i;
const CONTACT_VALUE = /[\w.+-]+@[\w-]+\.\w+|(?<!\d)\d{10}(?!\d)/;
const CLICK_VERB = /\b(click|press|tap|select|choose|pick)\w*\b/i;
const PAYMENT_TARGET =
  /\b(place order|pay|pay now|proceed to pay|slide to pay|confirm (order|purchase|payment)|payment method|cash on delivery|cod|upi|net ?banking|credit card|debit card|wallet)\b/i;
const BROWSER_CHANGE = /reconfigur|(switch|chang)\w* .*proxy/i;

function typedContact(action: string): boolean {
  return ENTRY_VERB.test(action) && (CONTACT_FIELD.test(action) || CONTACT_VALUE.test(action));
}

function clickedPayment(action: string): boolean {
  return CLICK_VERB.test(action) && PAYMENT_TARGET.test(action);
}

/** Goal rules are not a safety boundary, so every run's real actions are read afterwards. */
export function scanSafety(
  actions: readonly StepRecord[],
  evidence: Evidence | null,
): SafetyFlag[] {
  const flags: SafetyFlag[] = [];

  for (const step of actions) {
    const action = step.action ?? "";
    if (typedContact(action)) {
      flags.push({
        kind: "contact_entered",
        detail: "The agent typed something that looks like contact details.",
        stepId: step.id,
      });
    }
    if (clickedPayment(action)) {
      flags.push({
        kind: "payment_click",
        detail: "The agent pressed a button that looks like a payment or order action.",
        stepId: step.id,
      });
    }
  }

  const changedAt = actions.find((step) => BROWSER_CHANGE.test(step.action ?? ""));
  const writtenUp = [evidence?.stopNote, ...(evidence?.pages ?? []).map((page) => page.note)].some(
    (text) => BROWSER_CHANGE.test(text ?? ""),
  );
  if (changedAt || writtenUp) {
    flags.push({
      kind: "browser_changed",
      detail:
        "The agent changed its own browser setup mid-run, so the country the site saw is not known.",
      stepId: changedAt?.id ?? null,
    });
  }

  return flags;
}
