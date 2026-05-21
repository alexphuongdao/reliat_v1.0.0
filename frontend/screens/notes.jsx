// Reliat — Design Notes.
// Deliverables 1, 2, 3, 5, 7, 8, 9, 10 from the brief. (4 and 6 are demonstrated as the prototype.)

function NotesScreen() {
  const [section, setSection] = uState('rationale');
  const sections = [
    { id: 'rationale', label: '1 · Design rationale' },
    { id: 'tokens',    label: '2 · Design tokens' },
    { id: 'ia',        label: '3 · Information architecture' },
    { id: 'specs',     label: '4 · Screen specs (ASCII)' },
    { id: 'inventory', label: '5 · Component inventory' },
    { id: 'signature', label: '6 · Signature components' },
    { id: 'keyboard',  label: '7 · Keyboard & interaction map' },
    { id: 'a11y',      label: '8 · Accessibility checklist' },
    { id: 'open',      label: '9 · Open questions' },
    { id: 'scope',     label: '10 · Out of v1.0.0' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100%', overflow: 'hidden' }}>
      <aside style={{
        borderRight: '1px solid var(--border)', background: 'var(--surface-1)',
        padding: '20px 12px', overflow: 'auto',
      }}>
        <h2 style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, margin: '0 0 10px 6px' }}>Design notes</h2>
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 10px', borderRadius: 'var(--r-sm)',
              background: section === s.id ? 'var(--accent-dim)' : 'transparent',
              color: section === s.id ? 'var(--accent-bright)' : 'var(--text-1)',
              fontSize: 12.5, marginBottom: 2,
            }}
            onMouseEnter={(e) => { if (section !== s.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={(e) => { if (section !== s.id) e.currentTarget.style.background = 'transparent'; }}
          >{s.label}</button>
        ))}
        <div style={{ padding: '14px 8px', marginTop: 12, fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5, borderTop: '1px solid var(--border)' }}>
          The prototype itself is the screen-by-screen spec. This document carries the rationale, tokens, and the things you can't see by clicking.
        </div>
      </aside>
      <div style={{ overflow: 'auto', padding: '32px 48px 64px' }}>
        <div style={{ maxWidth: 820, fontSize: 14, lineHeight: 1.7, color: 'var(--text-2)' }}>
          {section === 'rationale' && <Rationale />}
          {section === 'tokens' && <Tokens />}
          {section === 'ia' && <IA />}
          {section === 'specs' && <Specs />}
          {section === 'inventory' && <Inventory />}
          {section === 'signature' && <Signature />}
          {section === 'keyboard' && <Keyboard />}
          {section === 'a11y' && <A11y />}
          {section === 'open' && <OpenQuestions />}
          {section === 'scope' && <Scope />}
        </div>
      </div>
    </div>
  );
}

