/** The text of one page the agent saw, tied to the step whose screenshot shows it. */
export interface PageCapture {
  stepId: string;
  text: string;
}

const MIN_QUOTE_LENGTH = 3;

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
export function comparable(text: string): string {
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

/** The page that holds these words, starting with the page the agent named if it has them. */
export function locateQuote(
  quote: string,
  captures: readonly PageCapture[],
  preferredStepId: string | null = null,
): string | null {
  const wanted = comparable(quote);
  if (wanted.length < MIN_QUOTE_LENGTH) return null;
  const holds = ({ text }: PageCapture) => text.includes(wanted);
  const preferred = captures.find((capture) => capture.stepId === preferredStepId);
  if (preferred && holds(preferred)) return preferred.stepId;
  return captures.find(holds)?.stepId ?? null;
}
