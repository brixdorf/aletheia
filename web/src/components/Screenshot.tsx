import { useEffect, useRef, useState } from "react";

interface ScreenshotProps {
  src: string;
  /** Says what the picture proves, as its alt text and the viewer's title. */
  label: string;
}

const THUMB_WIDTH = 240;
const THUMB_HEIGHT = 150;

function FullSize({ src, label, onClose }: ScreenshotProps & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={label}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-5xl overflow-auto rounded-sm border-2 border-ink bg-sheet p-3 text-ink"
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="min-w-0 text-sm text-muted">{label}</p>
        <button type="button" className="button button-quiet shrink-0" onClick={onClose}>
          Close
        </button>
      </div>
      <img src={src} alt={label} className="h-auto w-full" />
    </dialog>
  );
}

export function Screenshot({ src, label }: ScreenshotProps) {
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);

  if (missing)
    return <p className="text-sm text-muted">The screenshot for this step is not available.</p>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-fit rounded-sm border border-edge bg-paper p-1 hover:border-ink active:translate-y-px"
      >
        <span className="sr-only">Open the full screenshot: </span>
        <img
          src={src}
          alt={label}
          width={THUMB_WIDTH}
          height={THUMB_HEIGHT}
          loading="lazy"
          onError={() => setMissing(true)}
          className="aspect-[8/5] h-auto w-60 max-w-full object-cover object-top"
        />
      </button>
      {open ? <FullSize src={src} label={label} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