const noteStyles = {
  h1: { fontSize: 24, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 6px', letterSpacing: '-0.01em' },
  lede: { fontSize: 14.5, color: 'var(--text-3)', margin: '0 0 28px', lineHeight: 1.55 },
  h2: { fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: '28px 0 10px' },
  h3: { fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '20px 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  p: { margin: '0 0 12px', textWrap: 'pretty' },
  code: { fontFamily: 'var(--font-mono)', background: 'var(--surface-inset)', border: '1px solid var(--border)', padding: '12px 14px', borderRadius: 'var(--r-sm)', fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap', color: 'var(--text-2)' },
  inline: { fontFamily: 'var(--font-mono)', fontSize: 12.5, background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 3, color: 'var(--text-1)' },
  strong: { color: 'var(--text-1)', fontWeight: 600 },
};

function Rationale() {
  return (
    <div>
      <h1 style={noteStyles.h1}>Design rationale</h1>
      <p style={noteStyles.lede}>Five opinionated calls that shape everything else. Where I disagree with the brief, I say so.</p>

      <h2 style={noteStyles.h2}>1. Outliers are the product. Everything else is supporting cast.</h2>
      <p style={noteStyles.p}>
        Most "alerts dashboard" attempts give equal real estate to overview, trends, and alerts.
        I rejected that. On Pulse, <em style={noteStyles.strong}>the outliers list occupies two-thirds of the main grid</em> and channel vitals get one-third —
        the inverse of what a chart-first dashboard would do. Charts are easy to design and hard to act on.
        Plant managers do not need to see a beautiful line; they need to see what is wrong, ranked, with the next action attached.
      </p>

      <h2 style={noteStyles.h2}>2. The color strip is the wedge. Build the rest of the product to deserve it.</h2>
      <p style={noteStyles.p}>
        Average belt-material color over time, painted as a literal horizontal band, is something Datadog/Grafana cannot show
        without writing it themselves. It is immediately legible to someone with zero data training and a 20-year career on conveyors.
        It earns the page even when nothing is wrong, because material transitions are the single most
        common "I had a feeling" moment a plant manager has. We surface it on Channels and we should consider a thin
        always-on strip in the Pulse vitals rail in 1.1.
      </p>

      <h2 style={noteStyles.h2}>3. Outliers as Linear-style inbox, not "Alerts."</h2>
      <p style={noteStyles.p}>
        Calling something an "alerts table" predicts a certain shape: rows you mostly ignore until red, low information density,
        slow triage. I built the Outliers surface as an <em style={noteStyles.strong}>inbox</em>: virtualized, keyboard-driven,
        inline-expanding rows, bulk select, AI explanation + similar past events + raw row + suggested action all in one
        unfolded card. The mental model is "I work my outliers like email," not "I glance at a dashboard."
      </p>

      <h2 style={noteStyles.h2}>4. The agent shows its work — but never by default.</h2>
      <p style={noteStyles.p}>
        Two audiences. Plant manager: needs the answer, fast, no JSON. Auditor / skeptic: must be able to verify.
        I serve both with one move: every agent turn has three regions, but only <em style={noteStyles.strong}>Answer</em> and
        <em style={noteStyles.strong}> Follow-ups</em> render by default. Evidence collapses but is never hidden — one click,
        and the tool calls, queries, and confidence numbers are visible in mono. No "AI bubble" avatar. The agent is a tool, not a friend.
      </p>

      <h2 style={noteStyles.h2}>5. Where I push back on the brief.</h2>
      <p style={noteStyles.p}>
        <em style={noteStyles.strong}>"5–30 channels visible/selectable" is too wide a range</em> to design for a single layout.
        I designed the Channel Vitals rail and the Compare overlay around <em style={noteStyles.strong}>12 channels as the comfortable upper bound</em>;
        past 16 we should virtualize the rail or introduce a "saved channel group" abstraction. Don't ship the 30-channel case until we've decided which.
      </p>
      <p style={noteStyles.p}>
        <em style={noteStyles.strong}>"Color is never the only carrier of meaning" — I went further</em>: severity colors have paired shapes
        (dot/triangle/square) plus labels on every list view, not just on hover. The cost is small; the win is real for
        red-green deficiency and for the not-uncommon case of a manager projecting the screen onto a washed-out conference monitor.
      </p>
      <p style={noteStyles.p}>
        <em style={noteStyles.strong}>The brief asks for "ASCII wireframes." I produced them where they help</em> (the Specs tab),
        but the prototype is the truer spec. Wireframes drift; a clickable shell does not.
      </p>
    </div>
  );
}

function Tokens() {
  return (
    <div>
      <h1 style={noteStyles.h1}>Design tokens</h1>
      <p style={noteStyles.lede}>Concrete values. Live in <span style={noteStyles.inline}>tokens.css</span> in this prototype; should be a JSON or CSS package for engineering.</p>

      <h2 style={noteStyles.h2}>Surface (dark, primary)</h2>
      <TokenSwatch tokens={[
        { name: '--surface-0', value: '#0B0D10', note: 'page bg' },
        { name: '--surface-1', value: '#14171C', note: 'panels' },
        { name: '--surface-2', value: '#1B1F26', note: 'elevated panels' },
        { name: '--surface-3', value: '#232832', note: 'top-most / hover' },
        { name: '--surface-inset', value: '#0E1116', note: 'inset / wells' },
      ]} />

      <h2 style={noteStyles.h2}>Borders & text</h2>
      <pre style={noteStyles.code}>{`--border:        rgba(255,255,255, 0.065)
--border-strong: rgba(255,255,255, 0.105)
--border-bright: rgba(255,255,255, 0.180)

--text-1: #ECEFF4   /* primary  */
--text-2: #BCC4D2   /* secondary */
--text-3: #8A93A1   /* muted    */
--text-4: #5E6776   /* dim / disabled */`}</pre>

      <h2 style={noteStyles.h2}>Accent (teal — distinct from semantic blue)</h2>
      <TokenSwatch tokens={[
        { name: '--accent',        value: '#4ABFCF' },
        { name: '--accent-bright', value: '#74D6E2' },
        { name: '--accent-dim',    value: 'rgba(74,191,207,0.14)', note: 'fill for active states' },
      ]} />

      <h2 style={noteStyles.h2}>Semantic outlier palette (reserved — never decorative)</h2>
      <TokenSwatch tokens={[
        { name: '--sev-info',  value: '#5B8FFF', note: '● dot · "info"' },
        { name: '--sev-warn',  value: '#F0A848', note: '▲ triangle · "warning"' },
        { name: '--sev-crit',  value: '#F26E6E', note: '■ square · "critical"' },
      ]} />

      <h2 style={noteStyles.h2}>Channel categorical (8 visible, 4 reserve · colorblind-aware)</h2>
      <TokenSwatch grid tokens={[
        { name: '--ch-1', value: '#6FB1FC' }, { name: '--ch-2', value: '#C390E6' },
        { name: '--ch-3', value: '#FFB58A' }, { name: '--ch-4', value: '#76D9B6' },
        { name: '--ch-5', value: '#E0A0CA' }, { name: '--ch-6', value: '#F0C964' },
        { name: '--ch-7', value: '#8BA2DB' }, { name: '--ch-8', value: '#B0D38A' },
        { name: '--ch-9', value: '#E89BB0' }, { name: '--ch-10', value: '#9EE0DE' },
        { name: '--ch-11', value: '#D9B380' }, { name: '--ch-12', value: '#B6B6CC' },
      ]} />

      <h2 style={noteStyles.h2}>Typography</h2>
      <pre style={noteStyles.code}>{`font-sans: Geist, Inter, system-ui            /* commit to ONE */
font-mono: Geist Mono, JetBrains Mono         /* mono for nums/IDs/agent traces */

scale (~6 sizes, no 14-level hierarchy):
  --fs-micro  10.5px   /* axes, timestamps in dense rows */
  --fs-xs     11.5px   /* pills, kbd, meta */
  --fs-sm     12.5px   /* dense body, table rows */
  --fs-md     13.5px   /* default body */
  --fs-lg     15px     /* agent answer body */
  --fs-xl     20px     /* screen titles */
  --fs-xxl    28px     /* KPI numerals */

weights: 400 / 500 / 600 (no 700)
feature-settings: "tnum","lnum","ss01","cv11"  /* tabular nums EVERYWHERE a number appears */`}</pre>

      <h2 style={noteStyles.h2}>Radius, spacing, motion</h2>
      <pre style={noteStyles.code}>{`radius:  6  (inputs, small) · 10 (panels) · 14 (floating glass) · pill
spacing: base 4 · scale 4, 8, 12, 16, 20, 24, 32, 48
motion:  --t-instant 80ms · --t-fast 140ms · --t-med 220ms
         ease cubic-bezier(0.2, 0.6, 0.2, 1)
         all chart + panel motion respects prefers-reduced-motion`}</pre>

      <h2 style={noteStyles.h2}>Glass (overlays only)</h2>
      <pre style={noteStyles.code}>{`--glass-bg:     rgba(20,23,28, 0.72)
--glass-bg-2:   rgba(27,31,38, 0.78)
--glass-border: rgba(255,255,255, 0.10)
--glass-blur:   blur(18px) saturate(140%)

USE ON: command palette, agent drawer, modal sheets, hover detail cards.
DO NOT USE ON: page surfaces, panels, tables, header bars.`}</pre>
    </div>
  );
}

function TokenSwatch({ tokens, grid }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: grid ? 'repeat(2, 1fr)' : '1fr',
      gap: 6, marginBottom: 12,
    }}>
      {tokens.map(t => (
        <div key={t.name} style={{
          display: 'grid', gridTemplateColumns: '28px 180px 130px 1fr', gap: 10,
          alignItems: 'center', padding: '6px 8px',
          background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
        }}>
          <span style={{ width: 22, height: 22, borderRadius: 4, background: t.value, border: '1px solid rgba(255,255,255,0.1)' }} />
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-1)' }}>{t.name}</span>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t.value}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t.note || ''}</span>
        </div>
      ))}
    </div>
  );
}

