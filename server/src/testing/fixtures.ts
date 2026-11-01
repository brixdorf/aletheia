import { readFileSync } from "node:fs";

import type { RunRecord } from "../tinyfish/types.ts";
import { parseRunRecord } from "../tinyfish/types.ts";

export function loadRun(name: string): RunRecord {
  const url = new URL(`../../fixtures/runs/${name}.json`, import.meta.url);
  return parseRunRecord(JSON.parse(readFileSync(url, "utf8")));
}
