import { describe, expect, it } from "vite-plus/test";

import { countryChoices, countryName, proxyCountry, resolveCountry } from "./country.ts";

describe("resolveCountry", () => {
  it("takes the visitor's own choice over everything else", () => {
    expect(resolveCountry({ choice: "GB", cloudflare: "IN", timeZone: "Asia/Kolkata" })).toBe("GB");
  });

  it("treats the worldwide choice as no country at all", () => {
    expect(resolveCountry({ choice: "ZZ", cloudflare: "IN" })).toBeNull();
  });

  it("reads Cloudflare's country header", () => {
    expect(resolveCountry({ cloudflare: "US", timeZone: "Asia/Kolkata" })).toBe("US");
    expect(resolveCountry({ cloudflare: "in" })).toBe("IN");
  });

  it.each(["XX", "T1", "", "India"])("ignores the Cloudflare value %s", (cloudflare) => {
    expect(resolveCountry({ cloudflare, timeZone: "Asia/Kolkata" })).toBe("IN");
  });

  it("falls back to the time zone before the language, since en-US is a common default", () => {
    expect(resolveCountry({ timeZone: "Asia/Calcutta", languages: ["en-US"] })).toBe("IN");
    expect(resolveCountry({ timeZone: "America/Chicago", languages: ["en-GB"] })).toBe("US");
    expect(resolveCountry({ timeZone: "Australia/Sydney" })).toBe("AU");
  });

  it("uses the first language with a region when the time zone says nothing", () => {
    expect(resolveCountry({ timeZone: "Etc/UTC", languages: ["en", "en-GB", "fr-FR"] })).toBe("GB");
  });

  it("gives up rather than guess", () => {
    expect(resolveCountry({ timeZone: "Etc/UTC", languages: ["en"] })).toBeNull();
    expect(resolveCountry({})).toBeNull();
  });
});

describe("proxyCountry", () => {
  it("passes on a country TinyFish can browse from", () => {
    expect(proxyCountry("IN")).toBe("IN");
    expect(proxyCountry("US")).toBe("US");
  });

  it("leaves out any other country", () => {
    expect(proxyCountry("BR")).toBeNull();
    expect(proxyCountry(null)).toBeNull();
  });
});

describe("countryName", () => {
  it("names a country in plain English", () => {
    expect(countryName("IN")).toBe("India");
    expect(countryName("GB")).toBe("United Kingdom");
    expect(countryName(null)).toBe("Worldwide");
  });
});

describe("countryChoices", () => {
  it("starts with India, ends with worldwide and keeps a detected country on the list", () => {
    const choices = countryChoices("KE");
    expect(choices[0]).toEqual({ code: "IN", name: "India" });
    expect(choices.at(-1)).toEqual({ code: "ZZ", name: "Worldwide" });
    expect(choices).toContainEqual({ code: "KE", name: "Kenya" });
  });
});
