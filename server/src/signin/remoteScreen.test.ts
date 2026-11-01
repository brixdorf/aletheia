import { describe, expect, it, vi } from "vite-plus/test";

import type { Frame } from "./remoteScreen.ts";
import { openRemoteScreen } from "./remoteScreen.ts";

type FrameEvent = { data: string; metadata: object; sessionId: number };

const { browser, emitFrame } = vi.hoisted(() => {
  let onFrame: ((event: FrameEvent) => void) | undefined;
  const cdp = {
    on: (_event: string, handler: (event: FrameEvent) => void) => {
      onFrame = handler;
    },
    send: () => Promise.resolve(),
    detach: () => Promise.resolve(),
  };
  const page = { url: () => "https://site.test/login", mouse: {}, keyboard: {} };
  const context = {
    on: () => undefined,
    pages: () => [page],
    newCDPSession: () => Promise.resolve(cdp),
  };
  return {
    browser: { contexts: () => [context], close: () => Promise.resolve() },
    emitFrame: () =>
      onFrame?.({ data: "abc", metadata: { deviceWidth: 1280, deviceHeight: 800 }, sessionId: 1 }),
  };
});

vi.mock("playwright-core", () => ({
  chromium: { connectOverCDP: () => Promise.resolve(browser) },
}));

const FRAME: Frame = { data: "abc", width: 1280, height: 800 };

describe("openRemoteScreen", () => {
  it("shows a new watcher the current page, which may not repaint for a while", async () => {
    const screen = await openRemoteScreen("wss://cdp.test", "https://site.test/login");
    emitFrame();

    const seen: Frame[] = [];
    screen.onFrame((frame) => seen.push(frame));

    expect(seen).toEqual([FRAME]);
  });

  it("keeps sending frames that arrive later", async () => {
    const screen = await openRemoteScreen("wss://cdp.test", "https://site.test/login");
    const seen: Frame[] = [];
    screen.onFrame((frame) => seen.push(frame));

    emitFrame();

    expect(seen).toEqual([FRAME]);
  });

  it("lets go of the last frame on close, since it can show what was typed", async () => {
    const screen = await openRemoteScreen("wss://cdp.test", "https://site.test/login");
    emitFrame();
    await screen.close();

    const seen: Frame[] = [];
    screen.onFrame((frame) => seen.push(frame));

    expect(seen).toEqual([]);
  });
});
