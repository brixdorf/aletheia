import { detectFlow } from "../audit/goals.ts";
import { domainsIn, namedBrands, unknownSiteIn } from "./brands.ts";
import { inferCategory } from "./category.ts";
import { countryName, proxyCountry } from "./country.ts";
import { FALLBACK_SITES } from "./sites/fallback.ts";
import { sitesFor } from "./sites/index.ts";
import type { AuditPlan, Brand, PlannedSite, PlanSource, Site } from "./types.ts";

export interface SearchHit {
  url: string;
  title: string;
}

/** Returns the hits for a query, aimed at a country when one is given. */
export type SiteSearch = (query: string, country: string | null) => Promise<SearchHit[]>;

const MIN_TASK_LENGTH = 3;
const MAX_NAMED_SITES = 4;
const MAX_SEARCHED_SITES = 3;
const MAX_CACHED_SEARCHES = 500;

/** Pages about shops, which come back from a search ahead of the shops themselves. */
const NOT_A_SHOP_HOST =
  /(^|\.)(wikipedia\.org|reddit\.com|quora\.com|youtube\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|linkedin\.com|pinterest\.com|tiktok\.com|medium\.com|forbes\.com|trustpilot\.com)$|^(blog|news|support|help)\./i;
const NOT_A_SHOP_PATH = /\/(blog|wiki|news|articles?)\b|\/(best|top)-/i;

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "").toLowerCase();

function capitalised(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function planned({ name, url }: Site): PlannedSite {
  return { name, url, host: hostOf(url) };
}

function oneSitePerHost(sites: readonly PlannedSite[]): PlannedSite[] {
  return [...new Map(sites.map((site) => [site.host, site])).values()];
}

function shopsIn(hits: readonly SearchHit[]): PlannedSite[] {
  const shops = hits.flatMap(({ url }) => {
    if (!URL.canParse(url)) return [];
    const { origin, pathname } = new URL(url);
    const host = hostOf(url);
    if (NOT_A_SHOP_HOST.test(host) || NOT_A_SHOP_PATH.test(pathname)) return [];
    return [{ name: capitalised(host.split(".")[0] ?? host), url: `${origin}/`, host }];
  });
  return oneSitePerHost(shops);
}

interface Picked {
  source: PlanSource;
  sites: PlannedSite[];
}

export class SitePlanner {
  readonly #search: SiteSearch;
  readonly #cache = new Map<string, SearchHit[]>();

  constructor(search: SiteSearch) {
    this.#search = search;
  }

  async plan(task: string, country: string | null): Promise<AuditPlan> {
    const words = task.trim();
    const place = {
      country,
      countryName: countryName(country),
      proxied: proxyCountry(country) !== null,
    };
    if (words.length < MIN_TASK_LENGTH) {
      return { ...place, flow: "checkout", category: null, source: "none", sites: [] };
    }

    const brands: readonly Brand[] = [
      ...(sitesFor(country)?.brands ?? []),
      ...FALLBACK_SITES.brands,
    ];
    const named = namedBrands(words, brands);
    const category = inferCategory(words);
    const flow =
      detectFlow(words) === "subscription" ||
      category === "subscriptions" ||
      named.some((brand) => brand.subscription)
        ? "subscription"
        : "checkout";

    const shelf = category ?? (flow === "subscription" ? "subscriptions" : null);
    const picked = await this.#pick(words, country, named, shelf);
    return { ...place, flow, category: shelf, ...picked };
  }

  async #pick(
    task: string,
    country: string | null,
    brands: readonly Brand[],
    category: AuditPlan["category"],
  ): Promise<Picked> {
    const named = oneSitePerHost([...domainsIn(task), ...brands].map(planned));
    if (named.length > 0) return { source: "named", sites: named.slice(0, MAX_NAMED_SITES) };

    const unknown = unknownSiteIn(task);
    if (unknown) {
      const [site] = await this.#searchSites(
        `${unknown} official website ${countryName(country)}`,
        country,
      );
      if (site) return { source: "search", sites: [{ ...site, name: capitalised(unknown) }] };
    }

    const local = sitesFor(country);
    if (local && category) {
      return { source: "category", sites: local.categories[category].map(planned) };
    }

    const found = await this.#searchSites(`${task} buy online ${countryName(country)}`, country);
    if (found.length > 0) {
      return { source: "search", sites: found.slice(0, MAX_SEARCHED_SITES) };
    }
    return local
      ? { source: "category", sites: local.categories.general.map(planned) }
      : {
          source: "fallback",
          sites: FALLBACK_SITES.categories[category ?? "general"].map(planned),
        };
  }

  /** A failed search only means fewer picks, so it never fails the plan. */
  async #searchSites(query: string, country: string | null): Promise<PlannedSite[]> {
    const key = `${country}|${query.toLowerCase().replace(/\s+/g, " ")}`;
    const cached = this.#cache.get(key);
    if (cached) return shopsIn(cached);

    try {
      const hits = await this.#search(query, country);
      if (this.#cache.size >= MAX_CACHED_SEARCHES) this.#cache.clear();
      this.#cache.set(key, hits);
      return shopsIn(hits);
    } catch {
      return [];
    }
  }
}
