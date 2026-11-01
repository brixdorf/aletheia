import type { CDPSession, Page } from "playwright-core";
import { chromium } from "playwright-core";

export interface Frame {
  /** A base64 JPEG. */
  data: string;
  width: number;
  height: number;
}

export interface RemoteScreen {
  onFrame(listener: (frame: Frame) => void): () => void;
  click(x: number, y: number): Promise<void>;
  press(key: string): Promise<void>;
  type(text: string): Promise<void>;
  scroll(dx: number, dy: number): Promise<void>;
  close(): Promise<void>;
}

export type OpenScreen = (cdpUrl: string, url: string) => Promise<RemoteScreen>;

const NAVIGATION_TIMEOUT_MS = 45_000;

/**
 * Shows the setup browser in our own sign-in panel. Frames and input pass straight through this
 * connection: nothing here is logged or stored, because a person is typing a phone number or code.
 */
export const openRemoteScreen: OpenScreen = async (cdpUrl, url) => {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const listeners = new Set<(frame: Frame) => void>();

  let page: Page = context.pages()[0] ?? (await context.newPage());
  let session: CDPSession | undefined;
  let latest: Frame | undefined;

  const showPage = async (next: Page) => {
    await session?.detach().catch(() => undefined);
    page = next;
    const cdp = await context.newCDPSession(next);
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      const frame = { data, width: metadata.deviceWidth, height: metadata.deviceHeight };
      latest = frame;
      for (const listener of listeners) listener(frame);
      cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60 });
    session = cdp;
  };

  // Sign-in with Google and the like opens a popup, and the person needs to see that instead.
  context.on("page", (popup) => {
    showPage(popup).catch(() => undefined);
    popup.on("close", () => {
      const last = context.pages().at(-1);
      if (last) showPage(last).catch(() => undefined);
    });
  });

  await showPage(page);
  if (page.url() === "about:blank") {
    await page
      .goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS })
      .catch(() => undefined);
  }

  return {
    // Chrome only sends a frame on repaint, so a still page would stay blank for a late watcher.
    onFrame(listener) {
      listeners.add(listener);
      if (latest) listener(latest);
      return () => listeners.delete(listener);
    },
    click: (x, y) => page.mouse.click(x, y),
    press: (key) => page.keyboard.press(key),
    type: (text) => page.keyboard.insertText(text),
    scroll: (dx, dy) => page.mouse.wheel(dx, dy),
    async close() {
      listeners.clear();
      latest = undefined;
      await browser.close().catch(() => undefined);
    },
  };
};