function IA() {
  return (
    <div>
      <h1 style={noteStyles.h1}>Information architecture</h1>
      <p style={noteStyles.lede}>Five top-level surfaces. The agent drawer is a sixth overlay that any surface can summon.</p>

      <pre style={noteStyles.code}>{`Reliat
│
├── Pulse        ⌘+1 / G P   landing · what to care about right now
│     └── Outliers Right Now (10) · Channel Vitals · Shift Summary
│
├── Channels     ⌘+2 / G C   per-channel forensics
│     └── Time series · PSD snapshot · Color strip · Outlier history
│
├── Outliers     ⌘+3 / G O   the inbox · triage queue
│     └── Filter bar · virtualized table · expandable rows · right rail (stats)
│
├── Agent        ⌘+4 / G A   conversation surface (also: drawer everywhere)
│     └── Threads rail · Turn (Answer + Evidence + Follow-ups) · Composer
│
├── Library      ⌘+5 / G L   uploads · channels config · users · prefs
│
└── Design Notes G N         this document (this prototype's seventh surface)

──── overlays ────
⌘K   Command palette — primary navigation for power users
⌘J   Agent drawer  — slides over any surface, carries context
?    Keyboard shortcut cheatsheet`}</pre>

      <h2 style={noteStyles.h2}>Navigation model</h2>
      <p style={noteStyles.p}>
        <strong style={noteStyles.strong}>Left rail</strong> is the visual anchor (240/56px, collapse persisted per user).
        <strong style={noteStyles.strong}> Top bar</strong> is breadcrumb + view-scoped controls + agent toggle + user.
        No global search bar — it would compete with ⌘K, and ⌘K is strictly better.
      </p>
      <p style={noteStyles.p}>
        <strong style={noteStyles.strong}>The agent drawer carries context</strong>: opening it from Channels pre-scopes
        the agent to that channel and that time range. Opening it from a single outlier row pre-scopes it to that outlier ID.
        Scope is shown as a chip in the composer and can be cleared in one click.
      </p>

      <h2 style={noteStyles.h2}>Drawer overlay</h2>
      <pre style={noteStyles.code}>{`Any surface ─────────────────────────────────────────────────┐
                                            ⌘J         scrim │
                                         ──────────►   45%   │
                                                       glass │
                                                       drawer│
                                                             │
└────────────────────────────────────────────────────────────┘
- Slides in from right · transform translateX(0) · 220ms
- Esc dismisses · scrim click dismisses
- "Open in full page" promotes drawer thread to /agent`}</pre>
    </div>
  );
}

