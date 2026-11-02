import type { CountrySites } from "../types.ts";

/** Sites that sell in most countries, and the brands any country's task may name. */
export const FALLBACK_SITES: CountrySites = {
  location: null,
  categories: {
    groceries: [{ name: "Amazon", url: "https://www.amazon.com/" }],
    food_delivery: [{ name: "Uber Eats", url: "https://www.ubereats.com/" }],
    electronics: [
      { name: "Amazon", url: "https://www.amazon.com/" },
      { name: "eBay", url: "https://www.ebay.com/" },
    ],
    fashion: [
      { name: "ASOS", url: "https://www.asos.com/" },
      { name: "Amazon", url: "https://www.amazon.com/" },
    ],
    general: [
      { name: "Amazon", url: "https://www.amazon.com/" },
      { name: "eBay", url: "https://www.ebay.com/" },
    ],
    travel: [
      { name: "Booking.com", url: "https://www.booking.com/" },
      { name: "Expedia", url: "https://www.expedia.com/" },
    ],
    movies_events: [{ name: "Ticketmaster", url: "https://www.ticketmaster.com/" }],
    subscriptions: [
      { name: "Netflix", url: "https://www.netflix.com/" },
      { name: "Spotify", url: "https://www.spotify.com/premium/" },
    ],
  },
  brands: [
    { name: "Amazon", url: "https://www.amazon.com/", aliases: ["amazon"] },
    {
      name: "Amazon Prime",
      url: "https://www.amazon.com/amazonprime",
      aliases: ["amazon prime", "prime video", "prime membership"],
      subscription: true,
    },
    { name: "eBay", url: "https://www.ebay.com/", aliases: ["ebay"] },
    { name: "IKEA", url: "https://www.ikea.com/", aliases: ["ikea"] },
    { name: "Shein", url: "https://www.shein.com/", aliases: ["shein"] },
    { name: "Temu", url: "https://www.temu.com/", aliases: ["temu"] },
    { name: "AliExpress", url: "https://www.aliexpress.com/", aliases: ["aliexpress"] },
    { name: "Nike", url: "https://www.nike.com/", aliases: ["nike"] },
    { name: "Adidas", url: "https://www.adidas.com/", aliases: ["adidas"] },
    { name: "Uber Eats", url: "https://www.ubereats.com/", aliases: ["uber eats", "ubereats"] },
    { name: "Booking.com", url: "https://www.booking.com/", aliases: ["booking.com"] },
    {
      name: "Adobe",
      url: "https://www.adobe.com/",
      aliases: ["adobe", "photoshop", "lightroom", "illustrator", "acrobat", "creative cloud"],
      subscription: true,
    },
    {
      name: "Spotify",
      url: "https://www.spotify.com/premium/",
      aliases: ["spotify"],
      subscription: true,
    },
    { name: "Netflix", url: "https://www.netflix.com/", aliases: ["netflix"], subscription: true },
    {
      name: "LinkedIn Premium",
      url: "https://www.linkedin.com/premium/",
      aliases: ["linkedin"],
      subscription: true,
    },
    {
      name: "YouTube Premium",
      url: "https://www.youtube.com/premium",
      aliases: ["youtube premium"],
      subscription: true,
    },
    {
      name: "Apple Music",
      url: "https://www.apple.com/apple-music/",
      aliases: ["apple music"],
      subscription: true,
    },
    {
      name: "Microsoft 365",
      url: "https://www.microsoft.com/microsoft-365",
      aliases: ["microsoft 365", "office 365"],
      subscription: true,
    },
    {
      name: "Canva",
      url: "https://www.canva.com/pricing/",
      aliases: ["canva"],
      subscription: true,
    },
    {
      name: "Duolingo",
      url: "https://www.duolingo.com/super",
      aliases: ["duolingo"],
      subscription: true,
    },
  ],
};
