import { htmlToText } from "../judge/pageText.ts";
import type { RunRecord } from "../tinyfish/types.ts";

const CONCURRENT_FETCHES = 4;

interface HtmlClient {
  getStepHtml(runId: string, stepId: string): Promise<string>;
}

/**
 * Reads the page saved at each step, for matching quotes. The text stays in memory for the
 * length of one judgement and is never stored, since a signed-in page shows personal details.
 */
export async function collectPageText(
  client: HtmlClient,
  { run_id: runId, steps }: RunRecord,
): Promise<string | null> {
  const captured = steps.filter((step) => step.html);
  const texts: string[] = [];

  for (let start = 0; start < captured.length; start += CONCURRENT_FETCHES) {
    const batch = captured.slice(start, start + CONCURRENT_FETCHES);
    const pages = await Promise.allSettled(batch.map((step) => client.getStepHtml(runId, step.id)));
    for (const page of pages) {
      if (page.status === "fulfilled") texts.push(htmlToText(page.value));
    }
  }

  return texts.length > 0 ? texts.join("\n") : null;
}
