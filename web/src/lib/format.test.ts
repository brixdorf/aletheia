import { describe, expect, it } from "vite-plus/test";

import { clock, dateTime, money, plural } from "./format.ts";

describe("money", () => {
  it("writes rupees as Rs with Indian grouping", () => {
    expect(money(81, "INR")).toBe("Rs 81");
    expect(money(125000, "INR")).toBe("Rs 1,25,000");
  });

  it("keeps two decimals only when the amount has paise", () => {
    expect(money(441.66, "INR")).toBe("Rs 441.66");
    expect(money(12.5, "INR")).toBe("Rs 12.50");
  });

  it("names any other currency by its code", () => {
    expect(money(12.5, "USD")).toBe("USD 12.50");
  });

  it("shows the bare number when no currency was seen", () => {
    expect(money(79, null)).toBe("79");
  });
});

describe("dates", () => {
  it("uses the 12-hour clock with plain spaces", () => {
    expect(clock("2026-11-01T08:44:00.000Z")).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });

  it("writes the date before the time", () => {
    expect(dateTime("2026-11-01T08:44:00.000Z")).toMatch(
      /^\d{1,2} [A-Z][a-z]{2} 2026, \d{1,2}:\d{2} (AM|PM)$/,
    );
  });
});

describe("plural", () => {
  it("counts one and many", () => {
    expect(plural(1, "pattern")).toBe("1 pattern");
    expect(plural(3, "pattern")).toBe("3 patterns");
    expect(plural(0, "site")).toBe("0 sites");
  });
});
