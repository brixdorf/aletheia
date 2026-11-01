import { useEffect, useRef } from "react";

import { Link, Notice, usePageTitle } from "./components/ui.tsx";
import { useRoute } from "./lib/useRoute.ts";
import { AuditPage, SharedPage } from "./pages/AuditPage.tsx";
import { ComparePage } from "./pages/ComparePage.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { NewAudit } from "./pages/NewAudit.tsx";

function NotFound() {
  usePageTitle("Page not found");
  return (
    <Notice
      title="There is nothing at this address"
      level="h1"
      action={
        <Link className="button" href="/">
          Back to your audits
        </Link>
      }
    >
      The link may be old, or the audit may have been deleted.
    </Notice>
  );
}

function Page() {
  const { href, route } = useRoute();
  switch (route.name) {
    case "dashboard":
      return <Dashboard />;
    case "new":
      return <NewAudit key={href} prefill={route} />;
    case "audit":
      return <AuditPage key={route.id} id={route.id} />;
    case "shared":
      return <SharedPage key={route.token} token={route.token} />;
    case "compare":
      return <ComparePage key={href} ids={route.ids} />;
    case "not_found":
      return <NotFound />;
  }
}

export function App() {
  const { href, route } = useRoute();
  const main = useRef<HTMLElement>(null);
  const firstPage = useRef(true);

  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    // A client-side page change does not move focus, so screen readers would stay on the old link.
    main.current?.focus({ preventScroll: true });
  }, [href]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:bg-sheet focus:p-2"
      >
        Skip to the content
      </a>
      <header className="border-b border-rule">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 sm:px-8">
          <Link
            href="/"
            aria-label="Aletheia, your audits"
            className="-ml-1 inline-flex min-h-11 items-center px-1 font-stencil text-3xl tracking-tight uppercase hover:text-muted"
          >
            Aletheia
          </Link>
          <nav aria-label="Main">
            <ul className="flex items-center gap-5">
              <li>
                <Link
                  href="/"
                  className="link inline-flex min-h-11 items-center"
                  aria-current={route.name === "dashboard" ? "page" : undefined}
                >
                  Your audits
                </Link>
              </li>
              <li>
                <Link
                  href="/new"
                  className="link inline-flex min-h-11 items-center"
                  aria-current={route.name === "new" ? "page" : undefined}
                >
                  New audit
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main
        id="main"
        ref={main}
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-8 sm:py-10"
      >
        <Page />
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-1 px-4 py-3 text-sm text-muted sm:px-8">
          <p>
            Checks the 13 dark patterns in India's 2023 CCPA guidelines. The agent stops before
            payment.
          </p>
          <a
            className="link inline-flex min-h-11 items-center"
            href="https://github.com/brixdorf/aletheia"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
