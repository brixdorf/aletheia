import type { AnchorHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from "react";
import { useEffect } from "react";

import type { PatternStatus } from "../lib/types.ts";
import { navigate } from "../lib/useRoute.ts";

export function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    const plain = !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (!href || event.defaultPrevented || !plain || event.button !== 0) return;
    event.preventDefault();
    navigate(href);
  }
  return <a href={href} onClick={follow} {...props} />;
}

const STAMP: Record<PatternStatus, { text: string; className: string }> = {
  found: { text: "Found", className: "stamp-found" },
  not_found: { text: "Not found", className: "stamp-not-found" },
  not_checked: { text: "Not checked", className: "stamp-not-checked" },
};

interface StampProps {
  status: PatternStatus;
  className?: string;
  /** Position among the stamps landing together, so they fall one after another. */
  pressOrder?: number;
}

export function Stamp({ status, className = "", pressOrder }: StampProps) {
  const { text, className: tone } = STAMP[status];
  const pressing = status === "found" && pressOrder !== undefined;
  const style = pressing
    ? ({ "--stamp-delay": `${Math.min(pressOrder, 4) * 120}ms` } as CSSProperties)
    : undefined;
  return (
    <span className={`stamp ${tone} ${pressing ? "stamp-press" : ""} ${className}`} style={style}>
      {text}
    </span>
  );
}

export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title === "Aletheia" ? title : `${title} | Aletheia`;
  }, [title]);
}

export function Notice({
  title,
  children,
  action,
  level: Heading = "h2",
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** h1 when the notice is the whole page. */
  level?: "h1" | "h2";
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-sm border border-rule bg-sheet p-6 sm:p-8">
      <Heading className="text-xl font-semibold">{title}</Heading>
      {children ? <div className="max-w-prose text-muted">{children}</div> : null}
      {action}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <p role="status" className="py-12 text-muted">
      {what}
    </p>
  );
}

export function Failed({
  message,
  onRetry,
  level = "h2",
}: {
  message: string;
  onRetry: () => void;
  level?: "h1" | "h2";
}) {
  return (
    <div role="alert">
      <Notice
        title="That did not work"
        level={level}
        action={
          <button type="button" className="button" onClick={onRetry}>
            Try again
          </button>
        }
      >
        {message}
      </Notice>
    </div>
  );
}
