import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Native modal: focus trap and Escape come from the browser. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That did not work.");
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="confirm-title"
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-sm border-2 border-ink bg-sheet p-6 text-ink"
    >
      <h2 id="confirm-title" className="text-xl font-semibold">
        {title}
      </h2>
      <div className="mt-2 text-muted">{children}</div>
      {error ? (
        <p role="alert" className="mt-3 text-signal-deep">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" className="button button-quiet" onClick={onClose}>
          Keep it
        </button>
        <button
          type="button"
          className="button button-danger"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
