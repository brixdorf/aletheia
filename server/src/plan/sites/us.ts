import type { CountrySites } from "../types.ts";

export const US_SITES: CountrySites = {
  location: `"New York, NY" (ZIP code 10001)`,
  categories: {
    groceries: [
      { name: "Instacart", url: "https://www.instacart.com/" },
      { name: "Walmart", url: "https://www.walmart.com/" },
      { name: "Target", url: "https://www.target.com/" },
    ],
    food_delivery: [
      { name: "DoorDash", url: "https://www.doordash.com/" },
      { name: "Uber Eats", url: "https://www.ubereats.com/" },
      { name: "Grubhub", url: "https://www.grubhub.com/" },
    ],
    electronics: [
      { name: "Best Buy", url: "https://www.bestbuy.com/" },
      { name: "Amazon", url: "https://www.amazon.com/" },
      { name: "Walmart", url: "https://www.walmart.com/" },
    ],
    fashion: [
      { name: "Nordstrom", url: "https://www.nordstrom.com/" },
      { name: "Macy's", url: "https://www.macys.com/" },
      { name: "Amazon", url: "https://www.amazon.com/" },
    ],
    general: [
      { name: "Amazon", url: "https://www.amazon.com/" },
      { name: "Walmart", url: "https://www.walmart.com/" },
      { name: "Target", url: "https://www.target.com/" },
    ],
    travel: [
      { name: "Expedia", url: "https://www.expedia.com/" },
      { name: "Booking.com", url: "https://www.booking.com/" },
      { name: "Priceline", url: "https://www.priceline.com/" },
    ],
    movies_events: [
      { name: "Ticketmaster", url: "https://www.ticketmaster.com/" },
      { name: "Fandango", url: "https://www.fandango.com/" },
      { name: "StubHub", url: "https://www.stubhub.com/" },
    ],
    subscriptions: [
      { name: "Netflix", url: "https://www.netflix.com/" },
      { name: "Spotify", url: "https://www.spotify.com/us/premium/" },
      { name: "Adobe", url: "https://www.adobe.com/" },
    ],
  },
  brands: [
    { name: "Instacart", url: "https://www.instacart.com/", aliases: ["instacart"] },
    { name: "Walmart", url: "https://www.walmart.com/", aliases: ["walmart"] },
    { name: "Target", url: "https://www.target.com/", aliases: ["on target", "at target"] },
    { name: "Best Buy", url: "https://www.bestbuy.com/", aliases: ["best buy", "bestbuy"] },
    { name: "DoorDash", url: "https://www.doordash.com/", aliases: ["doordash"] },
    { name: "Grubhub", url: "https://www.grubhub.com/", aliases: ["grubhub"] },
    { name: "Nordstrom", url: "https://www.nordstrom.com/", aliases: ["nordstrom"] },
    { name: "Macy's", url: "https://www.macys.com/", aliases: ["macy's", "macys"] },
    { name: "Expedia", url: "https://www.expedia.com/", aliases: ["expedia"] },
    { name: "Ticketmaster", url: "https://www.ticketmaster.com/", aliases: ["ticketmaster"] },
    { name: "Hulu", url: "https://www.hulu.com/", aliases: ["hulu"], subscription: true },
  ],
};
