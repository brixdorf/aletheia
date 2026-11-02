import { useEffect, useState } from "react";

import { exampleAt } from "./examples.ts";

const ROTATE_MS = 3500;

/** Stops while the visitor is typing, and stays on the first example under reduced motion. */
export function useRotatingExample(rotating: boolean): string {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!rotating || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setTick((current) => current + 1), ROTATE_MS);
    return () => clearInterval(timer);
  }, [rotating]);

  return exampleAt(tick);
}
