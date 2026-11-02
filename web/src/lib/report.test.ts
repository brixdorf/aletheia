import { describe, expect, it } from "vite-plus/test";

import { bill, finding, report } from "../testing/report.ts";
import {
  billLines,
  counts,
  logoutNote,
  orderedPatterns,
  signInOffer,
  stopSummary,
} from "./report.ts";
import { PATTERN_IDS } from "./types.ts";

describe("orderedPatterns", () => {
  it("puts found first, the most serious ahead, and clean rows last", () => {
    const rows = orderedPatterns(
      report({
        patterns: [
          finding({ id: "nagging", label: "Nagging", status: "found" }),
          finding({
            id: "drip_pricing",
            label: "Drip pricing",
            severity: "high",
            status: "found",
          }),
          finding({ id: "trick_question", label: "Trick question", status: "not_checked" }),
        ],
      }),
    );
    expect(rows).toHaveLength(PATTERN_IDS.length);
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
    expect(summary).toEqual({ found: 1, notChecked: 1, notFound: PATTERN_IDS.length - 2 });
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
