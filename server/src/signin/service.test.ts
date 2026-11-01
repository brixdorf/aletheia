import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ApiError } from "../errors.ts";
import type { Frame, RemoteScreen } from "./remoteScreen.ts";
import type { SignInClient } from "./service.ts";
import { SignInService } from "./service.ts";

const URL_LOGIN = "https://www.shop.test/login";
const SESSION = {
  sessionId: "sess_1",
  cdpUrl: "wss://cdp.test/1",
  expiresAt: "2026-11-01T00:15:00.000Z",
};

function fakeScreen() {
  let listener: ((frame: Frame) => void) | undefined;
  return {
    onFrame: (fn: (frame: Frame) => void) => {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
    emit: (frame: Frame) => listener?.(frame),
    click: vi.fn(() => Promise.resolve()),
    press: vi.fn(() => Promise.resolve()),
    type: vi.fn(() => Promise.resolve()),
    scroll: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  } satisfies RemoteScreen & { emit: (frame: Frame) => void };
}

function fakeClient() {
  return {
    createProfile: vi.fn(() => Promise.resolve("prof_1")),
    deleteProfile: vi.fn(() => Promise.resolve()),
    startSetup: vi.fn(() => Promise.resolve(SESSION)),
    saveSetup: vi.fn(() => Promise.resolve()),
    cancelSetup: vi.fn(() => Promise.resolve()),
  } satisfies SignInClient;
}

describe("SignInService", () => {
  let dataDir: string;
  let client: ReturnType<typeof fakeClient>;
  let screen: ReturnType<typeof fakeScreen>;
  let runLogout: ReturnType<typeof vi.fn<(profileId: string, url: string) => Promise<boolean>>>;
  let time: number;

  function service() {
    return new SignInService({
      client,
      openScreen: () => Promise.resolve(screen),
      runLogout,
      dataDir,
      now: () => time,
    });
  }

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "aletheia-signin-"));
    client = fakeClient();
    screen = fakeScreen();
    runLogout = vi.fn(() => Promise.resolve(true));
    time = Date.parse("2026-11-01T00:00:00.000Z");
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("gives each sign-in its own profile and a setup session on the site", async () => {
    const view = await service().start("visitor", URL_LOGIN);

    expect(client.createProfile).toHaveBeenCalledWith("Aletheia one check shop.test");
    expect(client.startSetup).toHaveBeenCalledWith("prof_1", URL_LOGIN);
    expect(view).toMatchObject({
      host: "shop.test",
      state: "setting_up",
      expiresAt: SESSION.expiresAt,
    });
  });

  it("removes the profile when the setup browser cannot be opened", async () => {
    client.startSetup.mockRejectedValueOnce(new Error("no browser"));

    await expect(service().start("visitor", URL_LOGIN)).rejects.toThrow();

    expect(client.deleteProfile).toHaveBeenCalledWith("prof_1");
  });

  it("streams the screen and relays clicks and keys to the visitor's own session", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);
    const frames: Frame[] = [];

    signIns.watch("visitor", id, (frame) => frames.push(frame));
    screen.emit({ data: "abc", width: 1280, height: 720 });
    await signIns.input("visitor", id, { kind: "click", x: 10, y: 20 });
    await signIns.input("visitor", id, { kind: "text", text: "98765" });
    await signIns.input("visitor", id, { kind: "key", key: "Enter" });
    await signIns.input("visitor", id, { kind: "scroll", dx: 0, dy: 100 });

    expect(frames).toHaveLength(1);
    expect(screen.click).toHaveBeenCalledWith(10, 20);
    expect(screen.type).toHaveBeenCalledWith("98765");
    expect(screen.press).toHaveBeenCalledWith("Enter");
    expect(screen.scroll).toHaveBeenCalledWith(0, 100);
  });

  it("keeps one visitor out of another's sign-in", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);

    await expect(
      signIns.input("stranger", id, { kind: "click", x: 1, y: 1 }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(() => signIns.view("stranger", id)).toThrow(ApiError);
  });

  it("saves on Done, closes the screen and is then ready for one check", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);

    const view = await signIns.done("visitor", id);

    expect(client.saveSetup).toHaveBeenCalledWith("prof_1", "sess_1", "shop.test");
    expect(screen.close).toHaveBeenCalledOnce();
    expect(view.state).toBe("ready");
    expect(signIns.claim("visitor", id)).toBe("prof_1");
  });

  it("lasts for one check only", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);
    await signIns.done("visitor", id);
    signIns.claim("visitor", id);

    expect(() => signIns.claim("visitor", id)).toThrow(ApiError);
  });

  it("will not start a check before sign-in is finished", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);

    expect(() => signIns.claim("visitor", id)).toThrow(ApiError);
  });

  it("logs out and then deletes the profile when the check ends", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);
    await signIns.done("visitor", id);
    signIns.claim("visitor", id);

    const loggedOut = await signIns.release(id);

    expect(runLogout).toHaveBeenCalledWith("prof_1", URL_LOGIN);
    expect(loggedOut).toBe(true);
    expect(client.deleteProfile).toHaveBeenCalledWith("prof_1");
    expect(() => signIns.view("visitor", id)).toThrow(ApiError);
  });

  it("deletes the profile even if the logout fails", async () => {
    runLogout.mockRejectedValueOnce(new Error("logout run failed"));
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);
    await signIns.done("visitor", id);
    signIns.claim("visitor", id);

    expect(await signIns.release(id)).toBe(false);
    expect(client.deleteProfile).toHaveBeenCalledWith("prof_1");
  });

  it("releases only once, so one profile gets one logout run", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);
    await signIns.done("visitor", id);
    signIns.claim("visitor", id);

    await Promise.all([signIns.release(id), signIns.release(id)]);

    expect(runLogout).toHaveBeenCalledOnce();
    expect(client.deleteProfile).toHaveBeenCalledOnce();
  });

  it("signing out during setup cancels it and needs no logout, as nothing was saved", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);

    await signIns.signOut("visitor", id);

    expect(client.cancelSetup).toHaveBeenCalledWith("prof_1", "sess_1");
    expect(screen.close).toHaveBeenCalledOnce();
    expect(runLogout).not.toHaveBeenCalled();
    expect(client.deleteProfile).toHaveBeenCalledWith("prof_1");
  });

  it("signing out after saving logs out first", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);
    await signIns.done("visitor", id);

    await signIns.signOut("visitor", id);

    expect(runLogout).toHaveBeenCalledOnce();
    expect(client.deleteProfile).toHaveBeenCalledOnce();
  });

  it("signing out during a check stops that check", async () => {
    const stopCheck = vi.fn(() => Promise.resolve());
    const signIns = service();
    signIns.onSignOutDuringCheck(stopCheck);
    const { id } = await signIns.start("visitor", URL_LOGIN);
    await signIns.done("visitor", id);
    signIns.claim("visitor", id);

    await signIns.signOut("visitor", id);

    expect(stopCheck).toHaveBeenCalledWith(id);
  });

  it("closes a setup session left past its limit", async () => {
    const signIns = service();
    await signIns.start("visitor", URL_LOGIN);
    time = Date.parse(SESSION.expiresAt) + 1;

    await signIns.sweep();

    expect(client.cancelSetup).toHaveBeenCalledOnce();
    expect(client.deleteProfile).toHaveBeenCalledOnce();
  });

  it("logs out of a saved sign-in nobody used", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);
    await signIns.done("visitor", id);
    time += 31 * 60 * 1000;

    await signIns.sweep();

    expect(runLogout).toHaveBeenCalledOnce();
    expect(client.deleteProfile).toHaveBeenCalledOnce();
    expect(() => signIns.view("visitor", id)).toThrow(ApiError);
  });

  it("leaves a sign-in alone while its check is running", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);
    await signIns.done("visitor", id);
    signIns.claim("visitor", id);
    time += 60 * 60 * 1000;

    await signIns.sweep();

    expect(client.deleteProfile).not.toHaveBeenCalled();
  });

  it("cleans up sign-ins left over from before a restart", async () => {
    const first = service();
    const { id } = await first.start("visitor", URL_LOGIN);
    await first.done("visitor", id);

    await service().recover();

    expect(runLogout).toHaveBeenCalledOnce();
    expect(client.deleteProfile).toHaveBeenCalledOnce();
  });

  it("writes only the profile id and site to disk, never what was typed", async () => {
    const signIns = service();
    const { id } = await signIns.start("visitor", URL_LOGIN);
    await signIns.input("visitor", id, { kind: "text", text: "9876543210" });

    const saved = await readFile(join(dataDir, "signins.json"), "utf8");

    expect(saved).not.toContain("9876543210");
    expect(saved).not.toContain(SESSION.cdpUrl);
    expect(saved).toContain("prof_1");
  });
});
