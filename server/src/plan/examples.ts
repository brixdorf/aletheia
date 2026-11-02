import { sitesFor } from "./sites/index.ts";

export const EXAMPLES_SHOWN = 3;

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  return items
    .map((item) => ({ item, order: random() }))
    .toSorted((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

/** A city from the visitor's location reads "Pune, Maharashtra", and a task needs only "Pune". */
function townOf(city: string | null): string | null {
  return city?.split(",")[0]?.trim() || null;
}

function localExamples(country: string, city: string | null): string[] | null {
  const market = sitesFor(country);
  if (!market) return null;

  const [first, second] = market.cities;
  const home = townOf(city) ?? first;
  const away = home === first ? second : first;
  const { electronics, movies_events: events, telecom, food_delivery: food } = market.categories;

  return [
    `Book a flight from ${home} to ${away}`,
    `Book a hotel in ${away} for this weekend`,
    "Sign up for Netflix",
    "Sign up for Spotify Premium",
    `Buy a laptop on ${electronics[0]?.name}`,
    `Buy concert tickets on ${events[0]?.name}`,
    `Choose a mobile plan on ${telecom[0]?.name}`,
    `Order dinner on ${food[0]?.name}`,
  ];
}

const WORLDWIDE_EXAMPLES = [
  "Book a hotel in Paris for this weekend",
  "Sign up for Netflix",
  "Sign up for Spotify Premium",
  "Buy a laptop on Amazon",
  "Book a flight from London to Rome",
] as const;

/** Every kind of example has run as a guest on the live site and produced a useful report. */
export function examplesFor(
  country: string | null,
  city: string | null,
  random: () => number = Math.random,
): string[] {
  const all = (country && localExamples(country, city)) || WORLDWIDE_EXAMPLES;
  return shuffled(all, random).slice(0, EXAMPLES_SHOWN);
}
