import { describe, expect, it } from "vite-plus/test";

import { inferCategory } from "./category.ts";

describe("inferCategory", () => {
  it.each([
    ["order a chicken biryani for dinner", "food_delivery"],
    ["get a large pizza delivered", "food_delivery"],
    ["buy boAt Bassheads 300C earphones", "electronics"],
    ["one USB-C charging cable", "electronics"],
    ["a 55 inch TV", "electronics"],
    ["a men's cotton t-shirt", "fashion"],
    ["running shoes size 9", "fashion"],
    ["flight from Bangalore to Delhi on 25 Nov", "travel"],
    ["a hotel in Goa for two nights", "travel"],
    ["two movie tickets for Saturday", "movies_events"],
    ["a concert ticket", "movies_events"],
    ["a music streaming plan", "subscriptions"],
    ["photo editing software", "subscriptions"],
  ])("reads %s as %s", (task, category) => {
    expect(inferCategory(task)).toBe(category);
  });

  it("does not guess at a task it cannot place", () => {
    expect(inferCategory("a garden gnome")).toBeNull();
  });

  it("does not match inside a longer word", () => {
    expect(inferCategory("a bagged tvisha")).toBeNull();
  });
});
