import { describe, expect, it } from "vite-plus/test";

import { loadRun } from "../testing/fixtures.ts";
import type { RunRecord } from "../tinyfish/types.ts";
import { judgeRun } from "./judge.ts";
import type { Flow, PatternId, SiteReport } from "./types.ts";

function judge(name: string, flow: Flow = "checkout", edit?: (run: RunRecord) => void): SiteReport {
  const run = loadRun(name);
  edit?.(run);
  return judgeRun({ flow, url: "https://example.test/", run });
}

function pattern(report: SiteReport, id: PatternId) {
  const finding = report.patterns.find((entry) => entry.id === id);
  if (!finding) throw new Error(`no finding for ${id}`);
  return finding;
}

function statuses(report: SiteReport): Record<string, string> {
  return Object.fromEntries(report.patterns.map((entry) => [entry.id, entry.status]));
}

const ORDER_PAGE_PATTERNS: PatternId[] = [
  "basket_sneaking",
  "confirm_shaming",
  "bait_and_switch",
  "drip_pricing",
  "trick_question",
  "subscription_trap",
  "saas_billing",
];

describe("every report", () => {
  it.each([
    "blinkit",
    "blinkit-2",
    "croma",
    "flipkart",
    "myntra",
    "zomato",
    "zomato-signed-in",
    "zomato-signed-in-2",
    "amazon",
    "ajio",
  ])("lists all 13 patterns exactly once for %s", (name) => {
    const ids = judge(name).patterns.map((entry) => entry.id);

    expect(ids).toHaveLength(13);
    expect(new Set(ids).size).toBe(13);
  });
});

describe("drip pricing on checkouts", () => {
  it("proves the Blinkit jump by arithmetic and does not count Items total as a fee", () => {
    const report = judge("blinkit-2");
    const drip = pattern(report, "drip_pricing");

    expect(report.bill.firstPrice).toBe(24);
    expect(report.bill.total).toBe(81);
    expect(report.bill.charges.map((fee) => fee.name)).toEqual([
      "Delivery charge",
      "Handling charge",
      "High demand surge charge",
    ]);
    expect(report.bill.addsUp).toBe(true);
    expect(report.bill.multiple).toBeCloseTo(3.38, 2);
    expect(drip.status).toBe("found");
    expect(drip.proof).toBe("verified");
    expect(drip.step).toBe(4);
    expect(drip.amounts).toContainEqual({ label: "High demand surge charge", amount: 30 });
  });

  it("takes the listed price from the product page, not the agent's MRP", () => {
    const report = judge("flipkart");

    expect(report.bill.firstPrice).toBe(192);
    expect(report.bill.firstPriceSource).toBe("product_page");
    expect(report.bill.total).toBe(201);
    expect(report.bill.addsUp).toBe(true);
    expect(pattern(report, "drip_pricing").status).toBe("found");
  });

  it("recovers a total the agent left null when the page total adds up", () => {
    const report = judge("myntra");

    expect(report.bill.total).toBe(622);
    expect(report.bill.addsUp).toBe(true);
    expect(pattern(report, "drip_pricing").proof).toBe("verified");
  });

  it("checks the Zomato bill against the item total line", () => {
    const report = judge("zomato-signed-in-2");

    expect(report.bill.total).toBe(497.18);
    expect(report.bill.addsUp).toBe(true);
    expect(report.bill.charges.map((fee) => fee.name)).toEqual([
      "Restaurant Packaging Charge",
      "Delivery Partner Fee",
      "Platform Fee",
      "GST (govt. taxes)",
    ]);
    expect(pattern(report, "drip_pricing").status).toBe("found");
  });

  it("reports a rise it cannot reconcile as seen, not verified", () => {
    const report = judge("blinkit-2", "checkout", (run) => {
      if (run.result) run.result["final_price"] = 95;
    });

    expect(report.bill.addsUp).toBe(false);
    expect(report.bill.unexplained).toBe(14);
    expect(pattern(report, "drip_pricing").status).toBe("found");
    expect(pattern(report, "drip_pricing").proof).toBe("seen");
  });

  it("keeps a total below the item price out of the bill, since it is a count", () => {
    const report = judge("blinkit-2", "checkout", (run) => {
      if (run.result) {
        run.result["final_price"] = 1;
        run.result["fees"] = [];
        run.result["steps"] = [];
      }
    });

    expect(report.bill.total).toBeNull();
  });
});

