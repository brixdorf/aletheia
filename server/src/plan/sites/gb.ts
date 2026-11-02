import type { CountrySites } from "../types.ts";

export const GB_SITES: CountrySites = {
  location: `"Westminster, London" (postcode SW1A 1AA)`,
  categories: {
    food_delivery: [
      { name: "Deliveroo", url: "https://deliveroo.co.uk/" },
      { name: "Uber Eats", url: "https://www.ubereats.com/gb" },
      { name: "Just Eat", url: "https://www.just-eat.co.uk/" },
    ],
    electronics: [
      { name: "Currys", url: "https://www.currys.co.uk/" },
      { name: "Argos", url: "https://www.argos.co.uk/" },
      { name: "Amazon", url: "https://www.amazon.co.uk/" },
    ],
    fashion: [
      { name: "ASOS", url: "https://www.asos.com/" },
      { name: "Next", url: "https://www.next.co.uk/" },
      { name: "Marks & Spencer", url: "https://www.marksandspencer.com/" },
    ],
    general: [
      { name: "Amazon", url: "https://www.amazon.co.uk/" },
      { name: "Argos", url: "https://www.argos.co.uk/" },
      { name: "eBay", url: "https://www.ebay.co.uk/" },
    ],
    travel: [
      { name: "Trainline", url: "https://www.thetrainline.com/" },
      { name: "Booking.com", url: "https://www.booking.com/" },
      { name: "Expedia", url: "https://www.expedia.co.uk/" },
    ],
    movies_events: [
      { name: "Ticketmaster", url: "https://www.ticketmaster.co.uk/" },
      { name: "Odeon", url: "https://www.odeon.co.uk/" },
      { name: "See Tickets", url: "https://www.seetickets.com/" },
    ],
    subscriptions: [
      { name: "Netflix", url: "https://www.netflix.com/gb/" },
      { name: "Spotify", url: "https://www.spotify.com/uk/premium/" },
      { name: "Adobe", url: "https://www.adobe.com/uk/" },
    ],
  },
  brands: [
    { name: "Tesco", url: "https://www.tesco.com/", aliases: ["tesco"] },
    { name: "Sainsbury's", url: "https://www.sainsburys.co.uk/", aliases: ["sainsbury's"] },
    { name: "Ocado", url: "https://www.ocado.com/", aliases: ["ocado"] },
    { name: "Deliveroo", url: "https://deliveroo.co.uk/", aliases: ["deliveroo"] },
    { name: "Just Eat", url: "https://www.just-eat.co.uk/", aliases: ["just eat"] },
    { name: "Currys", url: "https://www.currys.co.uk/", aliases: ["currys"] },
    { name: "Argos", url: "https://www.argos.co.uk/", aliases: ["argos"] },
    { name: "Amazon", url: "https://www.amazon.co.uk/", aliases: ["amazon"] },
    { name: "ASOS", url: "https://www.asos.com/", aliases: ["asos"] },
    { name: "Trainline", url: "https://www.thetrainline.com/", aliases: ["trainline"] },
    {
      name: "Adobe",
      url: "https://www.adobe.com/uk/",
      aliases: ["adobe", "photoshop", "lightroom", "illustrator", "acrobat", "creative cloud"],
      subscription: true,
    },
    {
      name: "Spotify",
      url: "https://www.spotify.com/uk/premium/",
      aliases: ["spotify"],
      subscription: true,
    },
  ],
};
