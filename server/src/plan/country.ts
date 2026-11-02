/** The documented TinyFish proxy countries, plus India, which our test runs confirmed. */
const PROXY_COUNTRIES: ReadonlySet<string> = new Set([
  "IN",
  "US",
  "GB",
  "CA",
  "DE",
  "FR",
  "JP",
  "AU",
]);

const LISTED_COUNTRIES = [
  "IN",
  "US",
  "GB",
  "CA",
  "AU",
  "DE",
  "FR",
  "JP",
  "SG",
  "AE",
  "IE",
  "NL",
  "ES",
  "IT",
  "BR",
  "MX",
  "ZA",
  "NZ",
];

export const WORLDWIDE = "ZZ";
const WORLDWIDE_NAME = "Worldwide";

const COUNTRY_CODE = /^[A-Z]{2}$/;
/** Cloudflare's codes for an unknown address and for Tor. */
const NOT_A_COUNTRY = new Set(["XX", "T1"]);

const TIME_ZONE_COUNTRY: readonly (readonly [RegExp, string])[] = [
  [/^Asia\/(Kolkata|Calcutta)$/, "IN"],
  [/^Europe\/(London|Belfast)$/, "GB"],
  [/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns)$/, "CA"],
  [
    /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise)|Pacific\/Honolulu)$/,
    "US",
  ],
  [/^Australia\//, "AU"],
  [/^Europe\/Berlin$/, "DE"],
  [/^Europe\/Paris$/, "FR"],
  [/^Asia\/Tokyo$/, "JP"],
  [/^Asia\/Singapore$/, "SG"],
  [/^Asia\/Dubai$/, "AE"],
];

const NAMES = new Intl.DisplayNames(["en"], { type: "region" });

export interface CountrySignals {
  /** What the visitor picked on the country pill. */
  choice?: string | undefined;
  /** The `CF-IPCountry` header. */
  cloudflare?: string | undefined;
  timeZone?: string | undefined;
  languages?: readonly string[] | undefined;
}

function countryFrom(value: string | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code && COUNTRY_CODE.test(code) && !NOT_A_COUNTRY.has(code) ? code : null;
}

function countryOfTimeZone(timeZone: string | undefined): string | null {
  if (!timeZone) return null;
  return TIME_ZONE_COUNTRY.find(([zone]) => zone.test(timeZone))?.[1] ?? null;
}

function countryOfLanguages(languages: readonly string[] | undefined): string | null {
  for (const language of languages ?? []) {
    const region = countryFrom(language.split("-")[1]);
    if (region) return region;
  }
  return null;
}

/** The time zone comes before the language, since many browsers keep en-US whatever the place. */
export function resolveCountry({
  choice,
  cloudflare,
  timeZone,
  languages,
}: CountrySignals): string | null {
  const chosen = countryFrom(choice);
  if (chosen) return chosen === WORLDWIDE ? null : chosen;
  return (
    countryFrom(cloudflare) ?? countryOfTimeZone(timeZone) ?? countryOfLanguages(languages) ?? null
  );
}

/** The code to hand TinyFish, or null to leave it out. */
export function proxyCountry(country: string | null): string | null {
  return country !== null && PROXY_COUNTRIES.has(country) ? country : null;
}

export function countryName(country: string | null): string {
  return country === null ? WORLDWIDE_NAME : (NAMES.of(country) ?? country);
}

export interface CountryChoice {
  code: string;
  name: string;
}

export function countryChoices(detected: string | null): CountryChoice[] {
  const codes = new Set(LISTED_COUNTRIES);
  if (detected) codes.add(detected);
  return [
    ...[...codes].map((code) => ({ code, name: countryName(code) })),
    { code: WORLDWIDE, name: WORLDWIDE_NAME },
  ];
}
