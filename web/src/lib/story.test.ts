import { describe, expect, it } from "vite-plus/test";

import { bill, finding, report, subscription } from "../testing/report.ts";
import {
  billPill,
  patternName,
  priceJump,
  proofChecks,
  rowPill,
  stats,
  story,
  totalLine,
} from "./story.ts";

const drip = finding({
  id: "drip_pricing",
  label: "Drip Pricing",
  status: "found",
  proof: "verified",
  step: 4,
  amounts: [
    { label: "Delivery charge", amount: 25 },
    { label: "High demand surge charge", amount: 30 },
    { label: "Handling charge", amount: 2 },
  ],
  screenshot: { stepId: "s4", action: null },
});

const blinkit = report({
  priceLabel: "price_before_sign_in",
  bill: bill({
    firstPrice: 24,
    firstPriceStep: 3,
    firstPriceSource: "product_page",
    itemsTotal: 24,
    charges: [
      { name: "Delivery charge", amount: 25, firstSeenAtStep: 4 },
      { name: "Handling charge", amount: 2, firstSeenAtStep: 4 },
      { name: "High demand surge charge", amount: 30, firstSeenAtStep: 4 },
    ],
    total: 81,
    addsUp: true,
    increase: 57,
    multiple: 3.375,
  }),
  patterns: [drip],
});

const trap = finding({
  id: "subscription_trap",
  label: "Subscription Trap",
  status: "found",
  proof: "seen",
  step: 2,
  quote: "Fee applies of half your remaining annual commitment",
  quoteCheck: "matched",
  screenshot: { stepId: "s2", action: null },
});

const adobe = report({
  flow: "subscription",
  priceLabel: "last_seen",
  bill: bill({ firstPrice: 1199, total: 1199, increase: 0, multiple: 1, addsUp: true }),
  subscription: subscription({
    billingPeriod: "Annual, billed monthly",
    introPrice: 1199,
    introPeriod: "12 months",
    priceAfterIntro: 2714,
    renewalMultiple: 2.26,
  }),
  patterns: [trap],
});

describe("patternName", () => {
  it("writes labels in sentence case and keeps SaaS as it is", () => {
    expect(patternName("Drip Pricing")).toBe("Drip pricing");
    expect(patternName("Bait and Switch")).toBe("Bait and switch");
    expect(patternName("SaaS Billing")).toBe("SaaS billing");
  });
});

describe("priceJump", () => {
  it("goes from the first price to the total on a bill that grew", () => {
    expect(priceJump(blinkit)).toEqual({ from: 24, to: 81, suffix: "", currency: "INR" });
  });

  it("goes from the intro price to the renewal price per billing period", () => {
    expect(priceJump(adobe)).toEqual({ from: 1199, to: 2714, suffix: "/mo", currency: "INR" });
  });

  it("has no shown price when nothing was added", () => {
    const croma = report({ bill: bill({ firstPrice: 549, total: 549, increase: 0 }) });
    expect(priceJump(croma)).toEqual({ from: null, to: 549, suffix: "", currency: "INR" });
  });

  it("has no total when the run never reached one", () => {
    expect(priceJump(report({ bill: bill({ firstPrice: 389 }) })).to).toBeNull();
  });
});

