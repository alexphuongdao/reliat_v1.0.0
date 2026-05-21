// Reliat — UI primitives.
// Lucide-style line icons drawn inline (stroke 1.5).

const { useState: uState, useEffect: uEffect, useRef: uRef, useMemo: uMemo } = React;

// ——— Icons (1.5 stroke, 16 or 20) ———
function Icon({ name, size = 16 }) {
  const s = size;
  const stroke = 'currentColor';
  const sw = 1.5;
  const common = {
    width: s, height: s, viewBox: '0 0 24 24', fill: 'none',
    stroke, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { flexShrink: 0, display: 'block' },
    'aria-hidden': true,
  };
  switch (name) {
    case 'pulse':    return <svg {...common}><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>;
    case 'layers':   return <svg {...common}><path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/></svg>;
    case 'inbox':    return <svg {...common}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5 5l-3 7v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3-7H5z"/></svg>;
    case 'spark':    return <svg {...common}><path d="M9 18l3-3 3 3 6-7"/><circle cx="9" cy="18" r="1.2" fill={stroke}/><circle cx="15" cy="18" r="1.2" fill={stroke}/></svg>;
    case 'cog':      return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case 'book':     return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
    case 'search':   return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>;
    case 'sparkle':  return <svg {...common}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></svg>;
    case 'message':  return <svg {...common}><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>;
    case 'check':    return <svg {...common}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'x':        return <svg {...common}><path d="M18 6 6 18M6 6l12 12"/></svg>;
    case 'cmd':      return <svg {...common}><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>;
    case 'arrowup':  return <svg {...common}><path d="M12 19V5M5 12l7-7 7 7"/></svg>;
    case 'arrowright':return <svg {...common}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case 'arrowleft':return <svg {...common}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>;
    case 'chevron':  return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>;
    case 'chevdown': return <svg {...common}><path d="m6 9 6 6 6-6"/></svg>;
    case 'circle':   return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
    case 'dot':      return <svg {...common}><circle cx="12" cy="12" r="4" fill={stroke}/></svg>;
    case 'panel-l':  return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>;
    case 'panel-r':  return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>;
    case 'compare':  return <svg {...common}><path d="M3 6h13M3 6l4-4M3 6l4 4M21 18H8M21 18l-4-4M21 18l-4 4"/></svg>;
    case 'zap':      return <svg {...common}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
    case 'history':  return <svg {...common}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>;
    case 'collapse-rail': return <svg {...common}><path d="M14 6l-6 6 6 6"/><path d="M20 4v16"/></svg>;
    case 'expand-rail':   return <svg {...common}><path d="M10 6l6 6-6 6"/><path d="M4 4v16"/></svg>;
    case 'mine':     return <svg {...common}><path d="M2 22h20"/><path d="M4 22V12l4-3 4 3 4-3 4 3v10"/><path d="M8 22v-6h4v6"/></svg>;
    case 'belt':     return <svg {...common}><rect x="2" y="9" width="20" height="6" rx="3"/><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>;
    case 'pin':      return <svg {...common}><path d="M12 17v5"/><path d="M9 10.7V3h6v7.7l3 4.3H6l3-4.3z"/></svg>;
    case 'filter':   return <svg {...common}><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/></svg>;
    case 'plus':     return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'more':     return <svg {...common}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>;
    case 'user':     return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
    case 'send':     return <svg {...common}><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>;
    case 'play':     return <svg {...common}><polygon points="5 3 19 12 5 21 5 3" fill={stroke}/></svg>;
    case 'pause':    return <svg {...common}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
    case 'upload':   return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
    case 'key':      return <svg {...common}><path d="M21 2l-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-3 3"/><path d="m15 8 3 3"/></svg>;
    case 'bell':     return <svg {...common}><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
    default: return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3"/></svg>;
  }
}

