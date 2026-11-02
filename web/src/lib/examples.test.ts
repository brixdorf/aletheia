import { describe, expect, it } from "vite-plus/test";

import { AUDIT_EXAMPLES, exampleAt } from "./examples.ts";

describe("exampleAt", () => {
  it("goes through the examples and starts over", () => {
    expect(exampleAt(0)).toBe(AUDIT_EXAMPLES[0]);
    expect(exampleAt(1)).toBe(AUDIT_EXAMPLES[1]);
    expect(exampleAt(AUDIT_EXAMPLES.length)).toBe(AUDIT_EXAMPLES[0]);
  });
});
