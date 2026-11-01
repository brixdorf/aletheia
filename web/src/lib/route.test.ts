import { describe, expect, it } from "vite-plus/test";

import { matchRoute, newAuditHref } from "./route.ts";

describe("matchRoute", () => {
  it("opens the dashboard at the root", () => {
    expect(matchRoute("/", "")).toEqual({ name: "dashboard" });
  });

  it("reads a prefilled new audit", () => {
    expect(matchRoute("/new", "?task=Buy%20milk&url=https%3A%2F%2Fa.test&signIn=1")).toEqual({
      name: "new",
      task: "Buy milk",
      url: "https://a.test",
      signIn: true,
    });
  });

  it("starts a new audit blank by default", () => {
    expect(matchRoute("/new", "")).toEqual({ name: "new", task: "", url: "", signIn: false });
  });

  it("finds an audit by id", () => {
    expect(matchRoute("/audits/abc-123", "")).toEqual({ name: "audit", id: "abc-123" });
  });

  it("finds a shared report by token", () => {
    expect(matchRoute("/shared/Zx_9-a", "")).toEqual({ name: "shared", token: "Zx_9-a" });
  });

  it("reads the audits to compare", () => {
    expect(matchRoute("/compare", "?audits=a1,a2")).toEqual({
      name: "compare",
      ids: ["a1", "a2"],
    });
  });

  it("tolerates a trailing slash", () => {
    expect(matchRoute("/audits/abc/", "")).toEqual({ name: "audit", id: "abc" });
  });

  it("does not guess at anything else", () => {
    expect(matchRoute("/audits/a/b", "")).toEqual({ name: "not_found" });
    expect(matchRoute("/nope", "")).toEqual({ name: "not_found" });
  });
});

describe("newAuditHref", () => {
  it("round-trips through matchRoute", () => {
    const href = newAuditHref({
      task: "Buy milk & eggs",
      url: "https://a.test/x?y=1",
      signIn: true,
    });
    const url = new URL(href, "https://aletheia.test");
    expect(matchRoute(url.pathname, url.search)).toEqual({
      name: "new",
      task: "Buy milk & eggs",
      url: "https://a.test/x?y=1",
      signIn: true,
    });
  });
});