// ——— Button ———
function Button({ children, variant = 'secondary', size = 'md', leftIcon, rightIcon, onClick, title, disabled, active, type = 'button', style }) {
  const sizes = {
    sm: { h: 24, px: 8,  fs: 12 },
    md: { h: 28, px: 10, fs: 12.5 },
    lg: { h: 32, px: 12, fs: 13 },
  }[size];
  const variants = {
    primary: { bg: 'var(--accent)', color: '#062028', border: 'transparent', hover: 'var(--accent-bright)' },
    secondary: { bg: 'var(--surface-2)', color: 'var(--text-1)', border: 'var(--border-strong)', hover: 'var(--surface-3)' },
    ghost: { bg: 'transparent', color: 'var(--text-2)', border: 'transparent', hover: 'var(--surface-2)' },
    danger: { bg: 'var(--sev-crit-dim)', color: 'var(--sev-crit)', border: 'var(--sev-crit-dim)', hover: 'rgba(242,110,110,0.26)' },
  }[variant];
  const [h, setH] = uState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: sizes.h, padding: `0 ${sizes.px}px`,
        fontSize: sizes.fs, fontWeight: 'var(--fw-medium)',
        background: active ? 'var(--accent-dim)' : (h ? variants.hover : variants.bg),
        color: active ? 'var(--accent-bright)' : variants.color,
        border: `1px solid ${active ? 'var(--accent-line)' : variants.border}`,
        borderRadius: 'var(--r-sm)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background var(--t-instant) var(--ease), color var(--t-instant) var(--ease), border-color var(--t-instant) var(--ease)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {leftIcon && <Icon name={leftIcon} size={14} />}
      {children}
      {rightIcon && <Icon name={rightIcon} size={14} />}
    </button>
  );
}

// ——— Pill / Tag / Badge ———
function Pill({ children, color, bg, border, mono, size = 'md' }) {
  const h = size === 'sm' ? 18 : 22;
  const fs = size === 'sm' ? 10.5 : 11.5;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      height: h, padding: '0 8px',
      fontSize: fs,
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      fontVariantNumeric: 'tabular-nums',
      fontWeight: 'var(--fw-medium)',
      letterSpacing: mono ? 0 : '0.02em',
      color: color || 'var(--text-2)',
      background: bg || 'var(--surface-2)',
      border: `1px solid ${border || 'var(--border)'}`,
      borderRadius: 'var(--r-pill)',
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function SevPill({ sev, size = 'md' }) {
  const map = {
    critical: { c: 'var(--sev-crit)', bg: 'var(--sev-crit-dim)', label: 'Critical' },
    warn:     { c: 'var(--sev-warn)', bg: 'var(--sev-warn-dim)', label: 'Warning' },
    info:     { c: 'var(--sev-info)', bg: 'var(--sev-info-dim)', label: 'Info' },
  }[sev];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      height: size === 'sm' ? 18 : 22, padding: '0 8px',
      fontSize: size === 'sm' ? 10.5 : 11.5, fontWeight: 600,
      color: map.c, background: map.bg, border: `1px solid ${map.bg}`,
      borderRadius: 'var(--r-pill)', letterSpacing: '0.02em',
    }}>
      <SevGlyph sev={sev} size={8} /> {map.label}
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    open:         { c: 'var(--sev-warn)',  bg: 'var(--sev-warn-dim)',  label: 'Open' },
    acknowledged: { c: 'var(--accent)',    bg: 'var(--accent-dim)',    label: 'Ack' },
    resolved:     { c: 'var(--text-2)',    bg: 'var(--surface-2)',     label: 'Resolved' },
    dismissed:    { c: 'var(--text-3)',    bg: 'var(--surface-1)',     label: 'Dismissed' },
  }[status] || { c: 'var(--text-3)', bg: 'var(--surface-1)', label: status };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      height: 18, padding: '0 8px', fontSize: 10.5, fontWeight: 600,
      color: map.c, background: map.bg, border: `1px solid var(--border)`,
      borderRadius: 'var(--r-pill)', textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{map.label}</span>
  );
}

// ——— KPI tile ———
function KPI({ label, value, unit, delta, mono = true }) {
  return (
    <div style={{
      padding: '10px 14px', minWidth: 0,
    }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-1)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{unit}</span>}
        {delta && (
          <span style={{ marginLeft: 4, fontSize: 11.5, color: delta.startsWith('-') ? 'var(--sev-crit)' : delta.startsWith('+') ? 'var(--ch-4)' : 'var(--text-3)' }}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

// ——— Slide-over drawer (right) ———
function Drawer({ open, onClose, width = '45%', children, title, kbd }) {
  // Esc to close
  uEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose && onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* dim scrim — subtle */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.18)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity var(--t-med) var(--ease)',
          zIndex: 80,
        }}
      />
      <aside
        role="dialog" aria-modal="true" aria-label={title}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width,
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          borderLeft: '1px solid var(--glass-border)',
          boxShadow: 'var(--shadow-modal)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform var(--t-med) var(--ease)',
          zIndex: 90,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {children}
      </aside>
    </>
  );
}

