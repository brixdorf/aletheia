import type { QuoteCheck } from "./types.ts";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#039;": "'",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&ldquo;": '"',
  "&rdquo;": '"',
  "&nbsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
  "&rupee;": "₹",
};

/** Spacing and punctuation style vary between a page and an agent's copy of it. Words do not. */
function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, "");
}

export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
  return comparable(text);
}

export function checkQuote(quote: string, pageText: string | null): QuoteCheck {
  if (pageText === null) return "unavailable";
  return pageText.includes(comparable(quote)) ? "matched" : "not_matched";
}
