import { isTravelTask } from "../audit/goals.ts";
import type { Brand, Site } from "./types.ts";

const ADDRESS =
  /(?<![\p{L}\d@.-])(?:https?:\/\/)?(?:[a-z\d-]+\.)+(?:com|in|co|org|net|io|app|shop|store|uk|us|ca|au|de|fr|jp)(?:\/[^\s,]*)?(?![\p{L}\d-])/giu;

const NAMED_AFTER_WORD = /\b(on|at|from)\s+([A-Z][\w&'-]*(?:\s[A-Z][\w&'-]*)?)/;
const NAMED_LAST = /\bon\s+([a-z][\w-]*)\s*$/;
const NOT_A_SITE =
  /^(sale|offer|discount|credit|debit|emi|cod|time|demand|delivery|amazon|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekends?|today|tomorrow)$/i;

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Brands the task names, in the order it names them. A longer name wins over a shorter one. */
export function namedBrands(task: string, brands: readonly Brand[]): Brand[] {
  const byAlias = new Map<string, Brand>();
  for (const brand of brands) {
    for (const alias of brand.aliases) {
      if (!byAlias.has(alias)) byAlias.set(alias, brand);
    }
  }
  if (byAlias.size === 0) return [];

  const anyAlias = [...byAlias.keys()]
    .toSorted((a, b) => b.length - a.length)
    .map(escapeForRegExp)
    .join("|");
  const word = new RegExp(`(?<![\\p{L}\\d])(?:${anyAlias})(?![\\p{L}\\d])`, "gu");

  const found = new Set<Brand>();
  for (const [alias] of task.toLowerCase().matchAll(word)) {
    const brand = byAlias.get(alias);
    if (brand) found.add(brand);
  }
  return [...found];
}

export function domainsIn(task: string): Site[] {
  return [...task.matchAll(ADDRESS)].map(([address]) => {
    const url = /^https?:/i.test(address) ? address : `https://${address}`;
    return { name: new URL(url).hostname.replace(/^www\./, ""), url };
  });
}

/** A site the task seems to name that is in no data file, such as "shoes on Decathlon". */
export function unknownSiteIn(task: string): string | null {
  const named = NAMED_AFTER_WORD.exec(task);
  const preposition = named?.[1];
  const name = named?.[2] ?? NAMED_LAST.exec(task)?.[1];

  if (!name || NOT_A_SITE.test(name)) return null;
  // "From Bangalore" and "at Heathrow" in a travel task are places, not shops.
  if (preposition !== "on" && isTravelTask(task)) return null;
  return name;
}