describe("the live Blinkit run of 1 Nov, checked against its screenshots", () => {
  const report = judge("blinkit-3");

  it("has the bill the cart showed", () => {
    expect(report.item).toBe("Country Delight Buffalo Fresh Milk");
    expect(report.bill.currency).toBe("INR");
    expect(report.bill.firstPrice).toBe(52);
    expect(report.bill.total).toBe(79);
    expect(report.bill.increase).toBe(27);
    expect(report.bill.addsUp).toBe(true);
    expect(report.bill.charges.map(({ name, amount }) => [name, amount])).toEqual([
      ["Delivery charge", 25],
      ["Handling charge", 2],
    ]);
  });

  it("finds drip pricing with proof and stops honestly at the login wall", () => {
    const drip = pattern(report, "drip_pricing");

    expect(drip.status).toBe("found");
    expect(drip.proof).toBe("verified");
    expect(drip.step).toBe(3);
    expect(drip.screenshot?.action).toBe("Get full cart and bill details");
    expect(report.stop.at).toBe("login_wall");
    expect(report.priceLabel).toBe("price_before_sign_in");
    expect(report.login.offerSignIn).toBe(true);
  });

  it("says the payment page was out of reach, and does not blame the bill", () => {
    const saas = pattern(report, "saas_billing");

    expect(saas.status).toBe("not_checked");
    expect(saas.note).toMatch(/payment page/i);
    expect(saas.note).not.toMatch(/bill/i);
  });

  it("flags that the agent changed its browser to get past a block", () => {
    expect(report.flags.map((flag) => flag.kind)).toEqual(["browser_changed"]);
  });

  it("gives every page its own working screenshot", () => {
    const shots = report.pages.map((page) => page.screenshot?.stepId);

    expect(new Set(shots).size).toBe(4);
  });
});

describe("currency", () => {
  it.each([
    ["\u20B9", "INR"],
    ["INR", "INR"],
    ["INR (\u20B9)", "INR"],
    ["Rs", "INR"],
    ["$", "USD"],
    ["USD", "USD"],
  ])("reads %s as %s", (written, code) => {
    const report = judge("blinkit-3", "checkout", (run) => {
      if (run.result) run.result["currency"] = written;
    });

    expect(report.bill.currency).toBe(code);
  });

  it("does not guess at a currency it cannot read", () => {
    const report = judge("blinkit-3", "checkout", (run) => {
      if (run.result) run.result["currency"] = "credits";
    });

    expect(report.bill.currency).toBeNull();
  });
});

describe("login walls", () => {
  it("never gives a clean report when the site hides its fees", () => {
    const report = judge("zomato");

    expect(report.stop.at).toBe("login_wall");
    expect(report.bill.total).toBeNull();
    expect(report.login.hidesFees).toBe(true);
    expect(report.login.offerSignIn).toBe(true);
    expect(report.priceLabel).toBe("none");
    expect(pattern(report, "drip_pricing").status).toBe("not_checked");
    expect(pattern(report, "drip_pricing").note).toMatch(/sign-in/i);
  });

  it("labels an itemised bill behind a login wall as price before sign-in", () => {
    const report = judge("blinkit-2");

    expect(report.priceLabel).toBe("price_before_sign_in");
    expect(report.login.hidesFees).toBe(false);
    expect(report.login.offerSignIn).toBe(true);
  });

  it("uses a cart's stated total when the agent left the final price empty", () => {
    const report = judge("croma", "checkout", (run) => {
      if (!run.result) return;
      run.result["final_price"] = null;
      const pages = run.result["steps"] as { price_shown: number | null; note: string }[];
      for (const page of pages) {
        if (page.note.includes("Total")) page.note = "Order Summary: Price ₹549, Total ₹549.";
      }
    });

    expect(report.bill.total).toBe(549);
    expect(report.bill.increase).toBe(0);
    expect(report.login.hidesFees).toBe(false);
  });

  it("does not treat a cart's item price as a total when no total was stated", () => {
    const report = judge("croma", "checkout", (run) => {
      if (!run.result) return;
      run.result["final_price"] = null;
      const pages = run.result["steps"] as { note: string }[];
      for (const page of pages) page.note = "Cart shows the item.";
    });

    expect(report.bill.total).toBeNull();
  });

  it("labels Croma's honest total as price before sign-in and finds no drip so far", () => {
    const report = judge("croma");
    const drip = pattern(report, "drip_pricing");

    expect(report.priceLabel).toBe("price_before_sign_in");
    expect(report.bill.total).toBe(549);
    expect(drip.status).toBe("not_found");
    expect(drip.soFar).toBe(true);
  });
});

