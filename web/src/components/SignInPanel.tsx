import type { ChangeEvent, KeyboardEvent, MouseEvent } from "react";
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
import { siteName } from "../lib/sites.ts";
import type { ScreenFrame, SignInView } from "../lib/types.ts";
import { Modal } from "./Modal.tsx";

const SCROLL_STEP = 400;
const CODE_LENGTH = 6;

interface CodeBoxesProps {
  name: string;
  onText: (text: string) => void;
  onKey: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Sends each character on at once and keeps only a count, so a one-time code is never held here.
 * The site's own page shows the digits.
 */
function CodeBoxes({ name, onText, onKey }: CodeBoxesProps) {
  const [entered, setEntered] = useState(0);

  function change(event: ChangeEvent<HTMLInputElement>) {
    const { value } = event.target;
    event.target.value = "";
    if (!value) return;
    onText(value);
    setEntered((count) => Math.min(count + value.length, CODE_LENGTH));
  }

  function key(event: KeyboardEvent<HTMLInputElement>) {
    onKey(event);
    if (event.key === "Backspace") setEntered((count) => Math.max(count - 1, 0));
  }

  return (
    <label className="flex flex-col items-center gap-2 text-sm text-body">
      Type the code {name} sent you
      <span className="relative inline-flex gap-1.5 rounded-xl has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[#2563eb]">
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="grid h-11 w-[38px] place-items-center rounded-[10px] border border-line text-lg text-ink"
          >
            {index < entered ? "•" : ""}
          </span>
        ))}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          spellCheck={false}
          onChange={change}
          onKeyDown={key}
          aria-describedby="code-count"
          className="absolute inset-0 opacity-0"
        />
      </span>
      <span id="code-count" className="sr-only">
        {entered} of {CODE_LENGTH} characters sent
      </span>
    </label>
  );
}

interface SignInPanelProps {
  url: string;
  host: string;
  onReady: (signIn: SignInView) => void;
  /** The panel closed with no sign-in left behind. */
  onClosed: () => void;
}

export function SignInPanel({ url, host, onReady, onClosed }: SignInPanelProps) {
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
  const [typing, setTyping] = useState<"text" | "code">("text");

  useEffect(() => {
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

  const name = siteName(host);

  return (
    <Modal
      labelledBy="sign-in-title"
      onDismiss={() => void close()}
      dismissLabel={ended ? "Close" : "Cancel and sign out"}
      className="max-w-[720px]"
      footer="Runs in a TinyFish cloud browser. This window closes after about 15 minutes without activity."
    >
      <div className="mt-1 text-center">
        <h2 id="sign-in-title" className="text-xl tracking-[-0.02em] wrap-anywhere">
          Sign in to {name}
        </h2>
        <p className="mx-auto mt-1.5 max-w-[520px] text-body">
          You sign in yourself, code included. What you type goes straight to the site, and Aletheia
          keeps none of it. When this one check ends, we log out and delete the sign-in.
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-[14px] border border-line bg-wash">
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
            className="flex aspect-[16/10] items-center justify-center gap-3 p-4 text-center text-mute"
          >
            {ended ? null : <span aria-hidden="true" className="spinner" />}
            {ended ? "The sign-in window is closed." : `Opening ${host} in a private browser.`}
          </div>
        )}
      </div>

      {signIn && !ended ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div
              role="group"
              aria-label="What to type"
              className="flex rounded-full bg-[#f3f4f6] p-1"
            >
              {(
                [
                  ["text", "Phone or email"],
                  ["code", "Code"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={typing === value}
                  onClick={() => setTyping(value)}
                  className={`min-h-9 rounded-full px-4 text-sm font-medium transition-colors ${
                    typing === value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-soft btn-sm"
              onClick={() => relay.current?.push({ kind: "scroll", dx: 0, dy: -SCROLL_STEP })}
            >
              Scroll up
            </button>
            <button
              type="button"
              className="btn btn-soft btn-sm"
              onClick={() => relay.current?.push({ kind: "scroll", dx: 0, dy: SCROLL_STEP })}
            >
              Scroll down
            </button>
          </div>

          {typing === "code" ? (
            <CodeBoxes
              name={name}
              onText={(text) => relay.current?.push({ kind: "text", text })}
              onKey={fieldKey}
            />
          ) : (
            <label className="flex flex-col gap-1 text-sm text-body">
              Type into the page (clears as you type)
              <input
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="field"
                onKeyDown={fieldKey}
                onChange={(event) => {
                  relay.current?.push({ kind: "text", text: event.target.value });
                  event.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      ) : null}

      {message ? (
        <p role="alert" className="mt-3 text-center font-medium text-peach-ink">
          {message}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button type="button" className="btn btn-soft" onClick={() => void close()}>
          {ended ? "Close" : "Cancel and sign out"}
        </button>
        {ended ? null : (
          <button
            ref={doneButton}
            type="button"
            className="btn btn-dark"
            disabled={!signIn || saving}
            onClick={() => void done()}
          >
            {saving ? "Saving" : "Done, I am signed in"}
          </button>
        )}
      </div>
    </Modal>
  );
}
