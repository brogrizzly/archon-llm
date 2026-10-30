import { useState, type CSSProperties, type FormEvent } from "react";

type VisionMode = "red_night" | "red_day" | "clarity_night" | "clarity_day";
type AppearanceMode = VisionMode | "c64";

type Palette = {
  page: string;
  panel: string;
  soft: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  warn: string;
  warnSoft: string;
};

const palette: Record<AppearanceMode, Palette> = {
  clarity_night: {
    page: "#141A1D",
    panel: "#1D2529",
    soft: "#283237",
    ink: "#F5F4EC",
    muted: "#C2CBCC",
    line: "#758287",
    accent: "#70D1C2",
    accentInk: "#112322",
    accentSoft: "#24413D",
    warn: "#F0D08A",
    warnSoft: "#483C22",
  },
  clarity_day: {
    page: "#F4F3EC",
    panel: "#FFFEF9",
    soft: "#E6E8DE",
    ink: "#263236",
    muted: "#4D5E62",
    line: "#778588",
    accent: "#2E6F68",
    accentInk: "#FFFFFF",
    accentSoft: "#D6E8E2",
    warn: "#79591F",
    warnSoft: "#F5EACF",
  },
  red_night: {
    page: "#1C1115",
    panel: "#28181E",
    soft: "#38232A",
    ink: "#FFF1F3",
    muted: "#E3CDD2",
    line: "#8A6971",
    accent: "#EF8799",
    accentInk: "#261116",
    accentSoft: "#48252F",
    warn: "#F7D397",
    warnSoft: "#4B3922",
  },
  red_day: {
    page: "#F3E6E8",
    panel: "#FFF9F8",
    soft: "#EAD5D9",
    ink: "#341A21",
    muted: "#60434A",
    line: "#896A71",
    accent: "#912F40",
    accentInk: "#FFFFFF",
    accentSoft: "#F1DADD",
    warn: "#765318",
    warnSoft: "#F5E7C5",
  },
  c64: {
    page: "#40318D",
    panel: "#342775",
    soft: "#4B3B95",
    ink: "#FFFFFF",
    muted: "#E5E1FF",
    line: "#9E95D8",
    accent: "#70A4B2",
    accentInk: "#112C35",
    accentSoft: "#31477E",
    warn: "#BFCE72",
    warnSoft: "#4D4628",
  },
};

const appearanceOptions: { id: AppearanceMode; label: string; description: string; kind: "ocular" | "colorway" }[] = [
  { id: "red_night", label: "Red Night", description: "Red family · low-glare night", kind: "ocular" },
  { id: "red_day", label: "Red Day", description: "Red family · low-glare day", kind: "ocular" },
  { id: "clarity_night", label: "Clarity Night", description: "Neutral clarity · night", kind: "ocular" },
  { id: "clarity_day", label: "Clarity Day", description: "Neutral clarity · day", kind: "ocular" },
  { id: "c64", label: "C64 Colorway", description: "Commodore 64-inspired · blue, cyan, soft lime", kind: "colorway" },
];