// ——— Command palette (⌘K) ———
function CommandPalette({ open, onClose, onRun }) {
  const [q, setQ] = uState('');
  const [sel, setSel] = uState(0);
  const inputRef = uRef(null);

  uEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const items = uMemo(() => {
    const cmds = window.ReliatData.COMMANDS;
    const channels = window.ReliatData.CHANNELS.map(c => ({
      id: 'ch.' + c.id, label: `Open channel · ${c.name}`, kind: 'Channel', surface: 'channels', channelId: c.id,
    }));
    const outliers = window.ReliatData.OUTLIERS.slice(0, 25).map(o => ({
      id: 'out.' + o.id, label: `Outlier ${o.id} · ${o.channelName} · ${o.type}`, kind: 'Outlier', surface: 'outliers', outlierId: o.id,
    }));
    const askAgent = q.trim().length > 3 ? [{
      id: 'agent.ask', label: `Ask agent: "${q.trim()}"`, kind: 'Agent', surface: 'agent',
    }] : [];
    let all = [...cmds, ...channels, ...outliers, ...askAgent];
    if (q.trim()) {
      const needle = q.toLowerCase();
      all = all.filter(c =>
        c.label.toLowerCase().includes(needle) || (c.kind && c.kind.toLowerCase().includes(needle))
      );
    } else {
      all = all.slice(0, 18);
    }
    return all;
  }, [q, open]);

  uEffect(() => { if (sel >= items.length) setSel(0); }, [items.length]);

  function handleKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) { onRun(items[sel]); onClose(); } }
    else if (e.key === 'Escape') { onClose(); }
  }

  if (!open) return null;
  // group items by kind
  const grouped = {};
  items.forEach(i => { (grouped[i.kind] = grouped[i.kind] || []).push(i); });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5,7,10,0.4)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label="Command palette"
        style={{
          width: 'min(640px, 88vw)',
          maxHeight: '64vh',
          background: 'var(--glass-bg-2)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-3)' }}><Icon name="search" size={16}/></span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={handleKey}
            placeholder="Jump to anything, run a command, ask the agent…"
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 0,
              color: 'var(--text-1)', fontSize: 15, fontFamily: 'var(--font-sans)',
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '6px 0' }}>
          {items.length === 0 && (
            <div style={{ padding: '24px 16px', color: 'var(--text-3)', fontSize: 13 }}>
              No matches. Try a channel name, outlier ID, or a question.
            </div>
          )}
          {Object.entries(grouped).map(([kind, list]) => (
            <div key={kind}>
              <div style={{
                fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                padding: '10px 16px 4px',
              }}>{kind}</div>
              {list.map(item => {
                const idx = items.indexOf(item);
                const active = idx === sel;
                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => { onRun(item); onClose(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 16px',
                      background: active ? 'var(--accent-dim)' : 'transparent',
                      borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'background var(--t-instant)',
                    }}
                  >
                    <span style={{ color: active ? 'var(--accent-bright)' : 'var(--text-2)', flex: 1, fontSize: 13 }}>
                      {item.label}
                    </span>
                    {item.shortcut && (
                      <span style={{ display: 'flex', gap: 3 }}>
                        {item.shortcut.split(' ').map((k, i) => (
                          <span key={i} className="kbd">{k}</span>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '8px 14px', borderTop: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-3)',
        }}>
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span className="kbd">↑</span><span className="kbd">↓</span> navigate
          </span>
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span className="kbd">↵</span> run
          </span>
          <span style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
            <span className="kbd">⌘</span><span className="kbd">K</span> open palette
          </span>
        </div>
      </div>
    </div>
  );
}

// ——— Tooltip — minimal, instant ———
function Tooltip({ children, label }) {
  const [open, setOpen] = uState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)', whiteSpace: 'nowrap',
          padding: '4px 8px', fontSize: 11.5,
          background: 'var(--surface-3)', color: 'var(--text-1)',
          border: '1px solid var(--border-strong)', borderRadius: 'var(--r-sm)',
          boxShadow: 'var(--shadow-pop)', zIndex: 50, pointerEvents: 'none',
        }}>{label}</span>
      )}
    </span>
  );
}

// ——— Time format ———
function fmtTime(t, opts = {}) {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  if (opts.withSec) return `${hh}:${mm}:${ss}`;
  return `${hh}:${mm}`;
}
function fmtAge(t) {
  const ms = Date.now() - t;
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

// ——— Number formatter — comma-decimal display optional ———
function fmtNum(n, digits = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

Object.assign(window, { Icon, Button, Pill, SevPill, StatusPill, KPI, Drawer, CommandPalette, Tooltip, fmtTime, fmtAge, fmtNum });
