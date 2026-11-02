import type { PlannedSite } from "./sites.ts";
import { MAX_SITES } from "./sites.ts";
import type { PlanView } from "./types.ts";

const CATEGORY_LABEL: Record<NonNullable<PlanView["category"]>, string> = {
  groceries: "groceries and quick commerce",
  food_delivery: "food delivery",
  electronics: "electronics",
  fashion: "fashion",
  general: "shopping",
  travel: "travel",
  movies_events: "movies and events",
  subscriptions: "software and streaming",
};

/** The browser's own idea of where it is, for when the server has no country header. */
export function browserPlace(): { timeZone: string; languages: string[] } {
  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    languages: [...navigator.languages],
  };
}

export interface SiteEdits {
  removed: readonly string[];
  added: readonly PlannedSite[];
  /** Sign-in id by host. */
  signIns: Readonly<Record<string, string>>;
}

/** The picks and the visitor's edits are kept apart, so a new plan never undoes an edit. */
export function pickedSites(
  picks: readonly { url: string; host: string }[],
  { removed, added, signIns }: SiteEdits,
): PlannedSite[] {
  const kept = picks.filter(({ host }) => !removed.includes(host));
  const extra = added.filter(({ host }) => !kept.some((site) => site.host === host));
  return [...kept, ...extra]
    .slice(0, MAX_SITES)
    .map(({ url, host }) => ({ url, host, signInId: signIns[host] ?? null }));
}

export function planNote({ source, category, countryName }: PlanView): string | null {
  switch (source) {
    case "named":
      return "Named in your task.";
    case "category":
      return category
        ? `The main ${CATEGORY_LABEL[category]} sites in ${countryName}.`
        : `The main shopping sites in ${countryName}.`;
    case "search":
      return `Found by a web search for ${countryName}.`;
    case "fallback":
      return "Sites that sell in most countries.";
    case "none":
      return null;
  }
}
