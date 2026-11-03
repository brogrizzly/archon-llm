import { ArrowDownRight, ArrowUpRight, BookOpen, Check, Code2, FileText, Github, LockKeyhole, Menu, X } from 'lucide-react';
import { useState } from 'react';

const repo = 'https://github.com/brogrizzly/archon-llm';
const docs = [
  { number: '01', title: 'Project README', detail: 'Scope, principles & reproducibility', href: `${repo}/blob/main/README.md`, icon: BookOpen },
  { number: '02', title: 'Anchor mathematics', detail: 'The source equation, preserved', href: `${repo}/blob/main/docs/anchor-mathematics.md`, icon: FileText },
  { number: '03', title: 'Math documents', detail: 'Browse the repository docs index', href: `${repo}/tree/main/docs`, icon: FileText },
  { number: '04', title: '4LO math scan', detail: 'A scoped, read-only review', href: `${repo}/blob/main/docs/4lo-math-scan.md`, icon: FileText },
  { number: '05', title: 'Works Cited · MLA 9', detail: 'Sources and attribution', href: `${repo}/blob/main/docs/works-cited.md`, icon: BookOpen },
];

function Mark({ dark = false }: { dark?: boolean }) {
  return (
    <a href="#top" className={`inline-flex items-center gap-3 ${dark ? 'text-[#f3eee1]' : 'text-[#203d34]'}`} aria-label="Archon home" data-testid="link-archon-home">
      <span className="grid h-9 w-9 place-items-center rounded-full border border-current/30 font-code text-[13px]">A</span>
      <span className="text-[17px] font-semibold tracking-[-.04em]">archon<span className="text-[#bf654b]">.</span></span>
    </a>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <div id="top" className="min-h-[100dvh] bg-[#f3efe5] text-[#203d34]">
      <a href="#main" className="sr-only z-50 rounded bg-[#203d34] px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <header className="relative z-20 mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 md:px-12 lg:px-[7.4%]">
        <Mark />
        <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
          <a className="nav-link" href="#approach">Approach</a>
          <a className="nav-link" href="#research">Research</a>
          <a className="nav-link" href="#use-archon">Use Archon</a>
          <a className="inline-flex items-center gap-2 rounded-full bg-[#203d34] px-5 py-3 text-sm font-medium text-[#f3efe5] transition-transform hover:-translate-y-0.5 focus-visible:outline-offset-4" href={`${repo}/blob/main/README.md`} target="_blank" rel="noreferrer" data-testid="link-readme-nav">Read the project <ArrowUpRight size={15} /></a>
        </nav>
        <button type="button" className="grid h-11 w-11 place-items-center rounded-full border border-[#203d34]/20 md:hidden" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} data-testid="button-menu">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        {menuOpen && <nav aria-label="Mobile navigation" className="absolute left-4 right-4 top-[76px] flex flex-col gap-1 rounded-xl border border-[#203d34]/15 bg-[#f8f5ed] p-3 shadow-xl md:hidden">
          {[['Approach', '#approach'], ['Research', '#research'], ['Use Archon', '#use-archon'], ['Project README', `${repo}/blob/main/README.md`]].map(([label, href]) => <a key={label} className="rounded-lg px-4 py-3 text-sm hover:bg-[#203d34]/5" href={href} onClick={closeMenu}>{label}</a>)}
        </nav>}
      </header>

      <main id="main">
        <section className="relative mx-auto max-w-[1440px] overflow-hidden px-5 pb-16 pt-9 md:px-12 md:pb-24 md:pt-14 lg:px-[7.4%]" aria-labelledby="hero-title">
          <div aria-hidden="true" className="pointer-events-none absolute -right-28 top-10 h-[530px] w-[530px] rounded-full border border-[#203d34]/10 md:right-[4%] md:top-14 md:h-[580px] md:w-[580px]">
            <div className="absolute inset-8 rounded-full border border-[#203d34]/10" /><div className="absolute inset-[72px] rounded-full border border-dashed border-[#203d34]/15" />
            <span className="absolute left-[12%] top-[24%] h-2 w-2 rounded-full bg-[#bd674d]" /><span className="absolute bottom-[18%] right-[19%] h-2 w-2 rounded-full bg-[#203d34]" />
          </div>
          <div className="relative grid items-center gap-12 md:grid-cols-[1.1fr_.9fr] md:gap-8">
            <div className="max-w-[720px]">
              <p className="rise-in mb-7 inline-flex items-center gap-2 font-code text-[10px] uppercase tracking-[.2em] text-[#527168]"><span className="h-2 w-2 rounded-full bg-[#bf654b]" /> Open research · Prototype stage</p>
              <h1 id="hero-title" className="rise-in font-editorial text-[clamp(3.5rem,8.4vw,7.7rem)] leading-[.91] tracking-[-.055em]">A model you<br /><em className="font-normal text-[#bf654b]">can inspect.</em></h1>
              <p className="rise-in-delay mt-7 max-w-[490px] text-[17px] leading-[1.75] text-[#52665e] md:text-[19px]">Archon is an open-source language-model project. Its mathematical foundation, Anchor, is documented in the open—alongside what is known, what is proposed, and what is still unresolved.</p>
              <div className="rise-in-delay mt-9 flex flex-wrap gap-3">
                <a href={`${repo}/blob/main/README.md`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 rounded-full bg-[#203d34] px-6 py-4 text-sm font-semibold text-[#f3efe5] transition-transform hover:-translate-y-0.5" data-testid="link-project-readme">Explore the project <ArrowUpRight size={16} /></a>
                <a href="#research" className="inline-flex items-center gap-3 rounded-full border border-[#203d34]/25 px-6 py-4 text-sm font-semibold transition-colors hover:bg-[#203d34]/5" data-testid="link-research">Browse the research <ArrowDownRight size={16} /></a>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[530px] md:mt-5">
              <div className="absolute inset-[12%] rounded-full bg-[#e3ddca]/70 blur-2xl" />
              <img className="relative z-10 mx-auto w-full drop-shadow-[0_18px_30px_rgba(36,54,40,.12)]" src="/images/brand/morgan-logo-transparent.png" alt="Morgan Company artwork: a walking sasquatch carries a wooden sign with a flower and butterfly" />
              <p className="relative z-10 -mt-2 text-center font-code text-[9px] uppercase tracking-[.2em] text-[#6e786b]">The people behind Archon · Morgan</p>
            </div>
          </div>
          <div className="mt-14 grid grid-cols-2 gap-4 border-t border-[#203d34]/15 pt-5 md:mt-20 md:grid-cols-4 md:gap-8">
            {[['01', 'Open by default'], ['02', 'Math in the open'], ['03', 'Evidence over claims'], ['04', 'Human-readable status']].map(([n, label]) => <div className="flex items-baseline gap-3" key={n}><span className="font-code text-[10px] text-[#bf654b]">{n}</span><span className="text-[12px] text-[#52665e] md:text-sm">{label}</span></div>)}
          </div>
        </section>

        <section id="approach" className="scroll-mt-8 bg-[#203d34] text-[#f3efe5]" aria-labelledby="approach-title">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-16 md:grid-cols-[.8fr_1.2fr] md:px-12 md:py-24 lg:px-[7.4%]">
            <div>
              <p className="mb-5 font-code text-[10px] uppercase tracking-[.2em] text-[#d89a71]">01 / The project</p>
              <h2 id="approach-title" className="font-editorial text-5xl leading-[1.02] tracking-[-.04em] md:text-6xl">Make the work<br />legible.</h2>
            </div>
            <div className="max-w-[650px] md:pt-10">
              <p className="text-xl leading-[1.6] text-[#e1e3d7]">Research is easier to trust when the path is visible. Archon keeps the model work, its mathematical assumptions, and its limits close together.</p>
              <p className="mt-6 max-w-[560px] leading-7 text-[#bdc8bb]">Anchor is the name for Archon’s mathematical foundation. Its source formula is preserved as supplied; an executable interpretation is not yet complete. We distinguish the record from the proposal, and both from a result.</p>
              <div className="mt-9 flex items-start gap-4 border-l border-[#d89a71] pl-5">
                <span className="font-code text-xs text-[#d89a71]">NOTE</span>
                <p className="max-w-[460px] text-sm leading-6 text-[#e1e3d7]">A checked parameter count is not a trained model. A training pilot is not a general-purpose language model.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="research" className="scroll-mt-8 mx-auto max-w-[1440px] px-5 py-16 md:px-12 md:py-24 lg:px-[7.4%]" aria-labelledby="research-title">
          <div className="mb-10 flex flex-col justify-between gap-5 md:mb-14 md:flex-row md:items-end">
            <div><p className="mb-4 font-code text-[10px] uppercase tracking-[.2em] text-[#bf654b]">02 / Read the record</p><h2 id="research-title" className="font-editorial text-5xl tracking-[-.045em] md:text-6xl">Start with the source.</h2></div>
            <p className="max-w-[350px] text-sm leading-6 text-[#64746c]">Primary project documents, published openly in the repository. No summaries in place of the evidence.</p>
          </div>
          <div className="border-t border-[#203d34]/20">
            {docs.map(({ number, title, detail, href, icon: Icon }) => <a key={number} href={href} target="_blank" rel="noreferrer" className="group grid grid-cols-[34px_1fr_auto] items-center gap-4 border-b border-[#203d34]/20 py-5 transition-colors hover:bg-[#e9e3d6] md:grid-cols-[60px_1fr_1fr_30px] md:gap-5 md:py-6" data-testid={`link-doc-${number}`}>
              <span className="font-code text-[11px] text-[#bf654b]">{number}</span><span className="font-editorial text-[23px] md:text-[27px]">{title}</span><span className="hidden text-sm text-[#718078] md:block">{detail}</span><span className="grid h-9 w-9 place-items-center rounded-full border border-[#203d34]/20 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1"><Icon className="hidden h-4 w-4 md:block" /><ArrowUpRight className="h-4 w-4 md:hidden" /></span>
            </a>)}
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-[#718078]"><Github size={14} /> Every link opens the source on GitHub in a new tab.</div>
        </section>

        <section className="border-y border-[#203d34]/15 bg-[#e9e4d8]" aria-labelledby="status-title">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-16 md:grid-cols-[.8fr_1.2fr] md:px-12 md:py-20 lg:px-[7.4%]">
            <div><p className="mb-4 font-code text-[10px] uppercase tracking-[.2em] text-[#bf654b]">03 / Where things stand</p><h2 id="status-title" className="font-editorial text-5xl tracking-[-.04em]">No borrowed certainty.</h2><p className="mt-5 max-w-sm text-sm leading-6 text-[#61736b]">The project is early. Here is the current line between experiment and release.</p></div>
            <div className="divide-y divide-[#203d34]/15 border-y border-[#203d34]/15">
              {[
                ['Anchor formula', 'Recorded; execution semantics remain proposed and incomplete.'],
                ['2B architecture', 'Candidate parameter count checked; not approved, initialized, or trained at full scale.'],
                ['Training work', 'A small CPU pilot exists for pipeline reproducibility—not language capability.'],
                ['Public inference', 'No inference-ready public model or inference service is available.'],
              ].map(([label, value]) => <div className="grid gap-2 py-4 sm:grid-cols-[170px_1fr] sm:gap-5" key={label}><span className="text-sm font-semibold">{label}</span><span className="text-sm leading-6 text-[#61736b]">{value}</span></div>)}
            </div>
          </div>
        </section>

        <section id="use-archon" className="scroll-mt-8 mx-auto max-w-[1440px] px-5 py-16 md:px-12 md:py-24 lg:px-[7.4%]" aria-labelledby="use-title">
          <div className="overflow-hidden rounded-[26px] bg-[#d9e0d5]">
            <div className="grid md:grid-cols-[1fr_360px]">
              <div className="px-6 py-9 md:px-12 md:py-14">
                <p className="mb-4 font-code text-[10px] uppercase tracking-[.2em] text-[#bf654b]">04 / Use Archon</p>
                <h2 id="use-title" className="font-editorial text-5xl tracking-[-.045em] md:text-6xl">Not quite ready<br />to answer.</h2>
                <p className="mt-6 max-w-[570px] text-[16px] leading-7 text-[#52665e]">There is no inference-ready public model or service yet. We won’t pretend this page can run a prompt.</p>
                <div className="mt-8 flex max-w-[570px] items-start gap-3 rounded-xl border border-[#203d34]/15 bg-[#f3efe5]/60 p-4" role="status" aria-live="polite" data-testid="status-inference-unavailable">
                  <LockKeyhole className="mt-0.5 shrink-0 text-[#527168]" size={17} />
                  <div><p className="text-sm font-semibold">Inference is unavailable</p><p className="mt-1 text-xs leading-5 text-[#61736b]">This prototype does not accept, transmit, or store prompts. There is no waitlist.</p></div>
                </div>
              </div>
              <div className="relative flex min-h-[240px] flex-col justify-between overflow-hidden bg-[#bf654b] p-6 text-[#f8f3e9] md:min-h-full md:p-8">
                <div aria-hidden="true" className="absolute -right-20 -top-16 h-64 w-64 rounded-full border border-white/25"><div className="absolute inset-7 rounded-full border border-dashed border-white/30" /></div>
                <div className="relative"><Code2 size={22} /><p className="mt-12 font-code text-[10px] uppercase tracking-[.16em] text-white/70">Current release state</p><p className="mt-2 font-editorial text-3xl">Prototype only</p></div>
                <a className="relative mt-9 inline-flex w-fit items-center gap-2 border-b border-white/50 pb-1 text-sm font-medium hover:border-white" href={`${repo}/blob/main/README.md`} target="_blank" rel="noreferrer" data-testid="link-status-readme">Read project status <ArrowUpRight size={14} /></a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#203d34] text-[#f3efe5]">
        <div className="mx-auto max-w-[1440px] px-5 py-10 md:px-12 lg:px-[7.4%]">
          <div className="flex flex-col gap-8 border-b border-white/15 pb-9 md:flex-row md:items-end md:justify-between">
            <div><Mark dark /><p className="mt-4 max-w-[390px] text-sm leading-6 text-[#bdc8bb]">Open work, explicit limits, and a clearer path from mathematics to model.</p></div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#d6ddd2]"><a className="hover:text-white" href={`${repo}/blob/main/README.md`} target="_blank" rel="noreferrer">README</a><a className="hover:text-white" href={`${repo}/blob/main/docs/works-cited.md`} target="_blank" rel="noreferrer">Works Cited</a><a className="hover:text-white" href={`${repo}/blob/main/docs/anchor-mathematics.md`} target="_blank" rel="noreferrer">Anchor math</a><a className="hover:text-white" href={repo} target="_blank" rel="noreferrer">GitHub <ArrowUpRight className="ml-1 inline" size={13} /></a></div>
          </div>
          <div className="flex flex-col gap-2 pt-5 text-[11px] text-[#aebdb1] sm:flex-row sm:items-center sm:justify-between"><span>Archon is an open-source language-model project. Anchor is its mathematical foundation.</span><span className="inline-flex items-center gap-2"><Check size={13} /> No prompt collection. No inference service.</span></div>
          <p className="mt-4 max-w-3xl text-[10px] leading-5 text-[#aebdb1]/75">Morgan artwork is owner-provided brand art for the developers behind Archon; it does not imply a legal entity. Project status is stated as documented, not as a performance or capability claim.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
