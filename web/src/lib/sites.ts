/** Matches the most sites the server takes in one audit. */
export const MAX_SITES = 4;

export interface PlannedSite {
  url: string;
  host: string;
  signInId: string | null;
}

type Parsed = { ok: true; url: string; host: string } | { ok: false; message: string };

const NOT_A_SITE = "Enter a site address, such as blinkit.com.";

export function parseSite(input: string): Parsed {
  const text = input.trim();
  if (!text) return { ok: false, message: NOT_A_SITE };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, message: NOT_A_SITE };
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) {
    return { ok: false, message: NOT_A_SITE };
  }
  return { ok: true, url: url.href, host: url.hostname.replace(/^www\./, "") };
}

type Added = { ok: true; sites: PlannedSite[] } | { ok: false; message: string };

export function addSite(
  sites: readonly PlannedSite[],
  { url, host }: { url: string; host: string },
): Added {
  if (sites.some((site) => site.host === host)) {
    return { ok: false, message: `${host} is already on the list.` };
  }
  if (sites.length >= MAX_SITES) {
    return { ok: false, message: `One audit can cover ${MAX_SITES} sites.` };
  }
  return { ok: true, sites: [...sites, { url, host, signInId: null }] };
}
