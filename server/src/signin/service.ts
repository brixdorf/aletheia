import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { ApiError } from "../errors.ts";
import { readJson, writeJson } from "../store/jsonFile.ts";
import type { SetupSession } from "../tinyfish/client.ts";
import type { Frame, OpenScreen, RemoteScreen } from "./remoteScreen.ts";

export interface SignInClient {
  createProfile(name: string): Promise<string>;
  deleteProfile(profileId: string): Promise<void>;
  startSetup(profileId: string, url: string): Promise<SetupSession>;
  saveSetup(profileId: string, sessionId: string, site: string): Promise<void>;
  cancelSetup(profileId: string, sessionId: string): Promise<void>;
}

export type SignInState = "setting_up" | "ready" | "in_use";

/** What goes to disk, so a restart can still clean up. Never the screen, the input or a CDP url. */
interface SignInRecord {
  id: string;
  visitorId: string;
  profileId: string;
  sessionId: string;
  url: string;
  host: string;
  state: SignInState;
  expiresAt: string;
  savedAt: number | null;
}

export type SignInView = Pick<SignInRecord, "id" | "url" | "host" | "state" | "expiresAt">;

export type SignInInput =
  | { kind: "click"; x: number; y: number }
  | { kind: "key"; key: string }
  | { kind: "text"; text: string }
  | { kind: "scroll"; dx: number; dy: number };

export interface SignInDeps {
  client: SignInClient;
  openScreen: OpenScreen;
  /** Runs a short agent with the profile that logs out of the site. True if it logged out. */
  runLogout: (profileId: string, url: string) => Promise<boolean>;
  dataDir: string;
  now?: () => number;
}

const UNUSED_LIMIT_MS = 30 * 60 * 1000;

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

function missing(): ApiError {
  return new ApiError("not_found", "That sign-in has ended.");
}

export class SignInService {
  readonly #deps: SignInDeps;
  readonly #now: () => number;
  readonly #path: string;
  readonly #records = new Map<string, SignInRecord>();
  readonly #screens = new Map<string, RemoteScreen>();
  #stopCheck: (signInId: string) => Promise<void> = () => Promise.resolve();

  constructor(deps: SignInDeps) {
    this.#deps = deps;
    this.#now = deps.now ?? Date.now;
    this.#path = join(deps.dataDir, "signins.json");
  }

  onSignOutDuringCheck(stopCheck: (signInId: string) => Promise<void>): void {
    this.#stopCheck = stopCheck;
  }

  async start(visitorId: string, url: string): Promise<SignInView> {
    const { client, openScreen } = this.#deps;
    const host = hostOf(url);
    const profileId = await client.createProfile(`Aletheia one check ${host}`);

    let session: SetupSession | undefined;
    try {
      session = await client.startSetup(profileId, url);
      const screen = await openScreen(session.cdpUrl, url);
      const record: SignInRecord = {
        id: randomUUID(),
        visitorId,
        profileId,
        sessionId: session.sessionId,
        url,
        host,
        state: "setting_up",
        expiresAt: session.expiresAt,
        savedAt: null,
      };
      this.#records.set(record.id, record);
      this.#screens.set(record.id, screen);
      await this.#persist();
      return this.#view(record);
    } catch (error) {
      if (session) await client.cancelSetup(profileId, session.sessionId).catch(() => undefined);
      await client.deleteProfile(profileId).catch(() => undefined);
      throw error;
    }
  }

  view(visitorId: string, id: string): SignInView {
    return this.#view(this.#owned(visitorId, id));
  }

  watch(visitorId: string, id: string, listener: (frame: Frame) => void): () => void {
    this.#owned(visitorId, id);
    const screen = this.#screens.get(id);
    if (!screen) throw missing();
    return screen.onFrame(listener);
  }

  async input(visitorId: string, id: string, input: SignInInput): Promise<void> {
    this.#owned(visitorId, id);
    const screen = this.#screens.get(id);
    if (!screen) throw missing();

    switch (input.kind) {
      case "click":
        return screen.click(input.x, input.y);
      case "key":
        return screen.press(input.key);
      case "text":
        return screen.type(input.text);
      case "scroll":
        return screen.scroll(input.dx, input.dy);
    }
  }

  async done(visitorId: string, id: string): Promise<SignInView> {
    const record = this.#owned(visitorId, id);
    if (record.state !== "setting_up") return this.#view(record);

    await this.#deps.client.saveSetup(record.profileId, record.sessionId, record.host);
    await this.#closeScreen(id);
    record.state = "ready";
    record.savedAt = this.#now();
    await this.#persist();
    return this.#view(record);
  }

  /** Hands the profile to one check. A sign-in lasts for one check only. */
  claim(visitorId: string, id: string): string {
    const record = this.#owned(visitorId, id);
    if (record.state !== "ready") {
      throw new ApiError("sign_in_not_ready", "Finish signing in before starting the check.");
    }
    record.state = "in_use";
    return record.profileId;
  }

  profileOf(id: string): string | null {
    return this.#records.get(id)?.profileId ?? null;
  }

  /** Ends a sign-in. Returns whether the site's session was logged out. */
  async release(id: string): Promise<boolean> {
    const record = this.#records.get(id);
    if (!record) return false;
    return this.#end(record);
  }

  async signOut(visitorId: string, id: string): Promise<void> {
    const record = this.#owned(visitorId, id);
    if (record.state === "in_use") {
      await this.#stopCheck(id);
      return;
    }
    await this.#end(record);
  }

  async sweep(): Promise<void> {
    const now = this.#now();
    const stale = [...this.#records.values()].filter((record) => {
      if (record.state === "setting_up") return now > Date.parse(record.expiresAt);
      return record.state === "ready" && now - (record.savedAt ?? 0) > UNUSED_LIMIT_MS;
    });
    await Promise.all(stale.map((record) => this.#end(record)));
  }

  /** A sign-in cannot outlive the server that was watching it. */
  async recover(): Promise<void> {
    const saved = (await readJson<SignInRecord[]>(this.#path)) ?? [];
    await Promise.all(saved.map((record) => this.#end(record)));
    await this.#persist();
  }

  #owned(visitorId: string, id: string): SignInRecord {
    const record = this.#records.get(id);
    if (record?.visitorId !== visitorId) throw missing();
    return record;
  }

  #view({ id, url, host, state, expiresAt }: SignInRecord): SignInView {
    return { id, url, host, state, expiresAt };
  }

  async #closeScreen(id: string): Promise<void> {
    const screen = this.#screens.get(id);
    this.#screens.delete(id);
    await screen?.close();
  }

  async #end(record: SignInRecord): Promise<boolean> {
    const { client, runLogout } = this.#deps;
    this.#records.delete(record.id);
    await this.#closeScreen(record.id);

    let loggedOut = false;
    try {
      if (record.state === "setting_up") {
        await client.cancelSetup(record.profileId, record.sessionId).catch(() => undefined);
      } else {
        loggedOut = await runLogout(record.profileId, record.url).catch(() => false);
      }
    } finally {
      await client.deleteProfile(record.profileId).catch(() => undefined);
      await this.#persist();
    }
    return loggedOut;
  }

  async #persist(): Promise<void> {
    await writeJson(this.#path, [...this.#records.values()]);
  }
}
