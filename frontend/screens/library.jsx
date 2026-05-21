// Reliat — Library (settings, uploads, channels, prefs).
// Single-column with anchor nav.

function LibraryScreen() {
  const [section, setSection] = uState('uploads');
  const { CHANNELS } = window.ReliatData;

  const sections = [
    { id: 'uploads',   label: 'Uploads',     icon: 'upload' },
    { id: 'channels',  label: 'Channels',    icon: 'belt' },
    { id: 'users',     label: 'Users & Roles', icon: 'user' },
    { id: 'api',       label: 'API Keys',    icon: 'key',    disabled: true, badge: '1.1' },
    { id: 'prefs',     label: 'Preferences', icon: 'cog' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%', overflow: 'hidden' }}>
      <aside style={{
        borderRight: '1px solid var(--border)', background: 'var(--surface-1)',
        padding: '20px 12px', overflow: 'auto',
      }}>
        <h2 style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, margin: '0 0 10px 6px' }}>Library</h2>
        {sections.map(s => (
          <button key={s.id} onClick={() => !s.disabled && setSection(s.id)}
            disabled={s.disabled}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', width: '100%',
              background: section === s.id ? 'var(--accent-dim)' : 'transparent',
              color: section === s.id ? 'var(--accent-bright)' : (s.disabled ? 'var(--text-4)' : 'var(--text-1)'),
              border: 'none', borderRadius: 'var(--r-sm)', fontSize: 13,
              cursor: s.disabled ? 'not-allowed' : 'pointer',
              marginBottom: 2,
            }}
          >
            <Icon name={s.icon} size={14} />
            <span style={{ flex: 1, textAlign: 'left' }}>{s.label}</span>
            {s.badge && <Pill size="sm" color="var(--text-4)">Coming {s.badge}</Pill>}
          </button>
        ))}
      </aside>
      <div style={{ overflow: 'auto', padding: '24px 32px 40px' }}>
        <div style={{ maxWidth: 880 }}>
          {section === 'uploads' && <UploadsSection />}
          {section === 'channels' && <ChannelsSection channels={CHANNELS} />}
          {section === 'users' && <UsersSection />}
          {section === 'prefs' && <PrefsSection />}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{title}</h1>
      {sub && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>{sub}</p>}
    </div>
  );
}

