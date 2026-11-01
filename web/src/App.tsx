import { useEffect, useRef } from "react";

import { Link, Notice, usePageTitle } from "./components/ui.tsx";
import { newAuditHref } from "./lib/route.ts";
import { useRoute } from "./lib/useRoute.ts";
import { AuditPage, SharedPage } from "./pages/AuditPage.tsx";
import { ComparePage } from "./pages/ComparePage.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { NewAudit } from "./pages/NewAudit.tsx";

const ANNOUNCEMENT = newAuditHref({
  task: "Sign up for Creative Cloud Pro",
  url: "https://www.adobe.com/in/",
  signIn: false,
});

function NotFound() {
  usePageTitle("Page not found");
  return (
    <Notice
      title="There is nothing at this address"
      level="h1"
      action={
        <Link className="btn btn-soft" href="/">
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
    window.scrollTo(0, 0);
  }, [href]);

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-white focus:p-3"
      >
        Skip to the content
      </a>

      <header className="sticky top-3 z-30 mt-3 px-4 sm:top-4 sm:mt-4 sm:px-7">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 rounded-full border border-line bg-white/85 py-1.5 pr-1.5 pl-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] backdrop-blur-sm sm:py-2 sm:pr-2 sm:pl-[18px]">
          <Link
            href="/"
            aria-label="Aletheia, your audits"
            className="inline-flex min-h-11 items-center gap-[9px] text-[19px] font-semibold tracking-[-0.01em] text-ink"
          >
            <span aria-hidden="true" className="logo-mark" />
            Aletheia
          </Link>

          <Link
            href={ANNOUNCEMENT}
            className="hidden min-w-0 items-center gap-2 text-sm font-medium text-ink hover:underline hover:underline-offset-4 lg:flex"
          >
            <span className="pill pill-info">New</span>
            <span className="truncate">
              Adobe India audited: a fee for cancelling after 14 days
            </span>
          </Link>

          <nav aria-label="Main">
            <ul className="flex items-center gap-3 sm:gap-[18px]">
              <li>
                <Link
                  href="/"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-ink hover:underline hover:underline-offset-4 sm:text-[15px]"
                  aria-current={route.name === "dashboard" ? "page" : undefined}
                >
                  Your audits
                </Link>
              </li>
              <li>
                <Link
                  href="/new"
                  className="btn btn-ring px-4 text-sm sm:px-5 sm:text-[15px]"
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
        className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-8 pb-16 outline-none sm:px-7 sm:pt-10"
      >
        <Page />
      </main>

      <footer className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-8 gap-y-1 px-4 pb-8 text-[13px] text-mute sm:px-7">
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
      </footer>
    </div>
  );
}
