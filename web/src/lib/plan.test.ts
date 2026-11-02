import { describe, expect, it } from "vite-plus/test";

import { pickedSites, planNote } from "./plan.ts";
import type { PlanView } from "./types.ts";

const blinkit = { name: "Blinkit", url: "https://blinkit.com/", host: "blinkit.com" };
const zepto = { name: "Zepto", url: "https://www.zepto.com/", host: "zepto.com" };
const croma = { url: "https://www.croma.com/", host: "croma.com", signInId: null };

function plan(overrides: Partial<PlanView> = {}): PlanView {
  return {
    flow: "checkout",
    country: "IN",
    countryName: "India",
    proxied: true,
    category: "groceries",
    source: "category",
    sites: [blinkit, zepto],
    countries: [],
    ...overrides,
  };
}

describe("pickedSites", () => {
  const none = { removed: [], added: [], signIns: {} };

  it("shows what the server picked", () => {
    expect(pickedSites([blinkit, zepto], none).map(({ host }) => host)).toEqual([
      "blinkit.com",
      "zepto.com",
    ]);
  });

  it("leaves out a removed site and keeps an added one after the picks", () => {
    const sites = pickedSites([blinkit, zepto], {
      ...none,
      removed: ["zepto.com"],
      added: [croma],
    });
    expect(sites.map(({ host }) => host)).toEqual(["blinkit.com", "croma.com"]);
  });

  it("does not list a site twice when the server picks one the visitor added", () => {
    const added = [{ ...blinkit, signInId: null }];
    expect(pickedSites([blinkit], { ...none, added })).toHaveLength(1);
  });

  it("attaches a sign-in to its site", () => {
    const sites = pickedSites([blinkit], { ...none, signIns: { "blinkit.com": "sign-1" } });
    expect(sites[0]?.signInId).toBe("sign-1");
  });

  it("never lists more than one audit can take", () => {
    const added = ["a", "b", "c", "d"].map((name) => ({
      url: `https://${name}.test/`,
      host: `${name}.test`,
      signInId: null,
    }));
    expect(pickedSites([blinkit, zepto], { ...none, added })).toHaveLength(4);
  });
});

describe("planNote", () => {
  it("says the sites came from the task", () => {
    expect(planNote(plan({ source: "named" }))).toBe("Named in your task.");
  });

  it("names the kind of site and the country", () => {
    expect(planNote(plan())).toBe("The main groceries and quick commerce sites in India.");
  });

  it("says when a web search found the sites", () => {
    expect(planNote(plan({ source: "search", countryName: "Brazil" }))).toBe(
      "Found by a web search for Brazil.",
    );
  });

  it("says when it could only offer sites that sell almost anywhere", () => {
    expect(planNote(plan({ source: "fallback" }))).toBe("Sites that sell in most countries.");
  });

  it("says nothing before there are sites", () => {
    expect(planNote(plan({ source: "none", sites: [] }))).toBeNull();
  });
});
