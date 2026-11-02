import type { CountrySites } from "../types.ts";
import { MARKETS } from "./markets.ts";

export function sitesFor(country: string | null): CountrySites | null {
  return (country && MARKETS[country]) || null;
}

export function coveredCountries(): string[] {
  return Object.keys(MARKETS);
}