function Specs() {
  return (
    <div>
      <h1 style={noteStyles.h1}>Screen specs · ASCII wireframes</h1>
      <p style={noteStyles.lede}>The clickable prototype is the canonical spec for layout and interaction. These are here as compact references during engineering kickoff.</p>

      <h2 style={noteStyles.h2}>Pulse · 1440px</h2>
      <pre style={noteStyles.code}>{`┌──────────────────────────────────────────────────────────────────────────────┐
│ STATUS:  live 11/12 │ w/ outliers 6 │ crit 2 │ warn 5 │ ingest 11s │ A · 4h12m │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OUTLIERS RIGHT NOW                                  │  CHANNEL VITALS       │
│  ────────────────                                    │  ───────────────       │
│  ■ CV09 ROM      Topsize spike     +3.6σ  02:47 ▁▂▃▆ │  ● CV42 Tunnel  ▁▂▃▂   │
│    "F80 jumped 3.6σ over the rolling …"   [Ack][Ask] │  ● CV18 Mill Feed ▁▃   │
│  ▲ CV66 Screen   Sieve drift   +2.1σ  02:33 ▁▁▂▃▂   │  ● CV07 Stockpile ▁▂   │
│  ● CV51 Reclaim  Color shift   +1.6σ  02:18 ▁▂▁▁▁   │  ▲ CV33 Crusher  ▂▃▃   │
│  …7 more rows…                                       │  ● CV51 Reclaim  ▂▂   │
│                                                      │  …                    │
├──────────────────────────────────────────────────────┴───────────────────────┤
│  ✨ SHIFT SUMMARY · 6m ago · agent                          [Regenerate] [↗] │
│  Shift A is 4h 12m in. Throughput tracking 3.1% above the 7-day mean… …      │
└──────────────────────────────────────────────────────────────────────────────┘`}</pre>

      <h2 style={noteStyles.h2}>Channels</h2>
      <pre style={noteStyles.code}>{`● CV42 Tunnel  [Switch ▾]  Primary  ● online       [Compare][Last 24h ▾][Ask agent]
┌─────────────────────────────────────────────────────────────────────────────┐
│ TIME SERIES   y: Topsize ▾   1,440 pts · markers persist                    │
│ ┌──────────────────────────────────────────────────────────────────────┐    │
│ │ 200  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ●─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │    │
│ │       ⌣⌢⌒⌢⌒⌣⌒⌢⌒⌣⌒⌢⌣⌒⌣⌒⌢⌣⌒⌢⌒⌣⌒⌢⌣⌒⌢⌒⌣⌒⌢⌒⌣⌒⌢⌒⌣⌒⌢⌒⌣⌒⌢⌒⌣⌒⌢⌒⌣⌒⌢⌒⌣⌒⌢⌣⌒    │    │
│ │ 100   ────────────●─────────────────────────────────▲─────────────  │    │
│ │       00:00       06:00          12:00        18:00          24:00 │    │
│ └──────────────────────────────────────────────────────────────────────┘    │
├─────────────────────────────────┬───────────────────────────────────────────┤
│ PARTICLE SIZE · SNAPSHOT [Pin]  │ BELT MATERIAL · COLOR OVER TIME           │
│ [Percentile│Sieve passing]      │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░▒▒▒▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓ │
│ F10  •─•─•─•─•─•─•─•─•─• F90    │       ↑ hue deviation from baseline       │
│  ── now      ── 02:18 pinned    │   ▁▁▁▂▃▆█▆▃▂▁▁▁                           │
└─────────────────────────────────┴───────────────────────────────────────────┤
│ OUTLIER HISTORY · CV42 (24 events, all time)                                │
│ ■  02:47  Particle spike  "F80 jumped 3.6σ over the rolling …"   crit  open │
│ ▲  21:14  Color shift     "Average belt hue shifted into a redder…" warn ack│
│ ●  18:33  Fines collapse  "F10 dropped sharply with no corresponding…" info  │
└─────────────────────────────────────────────────────────────────────────────┘`}</pre>

      <h2 style={noteStyles.h2}>Outliers (the inbox)</h2>
      <pre style={noteStyles.code}>{`[severity ▣]  [status ▣]  [channel ▾]  [classification ▾]            384 / 1,247
┌──────────────────────────────────────────────────────────────────────────────┐
│ ☐ ■  OUT-1L  ● CV09 ROM · Topsize    02:47:14   164.81  PSD spike    OPEN    │
│   ↳ EXPANDED — explanation · predicted downstream · 4 similar · raw row · ▭  │
│ ☐ ▲  OUT-1K  ● CV66 Screening · Sieve 02:33:08   38.14   Sieve drift  OPEN    │
│ ☐ ●  OUT-1J  ● CV51 Reclaim · Hue   02:18:51   38.7    Color shift   ACK    │
│ … virtualized, 10k+ rows, j/k navigates, x selects, e ack, r resolve         │
└──────────────────────────────────────────────────────────────────────────────┘`}</pre>

      <h2 style={noteStyles.h2}>Agent (full page)</h2>
      <pre style={noteStyles.code}>{`THREADS         │  ─ You ─────────────────────────────────────────────────
─────────       │   Why did CV42 spike at 02:47?
Today           │
• 02 m ago      │  ─ Agent ─ 31m ago · 4 tool calls ──────────────────────
• 32 m ago ◀    │   CV42 Tunnel's Topsize crossed the upper alarm band at
• 04:18         │   02:47:14 and held there for 4m 12s…
Yesterday       │
…               │   [OUT-1L]  [cv51]
                │
                │   › Evidence · 4 tool calls       (collapsed by default)
                │
                │   ▸ Show the 11 similar past events on CV42.
                │   ▸ What did we do last time CV51 caused this?
                │
                │  ┌─[Scoped: CV42 · Last 24h]──── haiku-4-5 ──────────┐
                │  │ Ask anything…                              [Send] │
                │  └────────────────────────────────────────────────────┘`}</pre>
    </div>
  );
}

