import { describe, expect, it } from "vite-plus/test";

import { addSite, MAX_SITES, parseSite } from "./sites.ts";

describe("parseSite", () => {
  it("adds https to a bare domain", () => {
    expect(parseSite("blinkit.com")).toEqual({
      ok: true,
      url: "https://blinkit.com/",
      host: "blinkit.com",
    });
  });

  it("keeps a full address and drops www from the host", () => {
    expect(parseSite("  https://www.spotify.com/in-en/premium/ ")).toEqual({
      ok: true,
      url: "https://www.spotify.com/in-en/premium/",
      host: "spotify.com",
    });
  });

  it("rejects text that is not a site", () => {
    expect(parseSite("milk")).toMatchObject({ ok: false });
    expect(parseSite("")).toMatchObject({ ok: false });
    expect(parseSite("ftp://files.test")).toMatchObject({ ok: false });
  });
});

describe("addSite", () => {
  const site = (url: string, host: string) => ({ url, host, signInId: null });

  it("appends a new site as a guest", () => {
    expect(addSite([], { url: "https://a.test/", host: "a.test" })).toEqual({
      ok: true,
      sites: [site("https://a.test/", "a.test")],
    });
  });

  it("refuses a second entry for the same site", () => {
    const result = addSite([site("https://a.test/", "a.test")], {
      url: "https://www.a.test/x",
      host: "a.test",
    });
    expect(result).toEqual({ ok: false, message: "a.test is already on the list." });
  });

  it("stops at the limit the server accepts", () => {
    const full = Array.from({ length: MAX_SITES }, (_, index) =>
      site(`https://${index}.test/`, `${index}.test`),
    );
    expect(addSite(full, { url: "https://b.test/", host: "b.test" })).toMatchObject({ ok: false });
  });
});
