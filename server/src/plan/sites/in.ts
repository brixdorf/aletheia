import type { CountrySites } from "../types.ts";

/** Sites from our own test runs come first in each category. */
export const IN_SITES: CountrySites = {
  location: `"Koramangala, Bengaluru" (pincode 560034)`,
  categories: {
    groceries: [
      { name: "Blinkit", url: "https://blinkit.com/" },
      { name: "Zepto", url: "https://www.zepto.com/" },
      { name: "BigBasket", url: "https://www.bigbasket.com/" },
    ],
    food_delivery: [
      { name: "Zomato", url: "https://www.zomato.com/" },
      { name: "Swiggy", url: "https://www.swiggy.com/" },
    ],
    electronics: [
      { name: "Croma", url: "https://www.croma.com/" },
      { name: "Flipkart", url: "https://www.flipkart.com/" },
      { name: "Amazon", url: "https://www.amazon.in/" },
    ],
    fashion: [
      { name: "Myntra", url: "https://www.myntra.com/" },
      { name: "Flipkart", url: "https://www.flipkart.com/" },
    ],
    general: [
      { name: "Flipkart", url: "https://www.flipkart.com/" },
      { name: "Amazon", url: "https://www.amazon.in/" },
    ],
    travel: [
      { name: "ixigo", url: "https://www.ixigo.com/" },
      { name: "EaseMyTrip", url: "https://www.easemytrip.com/" },
      { name: "Cleartrip", url: "https://www.cleartrip.com/" },
    ],
    movies_events: [
      { name: "District", url: "https://www.district.in/" },
      { name: "BookMyShow", url: "https://in.bookmyshow.com/" },
    ],
    subscriptions: [
      { name: "Spotify", url: "https://www.spotify.com/in-en/premium/" },
      { name: "Netflix", url: "https://www.netflix.com/in/" },
      { name: "Adobe", url: "https://www.adobe.com/in/" },
    ],
  },
  brands: [
    { name: "Blinkit", url: "https://blinkit.com/", aliases: ["blinkit", "grofers"] },
    { name: "Zepto", url: "https://www.zepto.com/", aliases: ["zepto"] },
    { name: "BigBasket", url: "https://www.bigbasket.com/", aliases: ["bigbasket", "big basket"] },
    {
      name: "Swiggy Instamart",
      url: "https://www.swiggy.com/instamart",
      aliases: ["instamart", "swiggy instamart"],
    },
    { name: "Swiggy", url: "https://www.swiggy.com/", aliases: ["swiggy"] },
    { name: "Zomato", url: "https://www.zomato.com/", aliases: ["zomato"] },
    { name: "Flipkart", url: "https://www.flipkart.com/", aliases: ["flipkart"] },
    { name: "Amazon", url: "https://www.amazon.in/", aliases: ["amazon"] },
    {
      name: "Amazon Prime",
      url: "https://www.amazon.in/amazonprime",
      aliases: ["amazon prime", "prime video", "prime membership"],
      subscription: true,
    },
    { name: "Myntra", url: "https://www.myntra.com/", aliases: ["myntra"] },
    { name: "Ajio", url: "https://www.ajio.com/", aliases: ["ajio"] },
    { name: "Nykaa", url: "https://www.nykaa.com/", aliases: ["nykaa"] },
    { name: "Meesho", url: "https://www.meesho.com/", aliases: ["meesho"] },
    { name: "Tata CLiQ", url: "https://www.tatacliq.com/", aliases: ["tata cliq", "tatacliq"] },
    { name: "Croma", url: "https://www.croma.com/", aliases: ["croma"] },
    {
      name: "Reliance Digital",
      url: "https://www.reliancedigital.in/",
      aliases: ["reliance digital"],
    },
    { name: "MakeMyTrip", url: "https://www.makemytrip.com/", aliases: ["makemytrip"] },
    { name: "Goibibo", url: "https://www.goibibo.com/", aliases: ["goibibo"] },
    { name: "Cleartrip", url: "https://www.cleartrip.com/", aliases: ["cleartrip"] },
    { name: "ixigo", url: "https://www.ixigo.com/", aliases: ["ixigo"] },
    { name: "EaseMyTrip", url: "https://www.easemytrip.com/", aliases: ["easemytrip"] },
    { name: "IndiGo", url: "https://www.goindigo.in/", aliases: ["indigo"] },
    { name: "BookMyShow", url: "https://in.bookmyshow.com/", aliases: ["bookmyshow"] },
    { name: "District", url: "https://www.district.in/", aliases: ["on district", "district app"] },
    {
      name: "Adobe",
      url: "https://www.adobe.com/in/",
      aliases: ["adobe", "photoshop", "lightroom", "illustrator", "acrobat", "creative cloud"],
      subscription: true,
    },
    {
      name: "Spotify",
      url: "https://www.spotify.com/in-en/premium/",
      aliases: ["spotify"],
      subscription: true,
    },
    {
      name: "Netflix",
      url: "https://www.netflix.com/in/",
      aliases: ["netflix"],
      subscription: true,
    },
    {
      name: "JioHotstar",
      url: "https://www.hotstar.com/in",
      aliases: ["hotstar", "jiohotstar"],
      subscription: true,
    },
  ],
};