function Inventory() {
  const groups = [
    {
      name: 'Foundations',
      rows: [
        { c: 'Tokens',      variants: 'color, surface, text, accent, semantic, channel, type, radius, spacing, motion, glass', states: 'n/a', use: 'tokens.css' },
        { c: 'Iconography', variants: 'Lucide-style line, 1.5 stroke, 16/20', states: 'default · disabled · in active control', use: 'every screen' },
      ],
    },
    {
      name: 'Primitives',
      rows: [
        { c: 'Button',       variants: 'primary · secondary · ghost · danger · sm/md/lg · with icon · icon-only', states: 'default · hover · focus-visible · active · disabled · loading', use: 'Pulse "Ack/Open", Channels "Compare", Outlier bulk actions' },
        { c: 'Input',        variants: 'text · search · number · invalid', states: 'default · focus · disabled · error', use: 'Composer, Filter, Pref forms' },
        { c: 'Select',       variants: 'single · multi · grouped', states: 'closed · open · selected · disabled', use: 'Metric chooser (grouped)' },
        { c: 'Combobox',     variants: 'plain · grouped (Metric chooser is the canonical example)', states: 'closed · open · loading · selected', use: 'Metric chooser, Channel switcher' },
        { c: 'TimeRangePicker', variants: 'preset chips + custom', states: 'open · preset selected · custom range', use: 'Channels top bar, Outliers filter' },
        { c: 'Checkbox',     variants: 'default · indeterminate', states: 'default · checked · disabled · focus', use: 'Outliers bulk select, Compare overlay' },
        { c: 'Toggle',       variants: 'small', states: 'on · off · disabled · focus', use: 'Prefs · density · theme' },
        { c: 'Segmented',    variants: '2- and 3-up', states: 'each segment: default · hover · selected · disabled', use: 'PSD mode, Theme, Density' },
        { c: 'Tooltip',      variants: 'mono / sans body', states: 'closed · open (instant)', use: 'Iconographic controls' },
        { c: 'Popover',      variants: 'menu · form', states: 'closed · open · focus-trapped', use: 'Channel switcher, Compare, Filter chips' },
        { c: 'Dropdown menu',variants: 'plain · grouped · keyboard-first', states: 'closed · open · item hover · item active', use: 'all popover surfaces' },
        { c: 'Tag / Pill',   variants: 'neutral · accent · semantic · mono · sm/md', states: 'default · clickable hover · removable hover', use: 'Scope chip, status, KPI deltas' },
        { c: 'SevGlyph',     variants: 'info dot · warn triangle · crit square (shape-paired)', states: 'default · small (8) / med (10)', use: 'every list, sparkline marker, hover preview' },
        { c: 'SevPill',      variants: 'sm/md', states: 'default', use: 'Pulse rows, Outliers expanded, Channels history' },
        { c: 'StatusPill',   variants: 'open · ack · resolved · dismissed', states: 'default', use: 'Outliers table' },
      ],
    },
    {
      name: 'Composite',
      rows: [
        { c: 'Command palette (⌘K)', variants: 'global · categories (Navigate / Channel / Outlier / Saved view / Help)', states: 'closed · open · empty · loading · selected', use: 'global; first-class nav' },
        { c: 'Data table',           variants: 'virtualized · sortable · filterable · expandable · bulk-select · keyboard-nav', states: 'row default · hover · focused · selected · expanded · empty', use: 'Outliers, Channels outlier history' },
        { c: 'Metric chooser',       variants: 'grouped autocomplete', states: 'closed · open · group hover', use: 'Channels time series y-axis' },
        { c: 'KPI tile',             variants: 'with delta · with unit · without unit', states: 'default · loading shimmer', use: 'Pulse status header' },
        { c: 'Sparkline',            variants: 'with markers · w/o markers · tall/short · with cursor sync', states: 'default · hover · disabled (offline)', use: 'Pulse vitals, Outlier row, Channel switcher' },
        { c: 'TimeSeries chart',     variants: 'multi-series (max 3) · synchronized cursor · persistent outlier markers · brush-to-zoom', states: 'default · hover · marker active · empty range', use: 'Channels primary' },
        { c: 'DistributionChart',    variants: 'percentile · sieve passing · overlay-able · pinned snapshots', states: 'default · pinned · hover', use: 'Channels PSD' },
        { c: 'ColorStrip ★',         variants: 'compact (80px) · full (56–96px) · with hue-deviation track', states: 'default · cursor · click-to-scrub', use: 'Channels signature' },
        { c: 'Outlier row',          variants: 'compact · expanded inline', states: 'default · hover · focused (j/k) · selected · expanded', use: 'Pulse list, Outliers inbox' },
        { c: 'Agent turn',           variants: 'user · agent (Answer + collapsible Evidence + Follow-ups)', states: 'default · streaming · error · evidence open', use: 'Agent surface' },
        { c: 'Slide-over drawer',    variants: 'right · 45% · full-screen on small', states: 'closed · opening · open · closing', use: 'Agent drawer, Outlier detail (future)' },
        { c: 'Empty state',          variants: 'contextual (never just "No data")', states: 'default', use: 'Outliers filter zero-match' },
        { c: 'Toast',                variants: 'info · success · warning · error · with action', states: 'enter · idle · dismissing', use: 'Acknowledge confirmation' },
      ],
    },
    {
      name: 'Layout',
      rows: [
        { c: 'App shell',            variants: 'rail expanded · rail collapsed · drawer open', states: 'transitions handled at the shell, not children', use: 'wraps everything' },
        { c: 'Section header',       variants: 'with sub · with actions', states: 'default', use: 'Library, Notes' },
        { c: 'Split pane',           variants: 'with right rail · without', states: 'rail open · closed', use: 'Outliers' },
      ],
    },
  ];
  return (
    <div>
      <h1 style={noteStyles.h1}>Component inventory</h1>
      <p style={noteStyles.lede}>Every component named by the prototype, with variants, states, and usage. ★ = signature.</p>
      {groups.map(g => (
        <div key={g.name} style={{ marginBottom: 24 }}>
          <h3 style={noteStyles.h3}>{g.name}</h3>
          <div className="panel">
            <div style={{
              display: 'grid', gridTemplateColumns: '180px 1.4fr 1.1fr 1.2fr',
              gap: 10, padding: '8px 12px', fontSize: 10.5,
              color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
              borderBottom: '1px solid var(--border)',
            }}>
              <span>Component</span><span>Variants</span><span>States</span><span>Used in</span>
            </div>
            {g.rows.map((r, i) => (
              <div key={r.c} style={{
                display: 'grid', gridTemplateColumns: '180px 1.4fr 1.1fr 1.2fr',
                gap: 10, padding: '10px 12px', fontSize: 12,
                borderBottom: i === g.rows.length - 1 ? 'none' : '1px solid var(--border)',
                lineHeight: 1.5,
              }}>
                <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{r.c}</span>
                <span style={{ color: 'var(--text-2)' }}>{r.variants}</span>
                <span style={{ color: 'var(--text-2)' }}>{r.states}</span>
                <span style={{ color: 'var(--text-3)' }}>{r.use}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Signature() {
  return (
    <div>
      <h1 style={noteStyles.h1}>Signature components</h1>
      <p style={noteStyles.lede}>The five that make this product distinct. The prototype demonstrates them; here is the precise spec.</p>

      <h2 style={noteStyles.h2}>1 · Outlier row</h2>
      <p style={noteStyles.p}>
        Grid: <span style={noteStyles.inline}>22px sev · 1fr meta · 130px value · 110px time · 56px spark · 72px sev pill · 220px actions</span>.
        Severity is left-most and is a <em style={noteStyles.strong}>shape-paired glyph</em> (dot/triangle/square), not just a color.
        Hover lifts background to surface-2 in 80ms. Click toggles inline expansion — never opens a modal.
      </p>
      <p style={noteStyles.p}>
        <em style={noteStyles.strong}>Expanded row</em>: two columns, 24px gap. Left = AI explanation, predicted downstream effect, similar past
        outliers (vector matches as chips with match score). Right = raw row in mono, dim/light field names, an action cluster, and a
        single agent suggestion called out with a 2px accent left border (the only "delight" border we permit).
      </p>

      <h2 style={noteStyles.h2}>2 · Time-series chart with persistent markers</h2>
      <p style={noteStyles.p}>
        <em style={noteStyles.strong}>Implementation contract for engineering</em>: outlier markers are <em style={noteStyles.strong}>rendered independently of point decimation</em>.
        At a daily zoom, the line is decimated to ~1 sample per pixel column; the marker layer is a separate pass that always renders
        every outlier in the window, with a halo (r=7, 16% opacity) plus a dot (r=4, 1.5px surface-0 border).
      </p>
      <p style={noteStyles.p}>
        Cursor sync: hovering the time series broadcasts an index. The PSD chart, color strip, and any pinned snapshot
        chips listen and update in lock-step. Click on a marker opens that outlier's expanded row in the history table,
        or routes to /outliers with the row expanded if elsewhere.
      </p>

      <h2 style={noteStyles.h2}>3 · Color strip (★ the wedge)</h2>
      <p style={noteStyles.p}>
        Horizontal SVG. The data is the running per-minute HSL average; we paint at most one rect per pixel column. A
        thin "hue-deviation from baseline" track sits below it, height ∝ |Δh|, painted with the same per-bucket color.
        Cursor is a 1px text-1 vertical line with a black halo, synchronized with the time series above.
      </p>
      <p style={noteStyles.p}>
        Design note: <em style={noteStyles.strong}>do not add a hue chart instead</em>. The literal color is the legibility win. Plant managers see
        "the belt went red for ten minutes around 21:00" without parsing a number. This is the moment that earns the product.
      </p>

      <h2 style={noteStyles.h2}>4 · Command palette</h2>
      <p style={noteStyles.p}>
        Glass surface, 14px radius. Categories: Navigate, Channel, Outlier, Saved view, Action, Preference, Help.
        Fuzzy match on label and kind. The bottom-row helper bar shows kbd hints constantly — this is how people learn the palette.
      </p>
      <p style={noteStyles.p}>
        <em style={noteStyles.strong}>Asking the agent is a palette item</em>. If the user has typed &gt;3 characters and nothing matches well,
        the top result becomes <span style={noteStyles.inline}>Ask agent: "&lt;query&gt;"</span>. This is how we make the agent
        ambient without inventing a third nav surface for it.
      </p>

      <h2 style={noteStyles.h2}>5 · Agent turn</h2>
      <p style={noteStyles.p}>
        Three regions per turn: <em style={noteStyles.strong}>Answer</em> (default expanded), <em style={noteStyles.strong}>Evidence</em> (default collapsed),
        <em style={noteStyles.strong}>Follow-ups</em> (default expanded as chips). The user/agent split is a vertical accent line — no avatars.
        Inline references in the answer are <em style={noteStyles.strong}>live objects</em>: chips with mono IDs that open the referenced outlier or channel
        without leaving the conversation.
      </p>
      <p style={noteStyles.p}>
        Streaming is visible but quiet: a small 3-dot pulse in the accent color while reasoning. No per-token typewriter — the
        full sentence appears when ready. Streaming with sentence-grain is the right cadence for a tool, not a chat companion.
      </p>
    </div>
  );
}

function Keyboard() {
  const rows = [
    { k: '⌘ K',          d: 'Open command palette',         g: 'Global' },
    { k: '⌘ J',          d: 'Toggle agent drawer (scoped)', g: 'Global' },
    { k: 'G then P',     d: 'Go to Pulse',                  g: 'Navigate' },
    { k: 'G then C',     d: 'Go to Channels',               g: 'Navigate' },
    { k: 'G then O',     d: 'Go to Outliers',               g: 'Navigate' },
    { k: 'G then A',     d: 'Go to Agent (full page)',      g: 'Navigate' },
    { k: 'G then L',     d: 'Go to Library',                g: 'Navigate' },
    { k: 'G then N',     d: 'Open Design Notes',            g: 'Navigate' },
    { k: 'J / K',        d: 'Next / previous row in any list', g: 'List' },
    { k: 'Enter',        d: 'Open or toggle expand on focused row', g: 'List' },
    { k: 'X',            d: 'Toggle row selection',         g: 'List' },
    { k: 'Shift + click',d: 'Range select between two rows',g: 'List' },
    { k: '⌘ + click',    d: 'Multi-select toggle',          g: 'List' },
    { k: 'E',            d: 'Acknowledge focused outlier(s)', g: 'Outlier' },
    { k: 'R',            d: 'Resolve focused outlier(s)',   g: 'Outlier' },
    { k: 'A',            d: 'Assign…',                      g: 'Outlier' },
    { k: 'Esc',          d: 'Close palette, drawer, or popover; collapse expanded row', g: 'Overlay' },
    { k: '?',            d: 'Show keyboard shortcut cheatsheet',  g: 'Help' },
    { k: '[ / ]',        d: 'Collapse / expand left rail',  g: 'Layout' },
    { k: '\\',           d: 'Toggle Outliers right rail',   g: 'Layout' },
  ];
  return (
    <div>
      <h1 style={noteStyles.h1}>Keyboard & interaction map</h1>
      <p style={noteStyles.lede}>Power users will live here. Every shortcut also appears in the command palette next to its action.</p>
      <div className="panel">
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 110px', gap: 12, padding: '8px 14px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
          <span>Shortcut</span><span>Action</span><span>Group</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 110px', gap: 12, padding: '8px 14px', fontSize: 12.5, borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--border)' }}>
            <span style={{ display: 'flex', gap: 4 }}>
              {r.k.split(' ').map((t, j) => /^[a-z⌘⇧↵]/i.test(t) || t.length <= 3
                ? <span key={j} className="kbd">{t}</span>
                : <span key={j} style={{ color: 'var(--text-3)', fontSize: 11.5, alignSelf: 'center' }}>{t}</span>
              )}
            </span>
            <span style={{ color: 'var(--text-2)' }}>{r.d}</span>
            <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{r.g}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function A11y() {
  const items = [
    { c: 'WCAG 2.2 AA contrast', n: 'All text against its actual surface tested. Severity colors meet contrast on surface-1 and surface-2; never on accent-dim. (Pill backgrounds match severity colors at 16% — the text is the saturated color, contrast verified.)' },
    { c: 'Color is never the only carrier', n: 'Every severity has shape (dot/triangle/square) AND label AND aria-label. Channel categorical colors are paired with channel name on every render (no "decode the legend" moments).' },
    { c: 'Keyboard nav, complete', n: 'Every action reachable. Rail, top bar, palette, drawer, table, expanded row, composer — Tab order is sane and visible.' },
    { c: 'Focus rings, visible', n: '2px accent outline, 2px offset. Suppressed on mouse focus, restored on Tab via :focus-visible.' },
    { c: 'Screen-reader labels', n: 'Every icon-only button has aria-label. Severity glyphs have role="img" and an accessible name. Live regions for streaming agent answers.' },
    { c: 'Reduced motion respected', n: '@media (prefers-reduced-motion: reduce) disables chart animations and drawer transitions. Reflected in tokens.css.' },
    { c: 'Tabular numerals', n: 'font-feature-settings "tnum" + "lnum" applied to every numeric surface so digits align in columns; non-negotiable for tables.' },
    { c: 'Hit targets', n: 'Interactive controls ≥24px tall (28px in default density). The "compact" density still keeps ≥24px hit area even when row visual height drops.' },
    { c: 'Touch targets (laptop hybrid)', n: 'Buttons in the top bar are ≥28×28. The agent send button and palette items are ≥32px. We do not design for fingers as primary input but we don\'t punish them.' },
    { c: 'Error and empty states', n: 'Empty states are contextual ("Last detection was at 02:47 on CV09 ROM") — never just "No data".' },
    { c: 'Localization', n: 'Number formatter respects user locale; comma-decimal display is a preference. Timestamps in user TZ; source data stays UTC.' },
  ];
  return (
    <div>
      <h1 style={noteStyles.h1}>Accessibility checklist</h1>
      <p style={noteStyles.lede}>Not aspirational. Each item is verifiable in the prototype or a one-line code change to land.</p>
      <div className="panel">
        {items.map((it, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 200px 1fr', gap: 12, padding: '12px 14px', borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border)' }}>
            <span style={{ color: 'var(--ch-4)', marginTop: 2 }}><Icon name="check" size={14} /></span>
            <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{it.c}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>{it.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpenQuestions() {
  const qs = [
    {
      q: 'How do we represent an outlier that spans multiple channels?',
      ctx: 'Material transitions on a stockpile reclaim almost always show up on 2–3 channels in sequence. Right now an outlier has one channelId. Two options: (1) compound outliers with multiple channelIds and a primary; (2) link outliers by "event" — sibling pointers. I lean (2) because it preserves channel-level triage. Need 30 min with engineering.',
    },
    {
      q: 'What is the threshold for "critical"?',
      ctx: 'Brief says saturated but not fluorescent. I picked 3σ as the implicit cutoff in the data, but the customer probably wants this configurable per channel per metric. Where does it live in the UI — Library > Channels, or a global "thresholds" surface?',
    },
    {
      q: 'Should the agent drawer be summonable from outside the app?',
      ctx: 'A natural progression is a tray-icon / Slack-style entry point that opens the agent with an outlier link from an email or pager. Out of v1.0.0, but it affects the URL shape we adopt now.',
    },
    {
      q: 'Channel count > 16: virtualize the vitals rail, or introduce groups?',
      ctx: 'I picked 12 as the comfortable visible upper bound. Larger mines will exceed this. "Saved channel groups" is more useful long-term than virtualization — the rail is supposed to be glanceable. Defer the call until we have a 24-channel customer to ask.',
    },
    {
      q: 'When the agent is wrong, where does feedback go?',
      ctx: 'Brief is silent. Suggestion: a per-turn "wrong" / "missed something" affordance that opens a tiny form, attached to the conversation. We need to specify what we do with it (eval set? thumbs to a router model?). Affects whether we ship the button at v1.0.0 or wait.',
    },
    {
      q: 'Is "shift handoff" a screen?',
      ctx: 'The shift summary on Pulse is one paragraph. I think there is a 1.1 surface called "Handoff" that produces a longer artifact — generated automatically at shift change, optionally exported as PDF. Out of v1.0.0 but worth designing the model now so the Pulse summary fits cleanly into it.',
    },
    {
      q: 'CSV ingest UX for 2GB files',
      ctx: 'The Uploads tile is light. A 2GB ingest is a multi-minute process. We need a real progress + parse-preview + rejected-rows triage view. That is its own design pass; the brief intentionally underweights Library, and I followed that. Flag for 1.1.',
    },
    {
      q: 'Light mode — when?',
      ctx: 'I designed the dark mode well. Light is "considered but secondary." I would defer it past 1.0 unless customers ask. A bad light mode would hurt the product more than no light mode.',
    },
  ];
  return (
    <div>
      <h1 style={noteStyles.h1}>Open questions</h1>
      <p style={noteStyles.lede}>What I would normally take to a working session. These are blockers for some design decisions downstream.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {qs.map((it, i) => (
          <div key={i} className="panel" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--accent-bright)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>Q{i + 1}</span>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{it.q}</h3>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, textWrap: 'pretty' }}>{it.ctx}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Scope() {
  const inV = [
    'Pulse, Channels, Outliers, Agent, Library — five surfaces.',
    'One persona: plant_manager.',
    'Dark mode primary; light mode considered, not built.',
    'Desktop-first, 1440–2560. Laptop 1280 supported. Tablet degrades gracefully.',
    'Command palette ⌘K, agent drawer ⌘J — both first-class.',
    'Color strip, persistent outlier markers, inline-expand outlier inbox.',
    'Keyboard navigation across all lists; bulk actions.',
    'WCAG 2.2 AA contrast; shape-paired severity.',
  ];
  const outV = [
    'Mobile. Read-only Pulse summary at <1024px; everything else says "open on desktop."',
    'Multi-tenant org switching. Single tenant only.',
    'Role-based access. plant_manager only; the structure is in Library but not editable.',
    'API keys / webhooks. Placeholder in Library, marked "Coming in 1.1."',
    '"Saved channel groups" abstraction. Defer until a 20+-channel customer asks.',
    'Shift handoff long-form artifact / PDF export.',
    'Light mode polish.',
    'Per-channel threshold editor UI. (Engineering can set in config; UI in 1.1.)',
    'Agent feedback loop (thumbs / eval submission). Decide in 1.1.',
    'Cross-channel "event" linking for outliers. Same as above.',
    'CSV ingest validation triage screen. Light version only in 1.0.',
  ];
  return (
    <div>
      <h1 style={noteStyles.h1}>What's intentionally not in v1.0.0</h1>
      <p style={noteStyles.lede}>Restating the boundaries so we don't drift. Anything below is a 1.1 conversation, not a 1.0 bug.</p>

      <h2 style={noteStyles.h2}>In v1.0.0</h2>
      <ul style={{ paddingLeft: 18, margin: '0 0 18px', color: 'var(--text-2)' }}>
        {inV.map((s, i) => <li key={i} style={{ marginBottom: 5 }}>{s}</li>)}
      </ul>

      <h2 style={noteStyles.h2}>Deferred</h2>
      <ul style={{ paddingLeft: 18, margin: 0, color: 'var(--text-2)' }}>
        {outV.map((s, i) => <li key={i} style={{ marginBottom: 5 }}>{s}</li>)}
      </ul>
    </div>
  );
}

window.NotesScreen = NotesScreen;
