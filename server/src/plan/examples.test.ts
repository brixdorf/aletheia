import { describe, expect, it } from "vite-plus/test";

import { COVERED_COUNTRIES } from "./country.ts";
import { examplesFor } from "./examples.ts";
import { SitePlanner } from "./planner.ts";

const every = (country: string | null, city: string | null = null) =>
  examplesFor(country, city, () => 0);

function allOf(country: string | null, city: string | null = null): string[] {
  const seen = new Set<string>();
  let draw = 0;
  const random = () => {
    draw = (draw * 31 + 7) % 101;
    return draw / 101;
  };
  for (let round = 0; round < 200; round += 1) {
    for (const example of examplesFor(country, city, random)) seen.add(example);
  }
  return [...seen];
}

describe("examplesFor", () => {
  it("shows three", () => {
    expect(every("IN")).toHaveLength(3);
    expect(every("KE")).toHaveLength(3);
    expect(every(null)).toHaveLength(3);
  });

  it("uses real cities in the visitor's country", () => {
    const examples = allOf("IN");

    expect(examples).toContain("Book a flight from Mumbai to Delhi");
    expect(examples).toContain("Book a hotel in Delhi for this weekend");
  });

  it("starts from the visitor's own city when it is known", () => {
    const examples = allOf("IN", "Pune, Maharashtra");

    expect(examples).toContain("Book a flight from Pune to Mumbai");
    expect(examples).toContain("Book a hotel in Mumbai for this weekend");
  });

  it("does not fly from a city to itself", () => {
    expect(allOf("IN", "Mumbai, Maharashtra")).toContain("Book a flight from Mumbai to Delhi");
  });

  it("names the country's own stores", () => {
    const germany = allOf("DE");

    expect(germany).toContain("Buy a laptop on MediaMarkt");
    expect(germany).toContain("Order dinner on Lieferando");
  });

  it("never offers groceries or jokes", () => {
    for (const country of COVERED_COUNTRIES) {
      expect(allOf(country).join(" ")).not.toMatch(/milk|egg|bread|grocer|gnome/i);
    }
  });

  it("changes from one visit to the next", () => {
    const first = examplesFor("IN", null, () => 0.1).join();
    let draw = 0;
    const second = examplesFor("IN", null, () => {
      draw += 0.3;
      return draw % 1;
    }).join();

    expect(second).not.toBe(first);
  });
});

describe.each(COVERED_COUNTRIES)("the examples for %s", (country) => {
  it("each pick a site with no search", async () => {
    const planner = new SitePlanner(() => Promise.reject(new Error("no search needed")));

    for (const example of allOf(country)) {
      const plan = await planner.plan(example, country);
      expect(plan.sites.length, example).toBeGreaterThan(0);
      expect(["named", "category"], example).toContain(plan.source);
    }
  });
});