describe("the agent's claims", () => {
  it("demotes a payment_page claim made after running out of budget", () => {
    const report = judge("amazon");

    expect(report.stop.claimed).toBe("payment_page");
    expect(report.stop.at).toBe("incomplete");
    expect(report.bill.total).toBeNull();
    expect(report.missing.join(" ")).toMatch(/payment page/i);
    for (const id of ORDER_PAGE_PATTERNS) {
      expect(pattern(report, id).status).toBe("not_checked");
    }
  });

  it("does not believe a final price with no steps, fees or pages behind it", () => {
    const report = judge("zomato-signed-in");

    expect(report.stop.at).toBe("incomplete");
    expect(report.bill.total).toBeNull();
    expect(report.missing.join(" ")).toMatch(/497\.18/);
    expect(report.patterns.every((entry) => entry.status === "not_checked")).toBe(true);
  });

  it("drops an item from basket sneaking when the agent added it itself", () => {
    const report = judge("zomato-signed-in-2", "checkout", (run) => {
      if (run.result) {
        run.result["added_without_asking"] = [{ name: "Coke Tin", cost: 66.66, seen_at_step: 2 }];
      }
      run.steps.push({
        id: "own-add",
        timestamp: "2026-10-29T17:00:00Z",
        status: "RUNNING",
        action: "Add one Coke Tin to the cart",
        screenshot: null,
        duration: null,
      });
    });

    expect(pattern(report, "basket_sneaking").status).toBe("not_found");
  });

  it("does not count a pre-ticked donation that is not in the total", () => {
    const basket = pattern(judge("zomato-signed-in-2"), "basket_sneaking");

    expect(basket.status).toBe("not_found");
    expect(basket.soFar).toBe(true);
  });

  it("counts a pre-ticked extra whose amount is in the total", () => {
    const report = judge("blinkit-2", "checkout", (run) => {
      if (run.result) {
        run.result["pre_ticked_options"] = [
          { label: "Delivery insurance", cost: 15, included_in_total: true, seen_at_step: 4 },
        ];
        run.result["final_price"] = 96;
      }
    });
    const basket = pattern(report, "basket_sneaking");

    expect(basket.status).toBe("found");
    expect(basket.proof).toBe("verified");
    expect(basket.amounts).toContainEqual({ label: "Delivery insurance", amount: 15 });
  });

  it("ignores a pre-ticked option the agent marks included when the bill says otherwise", () => {
    const report = judge("blinkit-2", "checkout", (run) => {
      if (run.result) {
        run.result["pre_ticked_options"] = [
          { label: "Delivery insurance", cost: 15, included_in_total: true, seen_at_step: 4 },
        ];
      }
    });

    expect(pattern(report, "basket_sneaking").status).toBe("not_found");
  });
});

