// Reliat — App shell.
// Left rail, top bar, surface router, ⌘K palette, ⌘J drawer, global keyboard.

function App() {
  const [surface, setSurface] = uState('pulse');
  const [railCollapsed, setRail] = uState(false);
  const [paletteOpen, setPaletteOpen] = uState(false);
  const [agentOpen, setAgentOpen] = uState(false);
  const [agentScope, setAgentScope] = uState(null);
  const [pendingChannel, setPendingChannel] = uState(null);
  const [pendingOutlier, setPendingOutlier] = uState(null);
  const [showHelp, setShowHelp] = uState(false);
  const goPrefix = uRef(0);
  const goExpire = uRef(null);

  // — global keyboard
  uEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA';

      // ⌘K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      // ⌘J — agent drawer
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setAgentOpen(v => !v);
        return;
      }
      // ? — help
      if (!inField && e.key === '?') {
        e.preventDefault();
        setShowHelp(true);
        return;
      }
      // [ / ] rail
      if (!inField && (e.key === '[' || e.key === ']')) {
        e.preventDefault(); setRail(v => !v); return;
      }
      // G then P/C/O/A/L/N
      if (!inField && !e.metaKey && !e.ctrlKey) {
        if (e.key === 'g' || e.key === 'G') {
          goPrefix.current = 1;
          if (goExpire.current) clearTimeout(goExpire.current);
          goExpire.current = setTimeout(() => { goPrefix.current = 0; }, 800);
          return;
        }
        if (goPrefix.current === 1) {
          const map = { p: 'pulse', c: 'channels', o: 'outliers', a: 'agent', l: 'library', n: 'notes' };
          const next = map[e.key.toLowerCase()];
          if (next) {
            e.preventDefault();
            setSurface(next);
            goPrefix.current = 0;
            return;
          }
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function navigate(next, extra) {
    setSurface(next);
    if (next === 'channels' && extra?.channelId) setPendingChannel(extra.channelId);
    if (next === 'outliers' && extra?.outlierId) setPendingOutlier(extra.outlierId);
  }
  function openChannel(c) { setPendingChannel(c.id); setSurface('channels'); }
  function openOutlier(o) { setPendingOutlier(o.id); setSurface('outliers'); }
  function askAgent(scope) {
    setAgentScope(scope);
    setAgentOpen(true);
  }

  const surfaces = [
    { id: 'pulse',    label: 'Pulse',     icon: 'pulse',    short: '⌘1' },
    { id: 'channels', label: 'Channels',  icon: 'belt',     short: '⌘2' },
    { id: 'outliers', label: 'Outliers',  icon: 'inbox',    short: '⌘3' },
    { id: 'agent',    label: 'Agent',     icon: 'sparkle',  short: '⌘4' },
    { id: 'library',  label: 'Library',   icon: 'book',     short: '⌘5' },
  ];

  const currentSurface = surfaces.find(s => s.id === surface);
  // breadcrumb
  let bcSecondary = null;
  if (surface === 'channels' && pendingChannel) {
    const c = window.ReliatData.CHANNELS.find(x => x.id === pendingChannel);
    if (c) bcSecondary = c.name;
  }
  if (surface === 'outliers' && pendingOutlier) {
    bcSecondary = pendingOutlier;
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${railCollapsed ? 'var(--rail-w-collapsed)' : 'var(--rail-w)'} 1fr`,
      height: '100vh', overflow: 'hidden',
    }}>

      {/* — Left rail — */}
      <nav style={{
        background: 'var(--surface-1)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        transition: 'all var(--t-med) var(--ease)',
      }}>
        {/* Logo + collapse */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: railCollapsed ? 'center' : 'space-between',
          padding: railCollapsed ? '14px 0' : '14px 14px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, var(--accent) 0%, #2D6F7A 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#062028', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 13,
            }}>R</div>
            {!railCollapsed && (
              <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Reliat</span>
            )}
          </div>
          {!railCollapsed && (
            <Tooltip label="Collapse rail · [">
              <button onClick={() => setRail(true)} style={{ color: 'var(--text-3)', display: 'flex' }}>
                <Icon name="collapse-rail" size={14} />
              </button>
            </Tooltip>
          )}
        </div>

        {/* expanded — open palette CTA */}
        <div style={{ padding: railCollapsed ? '8px 6px' : '10px 10px' }}>
          <button onClick={() => setPaletteOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: railCollapsed ? '6px 0' : '7px 10px',
            justifyContent: railCollapsed ? 'center' : 'flex-start',
            background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-sm)', fontSize: 12.5, color: 'var(--text-3)',
            cursor: 'pointer',
            transition: 'all var(--t-instant)',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-3)'; }}
          >
            <Icon name="search" size={14} />
            {!railCollapsed && <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to…</span>}
            {!railCollapsed && <span style={{ display: 'flex', gap: 2 }}><span className="kbd">⌘</span><span className="kbd">K</span></span>}
          </button>
        </div>

        {/* Surface buttons */}
        <div style={{ padding: railCollapsed ? '0 6px' : '0 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {surfaces.map(s => {
            const active = surface === s.id;
            return (
              <Tooltip key={s.id} label={railCollapsed ? `${s.label} · ${s.short}` : ''}>
                <button onClick={() => navigate(s.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: railCollapsed ? '8px 0' : '8px 10px',
                  justifyContent: railCollapsed ? 'center' : 'flex-start',
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  color: active ? 'var(--accent-bright)' : 'var(--text-2)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 13, fontWeight: 500, width: '100%',
                  borderLeft: !railCollapsed && active ? '2px solid var(--accent)' : '2px solid transparent',
                  paddingLeft: !railCollapsed ? 8 : undefined,
                  transition: 'background var(--t-instant), color var(--t-instant)',
                }}
                  onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-1)'; }}}
                  onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}}
                >
                  <Icon name={s.icon} size={16} />
                  {!railCollapsed && (
                    <>
                      <span style={{ flex: 1, textAlign: 'left' }}>{s.label}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{s.short}</span>
                    </>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {/* spacer + design notes link */}
        <div style={{ flex: 1 }} />
        <div style={{ padding: railCollapsed ? '8px 6px 12px' : '10px 10px 14px', borderTop: '1px solid var(--border)' }}>
          <button onClick={() => navigate('notes')} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: railCollapsed ? '8px 0' : '8px 10px',
            width: '100%', justifyContent: railCollapsed ? 'center' : 'flex-start',
            background: surface === 'notes' ? 'var(--accent-dim)' : 'transparent',
            color: surface === 'notes' ? 'var(--accent-bright)' : 'var(--text-3)',
            borderRadius: 'var(--r-sm)', fontSize: 12.5,
            transition: 'all var(--t-instant)',
          }}
            onMouseEnter={(e) => { if (surface !== 'notes') { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-1)'; }}}
            onMouseLeave={(e) => { if (surface !== 'notes') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}}
          >
            <Icon name="book" size={14} />
            {!railCollapsed && <span style={{ flex: 1, textAlign: 'left' }}>Design notes</span>}
            {!railCollapsed && <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>G N</span>}
          </button>
          {railCollapsed && (
            <Tooltip label="Expand rail · ]">
              <button onClick={() => setRail(false)} style={{
                marginTop: 6, padding: '6px 0', width: '100%',
                display: 'flex', justifyContent: 'center', color: 'var(--text-3)',
              }}>
                <Icon name="expand-rail" size={14} />
              </button>
            </Tooltip>
          )}
        </div>
      </nav>

      {/* — Main column — */}
      <main style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* — Top bar — */}
        <header style={{
          height: 'var(--topbar-h)', minHeight: 'var(--topbar-h)',
          display: 'flex', alignItems: 'center',
          padding: '0 16px',
          background: 'var(--surface-0)',
          borderBottom: '1px solid var(--border)',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="mine" size={16} />
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>Karingal Pit · West</span>
            <span style={{ color: 'var(--text-4)' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{currentSurface?.label || 'Design notes'}</span>
            {bcSecondary && (
              <>
                <span style={{ color: 'var(--text-4)' }}>/</span>
                <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{bcSecondary}</span>
              </>
            )}
          </div>

          <span style={{ flex: 1 }} />

          {/* view-scoped quick actions per surface */}
          {surface === 'pulse' && (
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              ● live · last ingest 00:11
            </span>
          )}

          <Button size="sm" variant="ghost" leftIcon="bell">
            <span className="mono">2</span>
          </Button>
          <Button size="sm" variant={agentOpen ? 'primary' : 'secondary'} leftIcon="sparkle" onClick={() => setAgentOpen(v => !v)} title="Toggle agent drawer (⌘J)">
            Agent
            <span style={{ marginLeft: 4, display: 'flex', gap: 2 }}>
              <span className="kbd">⌘</span><span className="kbd">J</span>
            </span>
          </Button>
          <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <button title="Account" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px 4px 4px',
            borderRadius: 'var(--r-pill)', border: '1px solid var(--border-strong)',
          }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent-bright)', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>YO</span>
            <span style={{ fontSize: 12 }}>You</span>
            <Icon name="chevdown" size={12} />
          </button>
        </header>

        {/* — Surface content — */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface-0)' }}>
          {surface === 'pulse' && (
            <PulseScreen
              onOpenOutlier={openOutlier}
              onOpenChannel={openChannel}
              onAskAgent={askAgent}
            />
          )}
          {surface === 'channels' && (
            <ChannelsScreen
              initialChannelId={pendingChannel}
              onOpenOutlier={openOutlier}
              onAskAgent={askAgent}
            />
          )}
          {surface === 'outliers' && (
            <OutliersScreen
              initialOutlierId={pendingOutlier}
              onOpenChannel={openChannel}
              onAskAgent={askAgent}
            />
          )}
          {surface === 'agent' && (
            <AgentScreen
              mode="full"
              scope={agentScope}
              onOpenOutlier={openOutlier}
              onOpenChannel={openChannel}
            />
          )}
          {surface === 'library' && <LibraryScreen />}
          {surface === 'notes' && <NotesScreen />}
        </div>
      </main>

      {/* — Agent drawer (overlay) — */}
      <Drawer open={agentOpen} onClose={() => setAgentOpen(false)} width="45%">
        <AgentScreen mode="drawer" scope={agentScope} onClose={() => setAgentOpen(false)}
          onOpenOutlier={(o) => { openOutlier(o); }}
          onOpenChannel={(c) => { openChannel(c); }}
        />
      </Drawer>

      {/* — Command palette — */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onRun={(item) => {
          if (item.surface === 'channels' && item.channelId) {
            setPendingChannel(item.channelId); setSurface('channels');
          } else if (item.surface === 'outliers' && item.outlierId) {
            setPendingOutlier(item.outlierId); setSurface('outliers');
          } else if (item.surface) {
            setSurface(item.surface);
          } else if (item.id === 'agent.toggle') {
            setAgentOpen(v => !v);
          } else if (item.id === 'kbd.help') {
            setShowHelp(true);
          }
        }}
      />

      {/* — Help cheatsheet — */}
      {showHelp && <HelpCheatsheet onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function HelpCheatsheet({ onClose }) {
  const groups = [
    { name: 'Global', items: [['⌘ K', 'Command palette'], ['⌘ J', 'Toggle agent drawer'], ['?', 'This cheatsheet'], ['Esc', 'Close any overlay']] },
    { name: 'Navigate', items: [['G P', 'Pulse'], ['G C', 'Channels'], ['G O', 'Outliers'], ['G A', 'Agent'], ['G L', 'Library'], ['G N', 'Design notes']] },
    { name: 'Lists', items: [['J / K', 'Next / prev'], ['Enter', 'Open / expand'], ['X', 'Toggle select'], ['⇧ click', 'Range select']] },
    { name: 'Outliers', items: [['E', 'Acknowledge'], ['R', 'Resolve'], ['A', 'Assign'], ['D', 'Dismiss']] },
    { name: 'Layout', items: [['[ ]', 'Collapse / expand rail'], ['\\', 'Toggle right rail']] },
  ];
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(5,7,10,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 250,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(720px, 90vw)',
        background: 'var(--glass-bg-2)', backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border)', borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-modal)', padding: '20px 24px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Keyboard shortcuts</h2>
          <button onClick={onClose} style={{ color: 'var(--text-3)', display: 'flex' }}><Icon name="x" size={16}/></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
          {groups.map(g => (
            <div key={g.name}>
              <h3 style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, margin: '0 0 8px' }}>{g.name}</h3>
              {g.items.map(([k, l], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 12.5 }}>
                  <span style={{ display: 'flex', gap: 3, width: 80 }}>
                    {k.split(' ').map((t, j) => <span key={j} className="kbd">{t}</span>)}
                  </span>
                  <span style={{ color: 'var(--text-2)' }}>{l}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
