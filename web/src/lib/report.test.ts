import { describe, expect, it } from "vite-plus/test";

import { bill, finding, report, subscription } from "../testing/report.ts";
import {
  billLines,
  counts,
  headline,
  logoutNote,
  orderedPatterns,
  proofLabel,
  signInOffer,
  stopSummary,
} from "./report.ts";

describe("headline", () => {
  it("leads with the two numbers when the price rose", () => {
    const blinkit = report({
      priceLabel: "final",
      bill: bill({ firstPrice: 24, total: 81, increase: 57 }),
    });
    expect(headline(blinkit)).toEqual({
      kind: "price",
      shownLabel: "Shown",
      shown: "Rs 24",
      paidLabel: "You pay",
      paid: "Rs 81",
      gap: "Rs 57 more",
    });
  });

  it("never calls a price final when the run stopped at a login", () => {
    const blinkit = report({
      priceLabel: "price_before_sign_in",
      bill: bill({ firstPrice: 24, total: 81, increase: 57 }),
    });
    expect(headline(blinkit)).toMatchObject({ kind: "price", paidLabel: "Before sign-in" });
  });

  it("labels a total from an unfinished run as the last price seen", () => {
    const zomato = report({
      priceLabel: "last_seen",
      bill: bill({ firstPrice: 441.66, total: 497.18, increase: 55.52 }),
    });
    expect(headline(zomato)).toMatchObject({ paidLabel: "Last price seen", gap: "Rs 55.52 more" });
  });

  it("uses the renewal jump on a subscription whose bill shows no rise", () => {
    const adobe = report({
      flow: "subscription",
      priceLabel: "last_seen",
      bill: bill({ firstPrice: 1199, total: 1199, increase: 0 }),
      subscription: subscription({
        introPrice: 1199,
        introPeriod: "12 months",
        priceAfterIntro: 2714,
      }),
    });
    expect(headline(adobe)).toEqual({
      kind: "price",
      shownLabel: "Shown for 12 months",
      shown: "Rs 1,199",
      paidLabel: "Then you pay",
      paid: "Rs 2,714",
      gap: "Rs 1,515 more",
    });
  });

  it("falls back to the strongest finding, arithmetic before a quote", () => {
    const flat = report({
      bill: bill({ firstPrice: 549, total: 549, increase: 0 }),
      patterns: [
        finding({
          id: "false_urgency",
          label: "False Urgency",
          status: "found",
          proof: "seen",
          quote: "Only 2 left",
        }),
        finding({
          id: "basket_sneaking",
          label: "Basket Sneaking",
          status: "found",
          proof: "verified",
          note: "A Rs 10 donation was added.",
        }),
      ],
    });
    expect(headline(flat)).toEqual({
      kind: "finding",
      title: "Basket Sneaking",
      detail: "A Rs 10 donation was added.",
    });
  });

  it("quotes the finding when that is the proof", () => {
    const urgent = report({
      patterns: [
        finding({
          id: "false_urgency",
          label: "False Urgency",
          status: "found",
          proof: "seen",
          quote: "Only 2 left",
          note: "Countdown beside the price.",
        }),
      ],
    });
    expect(headline(urgent)).toMatchObject({ detail: "Countdown beside the price." });
  });

  it("does not earn a clean result when patterns went unchecked", () => {
    const croma = report({
      stop: { at: "login_wall", claimed: "login_wall", note: null, reach: "offer" },
      patterns: [finding({ id: "drip_pricing", label: "Drip Pricing", status: "not_checked" })],
    });
    expect(headline(croma)).toMatchObject({ kind: "open", title: "1 of 13 not checked" });
  });

  it("states a clean result only when all 13 were checked", () => {
    expect(headline(report())).toMatchObject({ kind: "clear", title: "None of the 13 found" });
  });
});

describe("orderedPatterns", () => {
  it("puts found first, proven by arithmetic ahead of quotes, and clean rows last", () => {
    const rows = orderedPatterns(
      report({
        patterns: [
          finding({ id: "nagging", label: "Nagging", status: "found", proof: "seen" }),
          finding({
            id: "drip_pricing",
            label: "Drip Pricing",
            status: "found",
            proof: "verified",
          }),
          finding({ id: "trick_question", label: "Trick Question", status: "not_checked" }),
        ],
      }),
    );
    expect(rows).toHaveLength(13);
    expect(rows.slice(0, 3).map((row) => row.id)).toEqual([
      "drip_pricing",
      "nagging",
      "trick_question",
    ]);
    expect(rows.at(-1)?.status).toBe("not_found");
  });
});

