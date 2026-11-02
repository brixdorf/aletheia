import type { Flow } from "../judge/types.ts";

export type Category =
  | "groceries"
  | "food_delivery"
  | "electronics"
  | "fashion"
  | "general"
  | "travel"
  | "movies_events"
  | "subscriptions";

export interface Site {
  name: string;
  url: string;
}

export interface Brand extends Site {
  /** Words that name this brand or one of its products, in lower case. */
  aliases: readonly string[];
  /** The brand sells plans, so naming it means a sign-up even with no word such as "plan". */
  subscription?: boolean;
}

export interface CountrySites {
  /** What the agent types when a site asks where to deliver. Null if we have no address to use. */
  location: string | null;
  categories: Record<Category, readonly Site[]>;
  brands: readonly Brand[];
}

export interface PlannedSite extends Site {
  host: string;
}

export type PlanSource = "named" | "category" | "search" | "fallback" | "none";

export interface AuditPlan {
  flow: Flow;
  country: string | null;
  countryName: string;
  /** False when TinyFish cannot browse from this country, so prices may differ. */
  proxied: boolean;
  category: Category | null;
  source: PlanSource;
  sites: PlannedSite[];
}
