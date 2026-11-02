import { describe, expect, it } from "vite-plus/test";

import { CATEGORIES } from "./category.ts";
import { FALLBACK_SITES } from "./sites/fallback.ts";
import { GB_SITES } from "./sites/gb.ts";
import { IN_SITES } from "./sites/in.ts";
import { US_SITES } from "./sites/us.ts";
import type { CountrySites } from "./types.ts";

const FILES: [string, CountrySites][] = [
  ["India", IN_SITES],
  ["United States", US_SITES],
  ["United Kingdom", GB_SITES],
  ["fallback", FALLBACK_SITES],
];

describe.each(FILES)("the %s data file", (_name, sites) => {
  it.each(CATEGORIES)("names one to three https sites for %s", (category) => {
    const picks = sites.categories[category];
    expect(picks.length).toBeGreaterThanOrEqual(1);
    expect(picks.length).toBeLessThanOrEqual(3);
    for (const { url } of picks) expect(new URL(url).protocol).toBe("https:");
    expect(new Set(picks.map(({ url }) => new URL(url).hostname)).size).toBe(picks.length);
  });

  it("writes every brand alias in lower case", () => {
    for (const { aliases } of sites.brands) {
      for (const alias of aliases) expect(alias).toBe(alias.toLowerCase());
    }
  });
});

describe("the India data file", () => {
  it("leads each tested category with the sites that worked in testing", () => {
    expect(IN_SITES.categories.groceries[0]?.name).toBe("Blinkit");
    expect(IN_SITES.categories.electronics[0]?.name).toBe("Croma");
    expect(IN_SITES.categories.fashion[0]?.name).toBe("Myntra");
    expect(IN_SITES.categories.food_delivery[0]?.name).toBe("Zomato");
  });

  it("uses Adobe's Indian site", () => {
    const adobe = IN_SITES.brands.find(({ name }) => name === "Adobe");
    expect(adobe?.url).toContain("adobe.com/in");
  });
});
