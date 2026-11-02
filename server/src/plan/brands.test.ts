import { describe, expect, it } from "vite-plus/test";

import { domainsIn, namedBrands, unknownSiteIn } from "./brands.ts";
import { IN_SITES } from "./sites/in.ts";

const names = (task: string) => namedBrands(task, IN_SITES.brands).map(({ name }) => name);

describe("namedBrands", () => {
  it("finds a brand in any case", () => {
    expect(names("buy milk on blinkit")).toEqual(["Blinkit"]);
    expect(names("Buy milk on BLINKIT")).toEqual(["Blinkit"]);
  });

  it("finds a brand from its product", () => {
    expect(names("Adobe Photoshop")).toEqual(["Adobe"]);
    expect(names("a Photoshop plan")).toEqual(["Adobe"]);
  });

  it("keeps the order of the task and every brand named", () => {
    expect(names("check Cleartrip, ixigo, EaseMyTrip and MakeMyTrip")).toEqual([
      "Cleartrip",
      "ixigo",
      "EaseMyTrip",
      "MakeMyTrip",
    ]);
  });

  it("prefers the longer name", () => {
    expect(names("Amazon Prime membership")).toEqual(["Amazon Prime"]);
    expect(names("Swiggy Instamart milk")).toEqual(["Swiggy Instamart"]);
  });

  it("lists a brand once however many times it is named", () => {
    expect(names("blinkit milk, blinkit bread")).toEqual(["Blinkit"]);
  });

  it("does not match inside a longer word", () => {
    expect(names("a cromatic scale book")).toEqual([]);
  });
});

describe("domainsIn", () => {
  it("reads a site address from the task", () => {
    expect(domainsIn("buy a lamp on ikea.com/in please")).toEqual([
      { name: "ikea.com", url: "https://ikea.com/in" },
    ]);
    expect(domainsIn("https://www.shop.co.uk/lamps")).toEqual([
      { name: "shop.co.uk", url: "https://www.shop.co.uk/lamps" },
    ]);
  });

  it("does not read decimals or sizes as addresses", () => {
    expect(domainsIn("buy 1.5 l of milk, e.g. toned")).toEqual([]);
  });
});

describe("unknownSiteIn", () => {
  it("reads a capitalised name after on, at or from", () => {
    expect(unknownSiteIn("buy shoes on Decathlon")).toBe("Decathlon");
    expect(unknownSiteIn("buy a pan at Pepperfry")).toBe("Pepperfry");
    expect(unknownSiteIn("buy tea from Blue Tokai")).toBe("Blue Tokai");
  });

  it("reads a lower-case name that ends the task after on", () => {
    expect(unknownSiteIn("buy shoes on decathlon")).toBe("decathlon");
  });

  it("leaves out ordinary phrases", () => {
    expect(unknownSiteIn("buy milk on sale")).toBeNull();
    expect(unknownSiteIn("buy a shirt on monday")).toBeNull();
    expect(unknownSiteIn("buy a phone on EMI")).toBeNull();
    expect(unknownSiteIn("buy earphones")).toBeNull();
  });

  it("leaves out places in a travel task", () => {
    expect(unknownSiteIn("flight from Bangalore to Delhi on 25 Nov")).toBeNull();
  });
});