export function ArchonHud() {
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>("clarity_night");
  const [textScale, setTextScale] = useState(110);
  const [intensity, setIntensity] = useState(62);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState("");
  const colors = palette[appearanceMode];

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(
      prompt.trim()
        ? "Prototype only — no checkpoint or runtime is connected. Nothing was sent or generated."
        : "Enter a prompt to preview the prototype interaction. No runtime is connected.",
    );
  }

  const variables = {
    "--page": colors.page,
    "--panel": colors.panel,
    "--soft": colors.soft,
    "--ink": colors.ink,
    "--muted": colors.muted,
    "--line": colors.line,
    "--accent": colors.accent,
    "--accent-soft": colors.accentSoft,
    "--warn": colors.warn,
    "--warn-soft": colors.warnSoft,
    "--accent-strength": 0.35 + (intensity / 100) * 0.65,
    "--ui-scale": `${textScale}%`,
    "--motion": reducedMotion ? "0ms" : "160ms",
  } as CSSProperties;

  return (
      <main className="archon-root" data-appearance-mode={appearanceMode} style={variables}>
      <style>{`
        .archon-root { background: var(--page); color: var(--ink); min-height: 100dvh; font-size: var(--ui-scale); }
        .archon-root * { box-sizing: border-box; }
        .archon-root button, .archon-root input, .archon-root textarea { font: inherit; }
        .archon-root button { cursor: pointer; }
        .archon-root :focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
        .archon-root .motion-enabled { transition: background-color var(--motion) ease, color var(--motion) ease, border-color var(--motion) ease; }
        .archon-root .label { font-size: .85em; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
        .archon-root .small { font-size: .9em; line-height: 1.5; }
        .archon-root .body-copy { font-size: 1em; line-height: 1.55; }
        .archon-root .display { font-size: clamp(2em, 4vw, 3.2em); line-height: 1.02; letter-spacing: -.045em; }
        .archon-root .section-title { font-size: 1.18em; line-height: 1.25; letter-spacing: -.015em; }
        .archon-root .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .archon-root .accent-rule { background: var(--accent); opacity: var(--accent-strength); }
        .archon-root input[type="range"] { accent-color: var(--accent); min-height: 2.75em; }
        .archon-root input[type="checkbox"] { accent-color: var(--accent); width: 1.2em; height: 1.2em; }
        @media (prefers-reduced-motion: reduce) {
          .archon-root *, .archon-root *::before, .archon-root *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-7 sm:py-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b pb-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-4">
            <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center border-2 font-bold tracking-[-.12em]" style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-soft)" }}>
              A/
            </div>
            <div>
              <p className="label mb-1" style={{ color: "var(--muted)" }}>Archon · experimental language model</p>
              <p className="mono small" style={{ color: "var(--muted)" }}>Human-guided workspace / visual prototype</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="label rounded-sm border px-3 py-2" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>Prototype</span>
            <span className="label flex items-center gap-2 rounded-sm border px-3 py-2" style={{ borderColor: "var(--line)" }}>
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: "var(--warn)" }} />
              Anchor · unresolved
            </span>
          </div>
        </header>

        <section className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-12 lg:py-12">
          <div className="max-w-3xl">
            <p className="label mb-4 flex items-center gap-3" style={{ color: "var(--accent)" }}>
              <span className="accent-rule inline-block h-[2px] w-8" />
              A careful interface for careful work
            </p>
            <h1 className="display max-w-2xl font-semibold">Think together.<br />Keep authority human.</h1>
            <p className="body-copy mt-5 max-w-2xl" style={{ color: "var(--muted)" }}>
              A quiet workspace for exploring language-model ideas. This panel shows what is known, what is not, and where a person remains in control.
            </p>
          </div>
          <aside className="motion-enabled border-l-4 p-5 sm:p-6" style={{ borderColor: "var(--warn)", background: "var(--warn-soft)" }} aria-labelledby="approval-title">
            <p className="label mb-3" style={{ color: "var(--warn)" }}>Human approval boundary</p>
            <h2 id="approval-title" className="section-title font-semibold">Nothing commits itself.</h2>
            <p className="small mt-3" style={{ color: "var(--muted)" }}>
              Human approval is required before any eventual commit. This prototype has no commit action or connected runtime.
            </p>
          </aside>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,.8fr)]">
          <section className="motion-enabled border" style={{ background: "var(--panel)", borderColor: "var(--line)" }} aria-labelledby="prompt-heading">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 sm:px-7" style={{ borderColor: "var(--line)" }}>
              <div>
                <p className="label mb-1" style={{ color: "var(--muted)" }}>01 / Input</p>
                <h2 id="prompt-heading" className="section-title font-semibold">Start with a question</h2>
              </div>
              <span className="mono small border px-2.5 py-1.5" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>No runtime</span>
            </div>
            <form className="p-5 sm:p-7" onSubmit={submitPrompt}>
              <label htmlFor="archon-prompt" className="label mb-2 block" style={{ color: "var(--muted)" }}>Your prompt</label>
              <textarea
                id="archon-prompt"
                value={prompt}
                onChange={(event) => { setPrompt(event.target.value); setNotice(""); }}
                rows={5}
                placeholder="What would you like to think through?"
                className="motion-enabled w-full resize-y border px-4 py-3 outline-none"
                style={{ minHeight: "9em", borderColor: "var(--line)", background: "var(--page)", color: "var(--ink)" }}
              />
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="small max-w-md" style={{ color: "var(--muted)" }}>Submitting only demonstrates this interface. Your text stays in this page.</p>
                <button type="submit" className="motion-enabled min-h-12 border-2 px-5 py-3 text-left font-semibold" style={{ borderColor: "var(--accent)", background: "var(--accent)", color: colors.accentInk }}>
                  Check prototype
                  <span aria-hidden="true" className="ml-4">→</span>
                </button>
              </div>
              {notice && <p role="status" aria-live="polite" className="mt-5 border-l-4 px-4 py-3 body-copy" style={{ borderColor: "var(--warn)", background: "var(--warn-soft)", color: "var(--ink)" }}>{notice}</p>}
            </form>
          </section>

          <section className="motion-enabled border" style={{ background: "var(--panel)", borderColor: "var(--line)" }} aria-labelledby="facts-heading">
            <div className="border-b px-5 py-4 sm:px-6" style={{ borderColor: "var(--line)" }}>
              <p className="label mb-1" style={{ color: "var(--muted)" }}>02 / Readiness</p>
              <h2 id="facts-heading" className="section-title font-semibold">Known, not inferred</h2>
            </div>
            <dl className="divide-y px-5 sm:px-6" style={{ borderColor: "var(--line)" }}>
              {[
                ["Model checkpoint", "Unavailable"],
                ["Anchor Pi / numerator", "Semantics unresolved"],
                ["Resource snapshot", "Not supplied"],
              ].map(([term, description]) => (
                <div key={term} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] sm:gap-4">
                  <dt className="small" style={{ color: "var(--muted)" }}>{term}</dt>
                  <dd className="small font-semibold">{description}</dd>
                </div>
              ))}
            </dl>
            <p className="mx-5 mb-5 mt-2 border px-3 py-3 small sm:mx-6" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
              Status is stated in words. No live metrics are available in this visual prototype.
            </p>
          </section>
        </div>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label="Visual comfort and interface controls">
          <div className="motion-enabled border p-5 sm:p-7" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
            <p className="label mb-1" style={{ color: "var(--muted)" }}>03 / Visual comfort</p>
            <h2 className="section-title font-semibold">Tune the page to your reading</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <label className="label mb-3 block" htmlFor="text-scale" style={{ color: "var(--muted)" }}>Text size · {textScale}%</label>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Decrease text size" onClick={() => setTextScale((value) => Math.max(100, value - 5))} className="motion-enabled min-h-11 min-w-11 border px-3 font-semibold" style={{ borderColor: "var(--line)", background: "var(--page)" }}>A−</button>
                  <input id="text-scale" aria-label="Text size" type="range" min="100" max="160" step="5" value={textScale} onChange={(event) => setTextScale(Number(event.target.value))} className="w-full" />
                  <button type="button" aria-label="Increase text size" onClick={() => setTextScale((value) => Math.min(160, value + 5))} className="motion-enabled min-h-11 min-w-11 border px-3 font-semibold" style={{ borderColor: "var(--line)", background: "var(--page)" }}>A+</button>
                </div>
                <p className="small mt-2" style={{ color: "var(--muted)" }}>Scales interface text from 100% to 160%.</p>
              </div>
              <div>
                <label className="label mb-3 block" htmlFor="interface-intensity" style={{ color: "var(--muted)" }}>Interface intensity · {intensity}%</label>
                <input id="interface-intensity" type="range" min="0" max="100" step="1" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} className="w-full" />
                <p className="small mt-2" style={{ color: "var(--muted)" }}>Adjusts accent emphasis in this mockup only.</p>
              </div>
            </div>
            <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--line)" }}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} />
                <span className="font-semibold">Reduced motion</span>
                <span className="small ml-auto" style={{ color: "var(--muted)" }}>{reducedMotion ? "On by default" : "Off"}</span>
              </label>
              <p className="small ml-8" style={{ color: "var(--muted)" }}>When off, only subtle interface transitions are allowed. System reduced-motion preferences always take precedence.</p>
            </div>
          </div>

          <div className="motion-enabled border p-5 sm:p-7" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
            <p className="label mb-1" style={{ color: "var(--muted)" }}>04 / Vision &amp; palette</p>
            <h2 className="section-title font-semibold">Choose a vision mode or colorway</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2" role="group" aria-label="Vision modes and colorways">
              {appearanceOptions.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={appearanceMode === mode.id}
                  onClick={() => setAppearanceMode(mode.id)}
                  className={`motion-enabled min-h-[100px] border p-3 text-left ${mode.kind === "colorway" ? "sm:col-span-2" : ""}`}
                  style={{
                    borderColor: appearanceMode === mode.id ? "var(--accent)" : "var(--line)",
                    borderWidth: appearanceMode === mode.id ? 2 : 1,
                    background: appearanceMode === mode.id ? "var(--accent-soft)" : "var(--page)",
                    color: "var(--ink)",
                  }}
                >
                  <span className="label block">{mode.label}</span>
                  <span className="small mt-2 block" style={{ color: "var(--muted)" }}>{mode.description}</span>
                  <span className="small mt-2 block font-semibold">
                    {appearanceMode === mode.id ? "Selected" : mode.kind === "colorway" ? "Select colorway" : "Select mode"}
                  </span>
                </button>
              ))}
            </div>
            <p className="small mt-5" style={{ color: "var(--muted)" }}>
              Switching palettes preserves the page layout and scroll position. The C64 colorway is decorative, not one of the four ocular modes. Automatic strain-based switching is unavailable because no trusted strain signal is connected.
            </p>
            <div className="mt-5 border-l-4 px-4 py-3 small" style={{ borderColor: "var(--warn)", background: "var(--warn-soft)" }}>
              The four ocular modes are visual-comfort options, not medical or retinal-safety guarantees. C64 is decorative only; display brightness remains under your device's control.
            </div>
          </div>
        </section>

        <footer className="mt-8 flex flex-col gap-3 border-t py-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          <p className="small">Archon HUD · Visual prototype · No model connection</p>
          <p className="mono small">Human judgment stays in the loop.</p>
        </footer>
      </div>
    </main>
  );
}