describe("counts", () => {
  it("adds up each status", () => {
    const summary = counts(
      report({
        patterns: [
          finding({ id: "nagging", status: "found" }),
          finding({ id: "drip_pricing", status: "not_checked" }),
        ],
      }),
    );
    expect(summary).toEqual({ found: 1, notChecked: 1, notFound: 11 });
  });
});

describe("billLines", () => {
  it("marks fees that appeared after the first price with their step", () => {
    const lines = billLines(
      bill({
        firstPrice: 52,
        firstPriceStep: 2,
        firstPriceSource: "product_page",
        charges: [
          { name: "Delivery charge", amount: 25, firstSeenAtStep: 3 },
          { name: "Handling charge", amount: 2, firstSeenAtStep: 2 },
        ],
        total: 79,
      }),
    );
    expect(lines).toEqual([
      {
        label: "Price on the product page",
        amount: 52,
        sign: "base",
        step: 2,
        late: false,
        tag: null,
      },
      { label: "Delivery charge", amount: 25, sign: "plus", step: 3, late: true, tag: null },
      { label: "Handling charge", amount: 2, sign: "plus", step: 2, late: false, tag: null },
    ]);
  });

  it("starts from the items total when the cart holds more than the first price", () => {
    const [first] = billLines(bill({ firstPrice: 52, itemsTotal: 104, total: 104 }));
    expect(first).toMatchObject({ label: "Items in the cart", amount: 104 });
  });

  it("flags extras and subtracts discounts", () => {
    const lines = billLines(
      bill({
        firstPrice: 100,
        firstPriceStep: 1,
        extras: [{ name: "Tip", amount: 20, firstSeenAtStep: 3 }],
        discounts: [{ name: "Coupon", amount: 10, firstSeenAtStep: 3 }],
      }),
    );
    expect(lines[1]).toMatchObject({ label: "Tip", sign: "plus", tag: "Added without asking" });
    expect(lines[2]).toMatchObject({ label: "Coupon", sign: "minus", amount: 10 });
  });

  it("is empty when no price was seen", () => {
    expect(billLines(bill())).toEqual([]);
  });
});

describe("proofLabel", () => {
  it("names arithmetic proof", () => {
    expect(proofLabel(finding({ proof: "verified" }))).toBe("Verified by arithmetic");
  });

  it("says when a quote matched the captured page", () => {
    expect(proofLabel(finding({ proof: "seen", quoteCheck: "matched" }))).toBe(
      "Seen, with proof. The quote matches the page text.",
    );
  });

  it("says when a quote could not be matched", () => {
    expect(proofLabel(finding({ proof: "seen", quoteCheck: "not_matched" }))).toBe(
      "Seen, with proof. The quote was not found in the captured page text, so check the screenshot.",
    );
  });

  it("stays plain when no page text was captured", () => {
    expect(proofLabel(finding({ proof: "seen", quoteCheck: "unavailable" }))).toBe(
      "Seen, with proof",
    );
  });
});

describe("stopSummary", () => {
  it("says a login hides the fees when no bill was shown", () => {
    const summary = stopSummary(
      report({
        stop: { at: "login_wall", claimed: "login_wall", note: null, reach: "offer" },
        login: { wallAt: "/login", hidesFees: true, offerSignIn: true },
      }),
    );
    expect(summary).toContain("hides its fees");
  });

  it("warns that later steps can add fees when a bill was shown", () => {
    const summary = stopSummary(
      report({ stop: { at: "login_wall", claimed: "login_wall", note: null, reach: "order" } }),
    );
    expect(summary).toContain("can still add fees");
  });
});

describe("signInOffer", () => {
  it("offers the full price when the site hides its fees", () => {
    const offer = signInOffer(
      report({ login: { wallAt: "/login", hidesFees: true, offerSignIn: true } }),
    );
    expect(offer).toBe("Sign in for the full price");
  });

  it("makes no offer when none is due", () => {
    expect(signInOffer(report())).toBeNull();
  });
});

describe("logoutNote", () => {
  it("is silent for a guest run", () => {
    expect(logoutNote(null)).toBeNull();
  });

  it("confirms the logout", () => {
    expect(logoutNote("logged_out")).toContain("Logged out");
  });

  it("says plainly when the logout could not be confirmed", () => {
    expect(logoutNote("not_confirmed")).toContain("could not confirm");
  });
});
