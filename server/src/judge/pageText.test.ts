import { describe, expect, it } from "vite-plus/test";

import { htmlToText, locateQuote } from "./pageText.ts";

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

describe("locateQuote", () => {
  const pages = [
    { stepId: "first", text: htmlToText("<p>Choose a plan</p>") },
    {
      stepId: "second",
      text: htmlToText(
        `<div>Fee applies of <span>half your remaining</span> annual commitment</div>
         <button>No, I’ll risk it</button><p>Only <b>2</b> left – hurry</p><p>₹ 1,199.00/mo</p>`,
      ),
    },
  ];

  it("finds wording split across tags and lines, and names its page", () => {
    expect(locateQuote("Fee applies of half your remaining annual commitment", pages)).toBe(
      "second",
    );
  });

  it("ignores case, spacing and curly or straight punctuation", () => {
    expect(locateQuote("no, i'll RISK it", pages)).toBe("second");
    expect(locateQuote("Only 2 left - hurry", pages)).toBe("second");
    expect(locateQuote("₹1,199.00/mo", pages)).toBe("second");
  });

  it("does not accept a paraphrase", () => {
    expect(locateQuote("a fee of half the remaining commitment", pages)).toBeNull();
  });

  it("does not accept a word too short to mean anything", () => {
    expect(locateQuote("a", pages)).toBeNull();
    expect(locateQuote("  ", pages)).toBeNull();
  });

  it("prefers the page the agent named when the wording is on it", () => {
    const twice = [
      { stepId: "one", text: htmlToText("<p>Only 2 left</p>") },
      { stepId: "two", text: htmlToText("<p>Only 2 left</p>") },
    ];

    expect(locateQuote("Only 2 left", twice)).toBe("one");
    expect(locateQuote("Only 2 left", twice, "two")).toBe("two");
  });

  it("finds nothing when no page was captured", () => {
    expect(locateQuote("anything", [])).toBeNull();
  });
});
