import { describe, expect, it, vi } from "vite-plus/test";

import type { SearchHit } from "./planner.ts";
import { SitePlanner } from "./planner.ts";

const noSearch = () => Promise.resolve<SearchHit[]>([]);
const hit = (url: string) => ({ url, title: url });

function plan(task: string, country: string | null = "IN", search = noSearch) {
  return new SitePlanner(search).plan(task, country);
}

const hosts = async (result: ReturnType<typeof plan>) =>
  (await result).sites.map(({ host }) => host);

describe("SitePlanner", () => {
  it("picks ticket sites for a booking in India", async () => {
    const result = await plan("buy two movie tickets for Saturday");
    expect(result.flow).toBe("checkout");
    expect(result.category).toBe("movies_events");
    expect(result.source).toBe("category");
    expect(result.sites.map(({ host }) => host)).toEqual(["district.in", "in.bookmyshow.com"]);
  });

  it.each([
    [
      "Sign up for Adobe Creative Cloud and read the cancellation terms",
      "subscription",
      "adobe.com",
    ],
    ["Book a hotel room in Goa on MakeMyTrip and stop at payment", "checkout", "makemytrip.com"],
    ["Start a Spotify Premium trial", "subscription", "spotify.com"],
    ["Buy two movie tickets on BookMyShow", "checkout", "in.bookmyshow.com"],
    ["Choose a broadband plan on Airtel", "subscription", "airtel.in"],
  ])("plans the home page example %s", async (task, flow, host) => {
    const result = await plan(task);
    expect(result).toMatchObject({ flow, source: "named" });
    expect(result.sites.map((site) => site.host)).toEqual([host]);
  });

  it("keeps no shelf of everyday shops, so a task nothing places goes to a search", async () => {
    const search = vi.fn(() => Promise.resolve([hit("https://www.example-shop.in/toned")]));
    const result = await plan("a pack of ghee", "IN", search);
    expect(search).toHaveBeenCalled();
    expect(result.category).toBeNull();
    expect(result.source).toBe("search");
  });

  it("still audits BigBasket when the task names it", async () => {
    expect(await hosts(plan("buy a laptop on BigBasket"))).toEqual(["bigbasket.com"]);
  });

  it("picks each country's own sites for the same task", async () => {
    expect(await hosts(plan("buy a laptop", "US"))).toContain("bestbuy.com");
    expect(await hosts(plan("buy a laptop", "GB"))).toContain("currys.co.uk");
  });

  it("uses the brand named in the task, and its site for that country", async () => {
    const india = await plan("Adobe Photoshop");
    expect(india.source).toBe("named");
    expect(india.flow).toBe("subscription");
    expect(india.sites).toEqual([
      { name: "Adobe", url: "https://www.adobe.com/in/", host: "adobe.com" },
    ]);

    const us = await plan("Adobe Photoshop", "US");
    expect(us.sites[0]?.url).toBe("https://www.adobe.com/");
  });

  it("finds a global brand in a country with no data file", async () => {
    const result = await plan("subscribe to Spotify", "BR");
    expect(result.sites.map(({ name }) => name)).toEqual(["Spotify"]);
  });

  it("keeps a checkout when a shop that also sells plans is named", async () => {
    expect((await plan("buy a laptop on blinkit")).flow).toBe("checkout");
    expect((await plan("buy a lamp on Amazon")).flow).toBe("checkout");
  });

  it("caps a task naming too many sites at four", async () => {
    const task = "a gift on Blinkit, Zepto, BigBasket, Flipkart and Amazon";
    expect((await plan(task)).sites).toHaveLength(4);
  });

  it("reads a site address in the task", async () => {
    const result = await plan("buy a lamp on ikea.com");
    expect(result.source).toBe("named");
    expect(result.sites.map(({ host }) => host)).toEqual(["ikea.com"]);
  });

  it("looks up a site the data file does not know", async () => {
    const search = vi.fn(() => Promise.resolve([hit("https://www.decathlon.in/shoes")]));
    const result = await plan("buy shoes on Decathlon", "IN", search);

    expect(result.source).toBe("search");
    expect(result.sites).toEqual([
      { name: "Decathlon", url: "https://www.decathlon.in/", host: "decathlon.in" },
    ]);
    expect(search).toHaveBeenCalledWith(expect.stringContaining("Decathlon"), "IN");
  });

  it("falls back to the category when a named site cannot be found", async () => {
    const result = await plan("buy shoes on Decathlon");
    expect(result.source).toBe("category");
    expect(result.sites[0]?.name).toBe("Myntra");
  });

  it("searches for a category the country has no data for", async () => {
    const search = vi.fn(() =>
      Promise.resolve([
        hit("https://www.reddit.com/r/brasil"),
        hit("https://www.mercadolivre.com.br/ofertas"),
        hit("https://blog.example.com/best-shops"),
        hit("https://www.mercadolivre.com.br/outra"),
        hit("https://www.magazineluiza.com.br/"),
      ]),
    );
    const result = await plan("buy earphones", "BR", search);

    expect(result.source).toBe("search");
    expect(result.sites.map(({ host }) => host)).toEqual([
      "mercadolivre.com.br",
      "magazineluiza.com.br",
    ]);
    expect(search).toHaveBeenCalledWith(expect.stringContaining("Brazil"), "BR");
  });

  it("searches for a task the data file cannot place", async () => {
    const search = vi.fn(() => Promise.resolve([hit("https://www.gnomes.test/")]));
    const result = await plan("a garden gnome", "IN", search);
    expect(result.source).toBe("search");
    expect(result.category).toBeNull();
  });

  it("uses the generic sites when search finds nothing", async () => {
    const result = await plan("buy earphones", "BR");
    expect(result.source).toBe("fallback");
    expect(result.sites.length).toBeGreaterThan(0);
  });

  it("uses the general sites when search fails", async () => {
    const search = vi.fn(() => Promise.reject(new Error("down")));
    const result = await plan("a garden gnome", "IN", search);
    expect(result.source).toBe("category");
    expect(result.sites[0]?.host).toBe("flipkart.com");
  });

  it("asks search once for the same task and country", async () => {
    const search = vi.fn(() => Promise.resolve([hit("https://www.gnomes.test/")]));
    const planner = new SitePlanner(search);
    await planner.plan("a garden gnome", "IN");
    await planner.plan("A garden  gnome", "IN");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("does not look for sites until there is a task", async () => {
    const search = vi.fn(noSearch);
    const result = await plan("  ", "IN", search);
    expect(result.sites).toEqual([]);
    expect(result.source).toBe("none");
    expect(search).not.toHaveBeenCalled();
  });

  it("works out the subscription flow from the category", async () => {
    const result = await plan("a music streaming plan");
    expect(result.flow).toBe("subscription");
    expect(result.category).toBe("subscriptions");
  });

  it("says where the country's name and browser stand", async () => {
    expect(await plan("buy a laptop", "IN")).toMatchObject({ countryName: "India", proxied: true });
    expect(await plan("buy a laptop", "BR")).toMatchObject({
      countryName: "Brazil",
      proxied: false,
    });
    expect(await plan("buy a laptop", null)).toMatchObject({
      country: null,
      countryName: "Worldwide",
      proxied: false,
    });
  });
});