describe("text patterns", () => {
  it("shows false urgency as seen, with the quote and step", () => {
    const report = judge("blinkit-2", "checkout", (run) => {
      if (run.result) {
        run.result["pressure_messages"] = [{ text: "Only 2 left, hurry!", seen_at_step: 3 }];
      }
    });
    const urgency = pattern(report, "false_urgency");

    expect(urgency.status).toBe("found");
    expect(urgency.proof).toBe("seen");
    expect(urgency.quote).toBe("Only 2 left, hurry!");
    expect(urgency.step).toBe(3);
  });

  it("does not treat discounts as urgency", () => {
    expect(pattern(judge("adobe-subscription", "subscription"), "false_urgency").status).toBe(
      "not_found",
    );
  });

  it("finds guilt nudges as confirm shaming, seen", () => {
    const finding = pattern(judge("zomato-signed-in-2"), "confirm_shaming");

    expect(finding.status).toBe("found");
    expect(finding.proof).toBe("seen");
    expect(finding.quote).toMatch(/brighten their day|malnutrition/);
  });

  it("finds shaming decline wording", () => {
    const finding = pattern(
      judge("blinkit-2", "checkout", (run) => {
        if (run.result) run.result["decline_wording"] = ["No, I'll risk it"];
      }),
      "confirm_shaming",
    );

    expect(finding.status).toBe("found");
    expect(finding.quote).toBe("No, I'll risk it");
  });

  it("rejects an agent finding with no quote or a step that does not exist", () => {
    const report = judge("adobe-subscription", "subscription", (run) => {
      if (!run.result) return;
      run.result["pattern_checks"] = [
        { pattern: "nagging", status: "found", quote: null, seen_at_step: 2, note: "felt naggy" },
        { pattern: "trick_question", status: "found", quote: "Tick to opt out", seen_at_step: 99 },
      ];
    });

    expect(pattern(report, "nagging").status).toBe("not_found");
    expect(pattern(report, "nagging").note).toMatch(/no quote/i);
    expect(pattern(report, "trick_question").status).toBe("not_found");
  });

  it("says not checked when no one looked for a pattern", () => {
    expect(pattern(judge("blinkit-2"), "nagging").status).toBe("not_checked");
  });
});

