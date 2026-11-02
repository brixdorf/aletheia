import type { Category } from "./types.ts";

export const CATEGORIES = [
  "groceries",
  "food_delivery",
  "electronics",
  "fashion",
  "general",
  "travel",
  "movies_events",
  "subscriptions",
] as const satisfies readonly Category[];

/** Checked in this order, so "movie streaming" is a subscription before it is a movie. */
const CATEGORY_WORDS: readonly (readonly [Category, RegExp])[] = [
  [
    "subscriptions",
    /\b(subscri\w+|streaming|membership|software|saas|vpn|cloud storage|ott|(photo|video) editing)\b/i,
  ],
  [
    "travel",
    /\b(flights?|fly|airfare|trains?|bus tickets?|hotels? (in|near|at)|one[- ]way|round trip|holiday package)\b/i,
  ],
  [
    "movies_events",
    /\b(movies?|films?|cinema|concerts?|gigs?|events?|shows? tickets?|match tickets?|play tickets?)\b/i,
  ],
  [
    "food_delivery",
    /\b(pizzas?|burgers?|biryani|sushi|takeaway|takeout|meals?|lunch|dinner|restaurant|food delivery|order food|noodles|momos|thali|dosa)\b/i,
  ],
  [
    "groceries",
    /\b(milk|bread|eggs?|rice|atta|flour|sugar|salt|butter|paneer|curd|yogurt|yoghurt|cheese|vegetables?|veggies|fruits?|onions?|potato(es)?|tomato(es)?|bananas?|apples?|cooking oil|ghee|dal|tea|coffee|snacks|biscuits|groceries|grocery|detergent|shampoo|toothpaste)\b/i,
  ],
  [
    "electronics",
    /\b(earphones?|earbuds?|headphones?|headsets?|i?phones?|smartphones?|laptops?|macbook|tablets?|ipad|chargers?|charging cable|cables?|power ?banks?|speakers?|cameras?|monitors?|keyboards?|mouse|ssd|routers?|smartwatch(es)?|printers?|tvs?|television|fridge|refrigerator|washing machine)\b/i,
  ],
  [
    "fashion",
    /\b(t-?shirts?|tees?|shirts?|jeans|trousers|shoes?|sneakers?|sandals?|dress(es)?|kurtas?|kurtis?|sarees?|jackets?|hoodies?|sweaters?|handbags?|socks)\b/i,
  ],
];

export function inferCategory(task: string): Category | null {
  return CATEGORY_WORDS.find(([, words]) => words.test(task))?.[0] ?? null;
}

const CATEGORY_LABELS: Record<Category, string> = {
  groceries: "groceries and quick commerce",
  food_delivery: "food delivery",
  electronics: "electronics",
  fashion: "fashion",
  general: "general shopping",
  travel: "travel",
  movies_events: "movies and events",
  subscriptions: "software and streaming",
};

export function categoryLabel(category: Category): string {
  return CATEGORY_LABELS[category];
}