describe("story", () => {
  it("tells the bill story with the amount that appeared", () => {
    expect(story(blinkit)).toMatchObject({
      tone: "found",
      badge: "Drip pricing, found",
      lead: "Rs 57 appeared",
      accent: "after",
      tail: "you chose.",
      finding: { id: "drip_pricing" },
    });
    expect(story(blinkit).body).toBe(
      "3 charges show up after the first price. None of them was on the product page, so the price you pay is 3.4 times the price you were shown.",
    );
  });

  it("does not claim the product page when the first price came from the cart", () => {
    const cart = report({
      ...blinkit,
      bill: { ...blinkit.bill, firstPriceSource: "cart" },
    });
    expect(story(cart).body).not.toContain("product page");
  });

  it("quotes the largest charge on a bill finding that has no quote of its own", () => {
    expect(story(blinkit).quote).toBe("High demand surge charge Rs 30");
  });

  it("prefers the words on the page when the finding has them", () => {
    expect(story(adobe).quote).toBe("Fee applies of half your remaining annual commitment");
  });

  it("tells the renewal story for a subscription", () => {
    expect(story(adobe)).toMatchObject({
      tone: "found",
      badge: "Subscription trap, found",
      lead: "Rs 1,515 more",
      accent: "after",
      tail: "12 months.",
    });
  });

  it("names a finding that has no price behind it as seen, not proven", () => {
    const shaming = report({
      patterns: [
        finding({
          id: "confirm_shaming",
          label: "Confirm Shaming",
          status: "found",
          proof: "seen",
          note: "A guilt nudge.",
          quote: "No, I hate saving",
        }),
      ],
    });
    expect(story(shaming)).toMatchObject({
      tone: "found",
      lead: "Confirm shaming",
      accent: "seen",
      tail: "with proof.",
      body: "A guilt nudge.",
    });
  });

  it("never gives a clean headline when a login hides the fees", () => {
    const zomato = report({
      stop: { at: "login_wall", claimed: null, note: null, reach: "offer" },
      login: { wallAt: "cart", hidesFees: true, offerSignIn: true },
      bill: bill({ firstPrice: 389 }),
      patterns: [finding({ id: "drip_pricing", label: "Drip Pricing", status: "not_checked" })],
    });
    expect(story(zomato)).toMatchObject({
      tone: "open",
      badge: "Fees behind a login",
      lead: "The fees are",
      accent: "hidden",
      tail: "behind a login.",
    });
  });

  it("says so far when the price held but pages were left unchecked", () => {
    const croma = report({
      bill: bill({ firstPrice: 549, total: 549, increase: 0 }),
      patterns: [finding({ id: "saas_billing", label: "SaaS Billing", status: "not_checked" })],
    });
    expect(story(croma)).toMatchObject({
      tone: "clear",
      badge: "Nothing hidden so far",
      lead: "No fee added",
      accent: "so far",
      tail: ".",
    });
  });

  it("counts what was not checked when there is no price to speak of", () => {
    const stopped = report({
      patterns: [finding({ id: "nagging", label: "Nagging", status: "not_checked" })],
    });
    expect(story(stopped)).toMatchObject({ tone: "open", lead: "1 of 13", accent: "not" });
  });

  it("calls a run clean only when nothing was left unchecked", () => {
    expect(story(report())).toMatchObject({
      tone: "clear",
      badge: "None of the 13 found",
      lead: "None of the 13",
      accent: "found",
    });
  });
});

describe("proofChecks", () => {
  it("lists only what the run proved", () => {
    expect(proofChecks(blinkit, story(blinkit).finding)).toEqual([
      { ok: true, text: "Charges first seen at step 4" },
      { ok: true, text: "Lines add up to the total" },
      { ok: true, text: "Screenshot of step 4 attached", shot: { stepId: "s4", action: null } },
    ]);
  });

  it("confirms a quote only when it matched the page text", () => {
    expect(proofChecks(adobe, trap)[0]).toEqual({
      ok: true,
      text: "Quote found on the page text at step 2",
    });
    const unmatched = { ...trap, quoteCheck: "not_matched" as const };
    expect(proofChecks(adobe, unmatched)[0]).toEqual({
      ok: false,
      text: "Quote not found in the page text, so check the screenshot",
    });
  });

  it("says when the bill does not add up", () => {
    const off = report({ bill: bill({ total: 100, addsUp: false, unexplained: 12 }) });
    expect(proofChecks(off, null)).toEqual([
      { ok: false, text: "Rs 12 of the total is on no line of the bill" },
    ]);
  });

  it("says when the lines come to more than the total", () => {
    const off = report({ bill: bill({ total: 100, addsUp: false, linesOverTotal: 29 }) });
    expect(proofChecks(off, null)).toEqual([
      { ok: false, text: "The lines on this bill come to Rs 29 more than its total" },
    ]);
  });

  it("reads the negative amount a saved report may hold as lines over the total", () => {
    const off = report({ bill: bill({ total: 100, addsUp: false, unexplained: -29 }) });
    expect(proofChecks(off, null)).toEqual([
      { ok: false, text: "The lines on this bill come to Rs 29 more than its total" },
    ]);
  });
});