describe("subscriptions, against the hand-checked table", () => {
  it("matches Adobe run 2", () => {
    expect(statuses(judge("adobe-subscription", "subscription"))).toEqual({
      false_urgency: "not_found",
      basket_sneaking: "not_found",
      confirm_shaming: "not_found",
      forced_action: "not_found",
      subscription_trap: "found",
      interface_interference: "found",
      bait_and_switch: "not_found",
      drip_pricing: "not_found",
      disguised_advertisement: "not_found",
      nagging: "not_found",
      trick_question: "not_found",
      saas_billing: "not_checked",
      rogue_malware: "not_found",
    });
  });

  it.each(["spotify-subscription", "amazon-prime-subscription"])("matches %s", (name) => {
    expect(statuses(judge(name, "subscription"))).toEqual({
      false_urgency: "not_found",
      basket_sneaking: "not_checked",
      confirm_shaming: "not_checked",
      forced_action: "not_found",
      subscription_trap: "not_checked",
      interface_interference: "not_found",
      bait_and_switch: "not_checked",
      drip_pricing: "not_checked",
      disguised_advertisement: "not_found",
      nagging: "not_found",
      trick_question: "not_checked",
      saas_billing: "not_checked",
      rogue_malware: "not_found",
    });
  });

  it("matches LinkedIn and says the price is hidden", () => {
    const report = judge("linkedin-subscription", "subscription");

    expect(statuses(report)).toEqual({
      false_urgency: "not_checked",
      basket_sneaking: "not_checked",
      confirm_shaming: "not_checked",
      forced_action: "not_found",
      subscription_trap: "not_checked",
      interface_interference: "not_checked",
      bait_and_switch: "not_checked",
      drip_pricing: "not_checked",
      disguised_advertisement: "not_found",
      nagging: "not_found",
      trick_question: "not_checked",
      saas_billing: "not_checked",
      rogue_malware: "not_found",
    });
    expect(report.login.hidesFees).toBe(true);
    expect(pattern(report, "drip_pricing").note).toMatch(/price/i);
    expect(report.bill.currency).toBeNull();
  });

  it("does not let the required account count as forced action", () => {
    const finding = pattern(judge("adobe-subscription", "subscription"), "forced_action");

    expect(finding.status).toBe("not_found");
    expect(finding.note).toMatch(/account/i);
  });

  it("counts marketing consent tied to Continue as forced action, seen", () => {
    const quote =
      'By clicking "Continue", I agree that Adobe family of companies can keep me informed by sending personalized emails about products and services.';
    const finding = pattern(
      judge("adobe-subscription", "subscription", (run) => {
        if (run.result) {
          run.result["consent_text"] = [
            { text: quote, seen_at_step: 4, can_decline_separately: false },
          ];
        }
      }),
      "forced_action",
    );

    expect(finding.status).toBe("found");
    expect(finding.proof).toBe("seen");
    expect(finding.quote).toBe(quote);
    expect(finding.step).toBe(4);
  });

  it("ignores consent the buyer can decline with its own checkbox", () => {
    const finding = pattern(
      judge("adobe-subscription", "subscription", (run) => {
        if (run.result) {
          run.result["consent_text"] = [
            { text: "Send me marketing emails", seen_at_step: 4, can_decline_separately: true },
          ];
        }
      }),
      "forced_action",
    );

    expect(finding.status).toBe("not_found");
  });

  it("flags the cancellation fee first seen after the price it changes", () => {
    const trap = pattern(judge("adobe-subscription", "subscription"), "subscription_trap");

    expect(trap.status).toBe("found");
    expect(trap.proof).toBe("seen");
    expect(trap.quote).toMatch(/half your remaining annual commitment/);
    expect(trap.step).toBe(2);
    expect(trap.note).toMatch(/after the price/i);
  });

  it("keeps GST inside the first price and finds no drip so far on Adobe", () => {
    const report = judge("adobe-subscription", "subscription");
    const drip = pattern(report, "drip_pricing");

    expect(report.bill.firstPrice).toBe(1199);
    expect(report.bill.total).toBe(1199);
    expect(report.bill.addsUp).toBe(true);
    expect(report.bill.charges).toEqual([]);
    expect(drip.status).toBe("not_found");
    expect(drip.soFar).toBe(true);
  });

  it("works out the contract and renewal totals", () => {
    const { subscription } = judge("adobe-subscription", "subscription");

    expect(subscription?.contractTotal).toBe(14388);
    expect(subscription?.renewalTotal).toBe(32568);
    expect(subscription?.renewalMultiple).toBeCloseTo(2.26, 2);
  });

  it("does not take a plan price for a final price when no bill was shown", () => {
    const report = judge("amazon-prime-subscription", "subscription");

    expect(report.bill.total).toBeNull();
    expect(report.bill.firstPrice).toBe(399);
    expect(report.priceLabel).toBe("none");
  });

  it("does not settle anything from the failed Adobe run", () => {
    const report = judge("adobe-subscription-incomplete", "subscription");

    expect(report.stop.at).toBe("incomplete");
    expect(report.bill.total).toBeNull();
    expect(pattern(report, "subscription_trap").status).toBe("not_checked");
  });

  it("drops the Spotify tax line that has no amount", () => {
    expect(judge("spotify-subscription", "subscription").bill.charges).toEqual([]);
  });

  it("shows every billing option", () => {
    const { subscription } = judge("adobe-subscription", "subscription", (run) => {
      if (run.result) {
        run.result["plan_options"] = [
          {
            label: "Annual, billed monthly",
            price: 1199,
            period: "month",
            commitment: "12 months",
            fee_line: "Fee applies of half your remaining annual commitment",
            selected_by_default: true,
            first_seen_at_step: 1,
          },
          {
            label: "Monthly",
            price: 4071,
            period: "month",
            commitment: null,
            fee_line: "Cancel anytime, no fee",
            selected_by_default: false,
            first_seen_at_step: 2,
          },
        ];
      }
    });

    expect(subscription?.options).toHaveLength(2);
    expect(subscription?.noCommitmentPrice).toBe(4071);
  });

  it("flags a no-commitment price hidden until a later page", () => {
    const finding = pattern(
      judge("spotify-subscription", "subscription", (run) => {
        if (run.result) {
          run.result["plan_options"] = [
            {
              label: "Annual",
              price: 100,
              period: "month",
              commitment: "12 months",
              selected_by_default: true,
              first_seen_at_step: 1,
            },
            {
              label: "Monthly",
              price: 300,
              period: "month",
              commitment: null,
              selected_by_default: false,
              first_seen_at_step: 2,
            },
          ];
        }
      }),
      "interface_interference",
    );

    expect(finding.status).toBe("found");
    expect(finding.proof).toBe("seen");
    expect(finding.step).toBe(2);
  });
});

