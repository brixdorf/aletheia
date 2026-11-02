import type { CountrySites } from "../types.ts";
import { GB_SITES } from "./gb.ts";
import { IN_SITES } from "./in.ts";
import { US_SITES } from "./us.ts";

const BY_COUNTRY: Readonly<Record<string, CountrySites>> = {
  IN: IN_SITES,
  US: US_SITES,
  GB: GB_SITES,
};

export function sitesFor(country: string | null): CountrySites | null {
  return (country && BY_COUNTRY[country]) || null;
}
