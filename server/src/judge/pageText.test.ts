import { describe, expect, it } from "vite-plus/test";

import { loadRun } from "../testing/fixtures.ts";
import { judgeRun } from "./judge.ts";
import { checkQuote, htmlToText } from "./pageText.ts";

describe("htmlToText", () => {
  it("keeps visible text and drops scripts, styles and tags", () => {
    const text = htmlToText(
      "<html><style>.a{color:red}</style><script>var hidden = 1;</script><p>Hello <b>there</b></p></html>",
    );

    expect(text).toContain("hellothere");
    expect(text).not.toMatch(/hidden|color/);
  });

  it("decodes the entities sites use in copy", () => {
    expect(htmlToText("<p>Don&#39;t&nbsp;miss &amp; save</p>")).toBe("don'tmiss&save");
  });
});

describe("checkQuote", () => {
  const page = htmlToText(
    `<div>Fee applies of <span>half your remaining</span> annual commitment</div>
     <button>No, I’ll risk it</button><p>Only <b>2</b> left 2013 hurry</p><p>₹ 1,199.00/mo</p>`,
  );

  it("matches wording split across tags and lines", () => {
    expect(checkQuote("Fee applies of half your remaining annual commitment", page)).toBe(
      "matched",
    );
  });

  it("ignores case, spacing and curly or straight punctuation", () => {
    expect(checkQuote("no, i'll RISK it", page)).toBe("matched");
    expect(checkQuote("Only 2 left - hurry", page)).toBe("matched");
    expect(checkQuote("₹1,199.00/mo", page)).toBe("matched");
  });

  it("does not accept a paraphrase", () => {
    expect(checkQuote("a fee of half the remaining commitment", page)).toBe("not_matched");
  });

  it("says unavailable when no page text was captured", () => {
    expect(checkQuote("anything", null)).toBe("unavailable");
  });
});

describe("quotes in a report", () => {
  function reportWith(pageText: string | null) {
    const run = loadRun("adobe-subscription");
    return judgeRun({
      flow: "subscription",
      url: "https://example.test/",
      run,
      pageText,
    }).patterns.find((entry) => entry.id === "subscription_trap");
  }

  it("confirms a quote that is on a captured page", () => {
    const text = htmlToText(
      "<p>Fee applies of half your remaining annual commitment if you cancel after Nov 14</p>",
    );

    expect(reportWith(text)?.quoteCheck).toBe("matched");
  });

  it("keeps a finding whose quote is not in the capture, and marks it unconfirmed", () => {
    const finding = reportWith(htmlToText("<p>nothing relevant</p>"));

    expect(finding?.status).toBe("found");
    expect(finding?.quoteCheck).toBe("not_matched");
    expect(finding?.note).toMatch(/not found in the saved page text/i);
  });

  it("marks older runs with no capture as unavailable", () => {
    expect(reportWith(null)?.quoteCheck).toBe("unavailable");
  });

  it("leaves arithmetic findings with no quote out of it", () => {
    const report = judgeRun({
      flow: "checkout",
      url: "https://example.test/",
      run: loadRun("blinkit-2"),
      pageText: "",
    });

    expect(report.patterns.find((entry) => entry.id === "drip_pricing")?.quoteCheck).toBeNull();
  });
});
