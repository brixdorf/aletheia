import { join } from "node:path";

import { readJson, writeJson } from "./jsonFile.ts";

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

/** Which sites needed a login, so the next check can offer sign-in up front. */
export class DomainMemory {
  readonly #path: string;
  #hosts = new Set<string>();

  constructor(dataDir: string) {
    this.#path = join(dataDir, "login-domains.json");
  }

  async load(): Promise<void> {
    this.#hosts = new Set((await readJson<string[]>(this.#path)) ?? []);
  }

  needsLogin(url: string): boolean {
    return this.#hosts.has(hostOf(url));
  }

  async rememberLogin(url: string): Promise<void> {
    const host = hostOf(url);
    if (this.#hosts.has(host)) return;
    this.#hosts.add(host);
    await writeJson(this.#path, [...this.#hosts]);
  }
}