function UploadsSection() {
  return (
    <div>
      <SectionHeader title="Uploads" sub="Drop CSV or Excel exports here. Files are validated before ingest; rejected rows are reviewable." />
      <div style={{
        border: '1.5px dashed var(--border-bright)',
        borderRadius: 'var(--r-md)',
        padding: '36px 24px',
        textAlign: 'center', background: 'var(--surface-1)',
        marginBottom: 24,
      }}>
        <Icon name="upload" size={24} />
        <div style={{ marginTop: 10, fontSize: 14, color: 'var(--text-1)' }}>Drop sensor exports here, or click to browse</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
          .csv  ·  .xlsx  ·  up to 2 GB  ·  comma-decimal supported
        </div>
        <div style={{ marginTop: 14 }}>
          <Button size="md" variant="secondary">Browse files</Button>
        </div>
      </div>

      <h3 style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>Recent ingests</h3>
      <div className="panel">
        {[
          { f: 'cv42_2026_05_18.csv',  size: '184 MB', rows: '69,128',   ok: '69,124', err: 4, at: '02:11', ch: 'CV42 Tunnel' },
          { f: 'cv33_2026_05_18.csv',  size: '171 MB', rows: '68,891',   ok: '68,891', err: 0, at: '02:10', ch: 'CV33 Crusher Out' },
          { f: 'cv09_2026_05_17.xlsx', size: '142 MB', rows: '54,302',   ok: '54,300', err: 2, at: '00:48 yesterday', ch: 'CV09 ROM' },
          { f: 'bulk_archive.csv',     size: '1.8 GB', rows: '8,140,221',ok: '8,140,219', err: 2, at: '3d ago', ch: 'mixed' },
        ].map((it, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '20px 1fr 140px 110px 90px 90px',
            gap: 12, padding: '10px 14px', alignItems: 'center',
            borderBottom: i === 3 ? 'none' : '1px solid var(--border)',
            fontSize: 12.5,
          }}>
            <Icon name="check" size={14} />
            <div>
              <div className="mono" style={{ fontSize: 12.5, color: 'var(--text-1)' }}>{it.f}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{it.ch} · {it.at}</div>
            </div>
            <span className="mono" style={{ color: 'var(--text-2)' }}>{it.size}</span>
            <span className="mono" style={{ color: 'var(--text-2)' }}>{it.rows} rows</span>
            <span className="mono" style={{ color: 'var(--ch-4)' }}>{it.ok} ok</span>
            <span className="mono" style={{ color: it.err > 0 ? 'var(--sev-warn)' : 'var(--text-3)' }}>{it.err} err</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelsSection({ channels }) {
  return (
    <div>
      <SectionHeader title="Channels" sub={`${channels.length} configured · per-channel alert thresholds and metadata`} />
      <div className="panel">
        <div style={{
          display: 'grid',
          gridTemplateColumns: '24px 1fr 100px 120px 100px 90px 60px',
          gap: 12, padding: '8px 14px',
          fontSize: 10.5, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
          borderBottom: '1px solid var(--border)',
        }}>
          <span></span>
          <span>Name</span>
          <span>Belt</span>
          <span className="mono">Crit threshold</span>
          <span className="mono">Warn threshold</span>
          <span>Status</span>
          <span></span>
        </div>
        {channels.map((c, i) => (
          <div key={c.id} style={{
            display: 'grid',
            gridTemplateColumns: '24px 1fr 100px 120px 100px 90px 60px',
            gap: 12, padding: '10px 14px', alignItems: 'center',
            borderBottom: i === channels.length - 1 ? 'none' : '1px solid var(--border)',
            fontSize: 12.5,
          }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: c.color }} />
            <div>
              <div style={{ fontSize: 13 }}>{c.name}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-4)' }}>{c.id} · F80 base {c.baseF80.toFixed(1)}mm</div>
            </div>
            <span className="mono muted">{c.belt}</span>
            <span className="mono">{(c.baseF80 * 1.18).toFixed(1)}mm</span>
            <span className="mono">{(c.baseF80 * 1.10).toFixed(1)}mm</span>
            <span>{c.online
              ? <Pill size="sm" color="var(--ch-4)" bg="rgba(118,217,182,0.10)" border="rgba(118,217,182,0.18)">● online</Pill>
              : <Pill size="sm" color="var(--text-3)">offline</Pill>}</span>
            <Button size="sm" variant="ghost">Edit</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersSection() {
  return (
    <div>
      <SectionHeader title="Users & Roles" sub="v1.0.0 ships with one role: plant_manager. Roles are not editable yet — the structure is here for 1.1." />
      <div className="panel">
        <div style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr 160px 120px 80px',
          gap: 12, padding: '10px 14px', alignItems: 'center',
          fontSize: 13,
        }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-bright)', fontWeight: 600 }}>YO</div>
          <div>
            <div>You</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-4)' }}>you@reliat.example</div>
          </div>
          <Pill size="sm" mono>plant_manager</Pill>
          <span className="mono muted">Active now</span>
          <Button size="sm" variant="ghost">Edit</Button>
        </div>
      </div>
    </div>
  );
}

function PrefsSection() {
  const [theme, setTheme] = uState('dark');
  const [density, setDensity] = uState('comfortable');
  const [tz, setTz] = uState('Site local · UTC+2');
  return (
    <div>
      <SectionHeader title="Preferences" />
      <div className="panel" style={{ padding: '14px 16px' }}>
        <PrefRow label="Theme" sub="Dark is the primary mode. Light is available but secondary.">
          <Segmented options={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }, { id: 'auto', label: 'System' }]} value={theme} onChange={setTheme} />
        </PrefRow>
        <PrefRow label="Density" sub="Compact reduces row heights by 4px and trims paddings.">
          <Segmented options={[{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }]} value={density} onChange={setDensity} />
        </PrefRow>
        <PrefRow label="Time zone" sub="Affects all timestamps displayed. Source data is stored UTC.">
          <Pill mono>{tz}</Pill>
        </PrefRow>
        <PrefRow label="Number format" sub="Display only. Source remains comma-decimal.">
          <Segmented options={[{ id: 'pt', label: '1,234.56' }, { id: 'comma', label: '1.234,56' }]} value={'pt'} onChange={() => {}} />
        </PrefRow>
        <PrefRow label="Notification rules" sub="Where critical outliers go. Email is a placeholder; webhooks ship in 1.1.">
          <Pill mono>email · phone-on-call</Pill>
        </PrefRow>
      </div>
    </div>
  );
}

function PrefRow({ label, sub, children }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto',
      gap: 16, alignItems: 'center', padding: '12px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

window.LibraryScreen = LibraryScreen;
