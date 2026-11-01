import type { KeyboardEvent, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";

import {
  ApiFailure,
  finishSignIn,
  sendSignInInput,
  signInScreenUrl,
  signOut,
  startSignIn,
} from "../lib/api.ts";
import { InputRelay, keyToInput, toRemotePoint } from "../lib/remoteInput.ts";
import type { ScreenFrame, SignInView } from "../lib/types.ts";

const SCROLL_STEP = 400;

interface SignInPanelProps {
  url: string;
  host: string;
  onReady: (signIn: SignInView) => void;
  /** The panel closed with no sign-in left behind. */
  onClosed: () => void;
}

export function SignInPanel({ url, host, onReady, onClosed }: SignInPanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  const relay = useRef<InputRelay | null>(null);
  const opened = useRef(false);
  const abandoned = useRef(false);

  const [signIn, setSignIn] = useState<SignInView | null>(null);
  const [frame, setFrame] = useState<ScreenFrame | null>(null);
  const [saving, setSaving] = useState(false);
  const [ended, setEnded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    if (opened.current) return;
    opened.current = true;

    startSignIn(url).then(
      (view) => {
        if (abandoned.current) {
          void signOut(view.id).catch(() => undefined);
          return;
        }
        relay.current = new InputRelay(
          (input) => sendSignInInput(view.id, input),
          () => setMessage("That key press did not reach the site. Please try it again."),
        );
        setSignIn(view);
      },
      (error: unknown) => {
        setEnded(true);
        setMessage(error instanceof Error ? error.message : "The sign-in could not start.");
      },
    );
  }, [url]);

  const signInId = signIn?.id;
  useEffect(() => {
    if (!signInId) return;
    const events = new EventSource(signInScreenUrl(signInId));
    events.addEventListener("frame", (event) => {
      setFrame(JSON.parse((event as MessageEvent<string>).data) as ScreenFrame);
    });
    events.onerror = () => {
      if (events.readyState !== EventSource.CLOSED) return;
      setEnded(true);
      setMessage("This sign-in window has closed. Close it and start the sign-in again.");
    };
    return () => events.close();
  }, [signInId]);

  useEffect(() => {
    const target = screen.current;
    if (!target || !frame) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      relay.current?.push({ kind: "scroll", dx: event.deltaX, dy: event.deltaY });
    }
    target.addEventListener("wheel", wheel, { passive: false });
    return () => target.removeEventListener("wheel", wheel);
  }, [frame !== null]);

  function click(event: MouseEvent<HTMLImageElement>) {
    if (!frame || !image.current) return;
    const point = toRemotePoint(event, image.current.getBoundingClientRect(), frame);
    relay.current?.push({ kind: "click", ...point });
  }

  function screenKey(event: KeyboardEvent<HTMLDivElement>) {
    // Tab goes to the site, so Escape is the way out of the screen for keyboard users.
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      doneButton.current?.focus();
      return;
    }
    const input = keyToInput(event.nativeEvent);
    if (!input) return;
    event.preventDefault();
    relay.current?.push(input);
  }

  function fieldKey(event: KeyboardEvent<HTMLInputElement>) {
    const input = keyToInput(event.nativeEvent);
    if (input?.kind !== "key" || input.key === "Tab") return;
    event.preventDefault();
    relay.current?.push(input);
  }

  async function done() {
    if (!signIn) return;
    setSaving(true);
    setMessage(null);
    try {
      onReady(await finishSignIn(signIn.id));
    } catch (error) {
      setSaving(false);
      if (error instanceof ApiFailure && error.code === "not_found") setEnded(true);
      setMessage(error instanceof Error ? error.message : "The sign-in could not be saved.");
    }
  }

  async function close() {
    abandoned.current = true;
    if (signIn && !ended) await signOut(signIn.id).catch(() => undefined);
    onClosed();
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="sign-in-title"
      onCancel={(event) => {
        event.preventDefault();
        void close();
      }}
      className="m-auto max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto rounded-sm border-2 border-ink bg-sheet p-4 text-ink sm:p-6"
    >
      <h2 id="sign-in-title" className="text-xl font-semibold wrap-anywhere">
        Sign in to {host}
      </h2>
      <p className="mt-1 max-w-prose text-muted">
        You sign in yourself, code included. What you type goes straight to the site, and Aletheia
        keeps none of it. The sign-in lasts for one check. When that ends, we log out of the site
        and delete it.
      </p>

      <div className="mt-4 rounded-sm border-2 border-edge bg-paper">
        {frame ? (
          <div
            ref={screen}
            role="application"
            tabIndex={0}
            aria-label={`Browser showing ${host}. Keys go to the site. Press Escape to leave.`}
            onKeyDown={screenKey}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (text) relay.current?.push({ kind: "text", text });
            }}
          >
            <img
              ref={image}
              src={`data:image/jpeg;base64,${frame.data}`}
              alt={`Live view of ${host}`}
              width={frame.width}
              height={frame.height}
              draggable={false}
              onClick={click}
              className="h-auto w-full cursor-pointer select-none"
            />
          </div>
        ) : (
          <div
            role="status"
            className="flex aspect-[16/10] items-center justify-center p-4 text-center text-muted"
          >
            {ended ? "The sign-in window is closed." : `Opening ${host} in a private browser.`}
          </div>
        )}
      </div>

      {signIn && !ended ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm text-muted">
            Type into the page (clears as you type)
            <input
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="field text-ink"
              onKeyDown={fieldKey}
              onChange={(event) => {
                relay.current?.push({ kind: "text", text: event.target.value });
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => relay.current?.push({ kind: "scroll", dx: 0, dy: -SCROLL_STEP })}
          >
            Scroll up
          </button>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => relay.current?.push({ kind: "scroll", dx: 0, dy: SCROLL_STEP })}
          >
            Scroll down
          </button>
        </div>
      ) : null}

      {message ? (
        <p role="alert" className="mt-3 font-medium text-signal-deep">
          {message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          This window closes after about 15 minutes without activity.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="button button-quiet" onClick={() => void close()}>
            {ended ? "Close" : "Cancel and sign out"}
          </button>
          {ended ? null : (
            <button
              ref={doneButton}
              type="button"
              className="button button-primary"
              disabled={!signIn || saving}
              onClick={() => void done()}
            >
              {saving ? "Saving" : "Done, I am signed in"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