describe("blocked and failed runs", () => {
  it("reports a site that never loaded as incomplete, with nothing claimed", () => {
    const report = judge("blinkit-page-never-loaded");

    expect(report.stop.at).toBe("incomplete");
    expect(report.stop.reach).toBe("pages");
    expect(report.bill.total).toBeNull();
    expect(report.login.offerSignIn).toBe(false);
    expect(report.patterns.some((entry) => entry.status === "found")).toBe(false);
    expect(report.patterns.find((entry) => entry.id === "drip_pricing")?.status).toBe(
      "not_checked",
    );
  });

  it("reports Ajio as blocked with nothing on the bill", () => {
    const report = judge("ajio");

    expect(report.stop.at).toBe("blocked");
    expect(report.bill.total).toBeNull();
    expect(pattern(report, "drip_pricing").status).toBe("not_checked");
  });

  it("flags a browser the agent reconfigured", () => {
    expect(judge("ajio").flags.map((flag) => flag.kind)).toContain("browser_changed");
    expect(judge("linkedin-subscription", "subscription").flags.map((flag) => flag.kind)).toContain(
      "browser_changed",
    );
    expect(judge("blinkit-2").flags).toEqual([]);
  });

  it("reports a cancelled run with no result as incomplete and says what is missing", () => {
    const report = judge("blinkit-2", "checkout", (run) => {
      run.status = "CANCELLED";
      run.result = null;
    });

    expect(report.stop.at).toBe("incomplete");
    expect(report.patterns.every((entry) => entry.status === "not_checked")).toBe(true);
    expect(report.missing.join(" ")).toMatch(/stopped/i);
  });

  it("reports a failed run as an error", () => {
    const report = judge("blinkit-2", "checkout", (run) => {
      run.status = "FAILED";
      run.result = null;
    });

    expect(report.stop.at).toBe("error");
  });
});

describe("safety scan", () => {
  function withAction(action: string) {
    return judge("blinkit-2", "checkout", (run) => {
      run.steps.push({
        id: "typed",
        timestamp: "2026-10-31T08:27:50Z",
        status: "RUNNING",
        action,
        screenshot: null,
        duration: null,
      });
    });
  }

  it("flags typed contact details", () => {
    expect(withAction("Enter email test@test.com in the contact field").flags[0]?.kind).toBe(
      "contact_entered",
    );
    expect(withAction("Type phone number 9999999999").flags[0]?.kind).toBe("contact_entered");
  });

  it("flags a payment click", () => {
    expect(withAction("Click Place Order to finish").flags[0]?.kind).toBe("payment_click");
    expect(withAction("Select Cash on Delivery as payment").flags[0]?.kind).toBe("payment_click");
  });

  it("leaves location entry and reading a form alone", () => {
    expect(withAction("Type delivery location Koramangala with pincode").flags).toEqual([]);
    expect(withAction("Check email entry page details").flags).toEqual([]);
    expect(withAction("Close the payment offer popup").flags).toEqual([]);
  });
});

describe("step screenshots", () => {
  it("points the Blinkit drip finding at the cart bill step", () => {
    const drip = pattern(judge("blinkit-2"), "drip_pricing");

    expect(drip.screenshot?.action).toMatch(/cart/i);
    expect(drip.screenshot?.stepId).toBeTruthy();
  });

  it("points Adobe's cancellation fee at a checkout options step", () => {
    const trap = pattern(judge("adobe-subscription", "subscription"), "subscription_trap");
    const run = loadRun("adobe-subscription");
    const index = run.steps.findIndex((step) => step.id === trap.screenshot?.stepId);

    expect(index).toBeGreaterThanOrEqual(13);
    expect(index).toBeLessThanOrEqual(16);
  });

  it("gives each page its own step, and never the final write-up", () => {
    const report = judge("blinkit-page-never-loaded");
    const shots = report.pages.map((page) => page.screenshot?.stepId);

    expect(new Set(shots).size).toBe(report.pages.length);
    for (const page of report.pages) {
      expect(page.screenshot?.action).not.toMatch(/^report findings/i);
    }
  });

  it("leaves the screenshot empty when the run kept no steps", () => {
    expect(pattern(judge("flipkart"), "drip_pricing").screenshot).toBeNull();
  });
});
