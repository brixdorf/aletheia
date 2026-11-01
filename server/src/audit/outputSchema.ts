import { PATTERN_IDS } from "../judge/types.ts";

const nullableString = { type: "string", nullable: true } as const;
const nullableNumber = { type: "number", nullable: true } as const;
const nullableInteger = { type: "integer", nullable: true } as const;
const nullableBoolean = { type: "boolean", nullable: true } as const;

function objectOf<const P extends Record<string, unknown>>(properties: P) {
  return { type: "object", properties, required: Object.keys(properties) } as const;
}

function arrayOf<const I>(items: I) {
  return { type: "array", items } as const;
}

const properties = {
  stopped_at: {
    type: "string",
    enum: ["incomplete", "payment_page", "login_wall", "contact_required", "blocked", "error"],
  },
  stop_note: nullableString,
  login_wall_at: nullableString,
  bill_itemised: { type: "boolean" },
  item_name: nullableString,
  item_listed_price: nullableNumber,
  plan_name: nullableString,
  billing_period: nullableString,
  plan_default_selected: nullableString,
  currency: nullableString,
  origin: nullableString,
  destination: nullableString,
  first_price_shown: nullableNumber,
  intro_price: nullableNumber,
  intro_period: nullableString,
  price_after_intro: nullableNumber,
  final_price: nullableNumber,
  removed_from_cart: arrayOf(objectOf({ name: { type: "string" }, price: nullableNumber })),
  steps: arrayOf(
    objectOf({
      step: { type: "integer" },
      page: { type: "string" },
      url: nullableString,
      price_shown: nullableNumber,
      note: nullableString,
    }),
  ),
  fees: arrayOf(
    objectOf({
      name: { type: "string" },
      amount: nullableNumber,
      first_seen_at_step: nullableInteger,
      included_in_first_price: nullableBoolean,
    }),
  ),
  pre_ticked_options: arrayOf(
    objectOf({
      label: { type: "string" },
      cost: nullableNumber,
      included_in_total: nullableBoolean,
      seen_at_step: nullableInteger,
    }),
  ),
  added_without_asking: arrayOf(
    objectOf({
      name: { type: "string" },
      cost: nullableNumber,
      seen_at_step: nullableInteger,
    }),
  ),
  pressure_messages: arrayOf(objectOf({ text: { type: "string" }, seen_at_step: nullableInteger })),
  decline_wording: arrayOf({ type: "string" }),
  consent_text: arrayOf(
    objectOf({
      text: { type: "string" },
      seen_at_step: nullableInteger,
      can_decline_separately: nullableBoolean,
    }),
  ),
  terms: arrayOf(
    objectOf({
      term: {
        type: "string",
        enum: ["trial", "renewal", "price_after_intro", "cancellation", "cancellation_fee"],
      },
      quote: nullableString,
      shown_where: {
        type: "string",
        enum: ["main_page", "fine_print", "info_icon", "faq", "later_page", "not_shown"],
      },
      seen_at_step: nullableInteger,
    }),
  ),
  plan_options: arrayOf(
    objectOf({
      label: { type: "string" },
      price: nullableNumber,
      period: nullableString,
      commitment: nullableString,
      fee_line: nullableString,
      selected_by_default: nullableBoolean,
      first_seen_at_step: nullableInteger,
    }),
  ),
  pattern_checks: arrayOf(
    objectOf({
      pattern: { type: "string", enum: [...PATTERN_IDS] },
      status: { type: "string", enum: ["found", "not_found", "not_checked"] },
      quote: nullableString,
      seen_at_step: nullableInteger,
      note: nullableString,
    }),
  ),
} as const;

/** One generic schema for every site and flow: fields a flow has no use for come back null. */
export const OUTPUT_SCHEMA = objectOf(properties);

export const LOGOUT_SCHEMA = objectOf({
  logged_out: { type: "boolean" },
  note: nullableString,
});
