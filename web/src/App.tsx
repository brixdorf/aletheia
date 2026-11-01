export function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-4">
        <h1 className="font-stencil text-[clamp(3.25rem,18.5vw,15rem)] leading-[0.82] tracking-[-0.015em] uppercase">
          Aletheia
        </h1>
        <p className="max-w-3xl text-xl leading-snug sm:text-2xl">
          Which banned dark patterns does this site use? Aletheia checks, and shows the proof.
        </p>
      </header>

      <main className="grid flex-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <section
          aria-labelledby="banned-heading"
          className="flex flex-col gap-6 rounded-[26px] bg-orange px-6 py-8 sm:px-8"
        >
          <p
            aria-hidden="true"
            className="font-stencil text-[clamp(9rem,20vw,14rem)] leading-[0.85] tracking-[-0.02em]"
          >
            13
          </p>
          <div className="mt-auto flex flex-col gap-3">
            <h2
              id="banned-heading"
              className="font-stencil text-3xl leading-tight uppercase sm:text-4xl"
            >
              <span className="sr-only">13 </span>Dark patterns banned in India
            </h2>
            <p className="max-w-2xl text-lg leading-normal">
              India's Central Consumer Protection Authority named them in its 2023 guidelines. They
              cover every platform selling to people in India, including international companies.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="agent-heading"
          className="flex flex-col gap-3 rounded-[26px] bg-teal px-6 py-8 text-bone sm:px-8 lg:justify-end"
        >
          <h2 id="agent-heading" className="font-stencil text-3xl leading-tight uppercase">
            A TinyFish agent walks the site
          </h2>
          <p className="text-lg leading-normal">
            It goes through checkout or sign-up like a real customer, stops before payment, and
            reports what it saw.
          </p>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-6 font-label text-lg font-bold tracking-[0.06em] uppercase">
        <p>The audit form is not open yet</p>
        <a
          className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-teal active:opacity-70"
          href="https://github.com/brixdorf/aletheia"
        >
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