describe("stats", () => {
  it("shows the multiple, the steps and the count", () => {
    expect(stats(blinkit, 17)).toEqual([
      { value: "3.4x", label: "Shown to paid" },
      { value: "17", label: "Steps walked" },
      { value: "1 of 13", label: "Patterns found" },
    ]);
  });

  it("uses the renewal multiple for a subscription", () => {
    expect(stats(adobe, 20)[0]).toEqual({ value: "2.3x", label: "Offer to renewal" });
  });

  it("drops the multiple when nothing changed", () => {
    expect(stats(report({ bill: bill({ multiple: 1 }) }), 5).map(({ label }) => label)).toEqual([
      "Steps walked",
      "Patterns found",
    ]);
  });
});

describe("totalLine", () => {
  it("says what the total is and what the first price was", () => {
    expect(totalLine(blinkit)).toEqual({
      lead: "Before sign-in.",
      said: "The product page said",
      shown: "Rs 24",
    });
  });

  it("leaves out the first price when it did not change", () => {
    const croma = report({ bill: bill({ firstPrice: 549, total: 549, increase: 0 }) });
    expect(totalLine(croma)).toEqual({ lead: "What you pay.", said: null, shown: null });
  });
});

describe("billPill", () => {
  it("counts the charges added after the first price", () => {
    expect(billPill(blinkit)).toEqual({
      tone: "found",
      text: "3 charges added after the first price",
    });
  });

  it("is clean when the total stayed at the first price", () => {
    const croma = report({ bill: bill({ firstPrice: 549, total: 549, increase: 0 }) });
    expect(billPill(croma)).toEqual({ tone: "clean", text: "Nothing added so far" });
  });

  it("makes no claim without a total", () => {
    expect(billPill(report({ bill: bill({ firstPrice: 389 }) }))).toEqual({
      tone: "unchecked",
      text: "No total reached",
    });
  });
});

describe("rowPill on a run that saw no bill", () => {
  const summary = { state: "done", found: 0, notChecked: 13, total: null } as const;

  it("never calls a blocked site clean", () => {
    const blocked = report({
      bill: bill({ total: null }),
      stop: { ...blinkit.stop, at: "blocked" },
    });
    expect(rowPill(summary, blocked)).toEqual({ tone: "unchecked", text: "Blocked by the site" });
  });

  it("says no price was reached for any other run that stopped early", () => {
    const stopped = report({
      bill: bill({ total: null }),
      stop: { ...blinkit.stop, at: "incomplete" },
    });
    expect(rowPill(summary, stopped)).toEqual({ tone: "unchecked", text: "No price reached" });
  });

  it("does not look clean while the report is still loading", () => {
    expect(rowPill(summary, null)).toEqual({ tone: "unchecked", text: "No price reached" });
  });

  it("stays clean when a bill was seen and nothing was added", () => {
    expect(rowPill({ ...summary, total: 449 }, null)).toEqual({
      tone: "clean",
      text: "Nothing hidden so far",
    });
  });
});

describe("rowPill", () => {
  const summary = { state: "done" as const, found: 1, notChecked: 0, total: 81 };

  it("names a lone finding once the report is known", () => {
    expect(rowPill(summary, blinkit)).toEqual({ tone: "found", text: "Drip pricing" });
    expect(rowPill(summary, null)).toEqual({ tone: "found", text: "1 found" });
  });

  it("counts several findings", () => {
    expect(rowPill({ ...summary, found: 2 }, null)).toEqual({ tone: "found", text: "2 found" });
  });

  it("never reads as clean when a login hid the fees", () => {
    const hidden = report({ login: { wallAt: "cart", hidesFees: true, offerSignIn: true } });
    expect(rowPill({ ...summary, found: 0, notChecked: 8 }, hidden)).toEqual({
      tone: "unchecked",
      text: "Fees behind a login",
    });
  });

  it("keeps so far on a clean row with pages left unchecked", () => {
    expect(rowPill({ ...summary, found: 0, notChecked: 5 }, report())).toEqual({
      tone: "clean",
      text: "Nothing hidden so far",
    });
  });

  it("shows the state of a site still in progress", () => {
    expect(rowPill({ state: "running", found: 0, notChecked: 0, total: null }, null)).toEqual({
      tone: "live",
      text: "Running",
    });
    expect(rowPill({ state: "failed", found: 0, notChecked: 0, total: null }, null)).toEqual({
      tone: "unchecked",
      text: "Failed",
    });
  });
});
