// Reliat — Pulse (landing).
// 8-second answer to "what should I care about right now?"

function PulseScreen({ onOpenOutlier, onOpenChannel, onAskAgent }) {
  const { CHANNELS, SERIES, OUTLIERS, SHIFT_SUMMARY } = window.ReliatData;
  const activeOutliers = OUTLIERS.filter(o => o.status === 'open' || o.status === 'acknowledged').slice(0, 10);

  // status header
  const liveCount = CHANNELS.filter(c => c.online).length;
  const withOutliers = new Set(activeOutliers.map(o => o.channelId)).size;
  const critCount = OUTLIERS.filter(o => o.sev === 'critical' && o.status === 'open').length;
  const warnCount = OUTLIERS.filter(o => o.sev === 'warn' && o.status === 'open').length;

  return (
    <div style={{ padding: '20px 24px 32px', maxWidth: 1680, margin: '0 auto' }}>

      {/* status header */}
      <div className="panel" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
        marginBottom: 20,
        background: 'linear-gradient(180deg, var(--surface-1) 0%, var(--surface-1) 100%)',
      }}>
        <KPI label="Channels live"  value={`${liveCount}`} unit={`/ ${CHANNELS.length}`} />
        <div style={{ borderLeft: '1px solid var(--border)' }}>
          <KPI label="With outliers" value={`${withOutliers}`} unit="channels" />
        </div>
        <div style={{ borderLeft: '1px solid var(--border)' }}>
          <KPI label="Critical open" value={`${critCount}`} delta={critCount > 0 ? 'attention' : null} />
        </div>
        <div style={{ borderLeft: '1px solid var(--border)' }}>
          <KPI label="Warnings open" value={`${warnCount}`} />
        </div>
        <div style={{ borderLeft: '1px solid var(--border)' }}>
          <KPI label="Last ingest" value="00:11" unit="ago" />
        </div>
        <div style={{ borderLeft: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px' }}>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>Shift</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>A · 4h 12m</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
            ends<br/>
            <span className="mono" style={{ color: 'var(--text-2)', fontSize: 12 }}>14:00</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>

        {/* — LEFT — Outliers right now */}
        <section className="panel" style={{ minHeight: 480, overflow: 'hidden' }}>
          <header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, letterSpacing: '0.01em' }}>Outliers right now</h2>
              <span className="muted" style={{ fontSize: 12 }}>{activeOutliers.length} active · ranked by severity, then deviation</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="ghost" leftIcon="filter">Filter</Button>
              <Button size="sm" variant="ghost" rightIcon="arrowright" onClick={() => onAskAgent && onAskAgent('outliers')}>All outliers</Button>
            </div>
          </header>

          <div>
            {activeOutliers.map((o, i) => (
              <OutlierRow key={o.id} o={o}
                onOpen={() => onOpenOutlier(o)}
                onAsk={() => onAskAgent && onAskAgent(o)}
                last={i === activeOutliers.length - 1}
              />
            ))}
          </div>
        </section>

        {/* — RIGHT — Channel vitals */}
        <section className="panel" style={{ minHeight: 480, overflow: 'hidden' }}>
          <header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Channel vitals</h2>
            <span className="muted" style={{ fontSize: 11.5 }}>24h</span>
          </header>
          <div>
            {CHANNELS.map((c, i) => (
              <ChannelVitalRow key={c.id} c={c}
                series={SERIES[c.id]}
                outliers={OUTLIERS.filter(o => o.channelId === c.id)}
                onOpen={() => onOpenChannel(c)}
                last={i === CHANNELS.length - 1}
              />
            ))}
          </div>
        </section>
      </div>

      {/* shift summary — agent-generated */}
      <section className="panel" style={{ marginTop: 20, padding: '14px 16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="sparkle" size={14} />
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Shift summary</h2>
            <span className="muted" style={{ fontSize: 11.5 }}>generated 6m ago · agent</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button size="sm" variant="ghost" leftIcon="spark">Regenerate</Button>
            <Button size="sm" variant="ghost" leftIcon="message" onClick={() => onAskAgent && onAskAgent('shift')}>Open in agent</Button>
          </div>
        </div>
        <p style={{
          margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-2)',
          maxWidth: '88ch', textWrap: 'pretty',
        }}>{SHIFT_SUMMARY}</p>
      </section>

    </div>
  );
}

// — Row for the outlier list
function OutlierRow({ o, onOpen, onAsk, last }) {
  const { SERIES } = window.ReliatData;
  const last60 = SERIES[o.channelId].slice(-60);
  const channel = window.ReliatData.CHANNELS.find(c => c.id === o.channelId);

  const [hover, setHover] = uState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        display: 'grid',
        gridTemplateColumns: '22px 1fr 130px 110px 56px 72px 220px',
        alignItems: 'center', gap: 14,
        padding: '12px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface-2)' : 'transparent',
        transition: 'background var(--t-instant)',
        cursor: 'pointer',
      }}
    >
      <SevGlyph sev={o.sev} size={10} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{o.channelName}</span>
          <span className="mono muted" style={{ fontSize: 11 }}>{o.id}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>· {o.type}</span>
        </div>
        <div style={{
          fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45,
          textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
        }}>{o.summary}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{fmtNum(o.value, 2)} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>{o.unit}</span></span>
        <span className="mono muted" style={{ fontSize: 11 }}>
          {o.deviation > 0 ? '+' : ''}{fmtNum(o.deviation, 1)}σ
        </span>
      </div>
      <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
        {fmtTime(o.t)} <span className="dim" style={{ fontSize: 10.5 }}>· {fmtAge(o.t)}</span>
      </div>
      <Sparkline data={last60} color={channel.color} width={56} height={22} />
      <SevPill sev={o.sev} size="sm" />
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onAsk && onAsk(); }}>Ask</Button>
        <Button size="sm" variant="ghost">Ack</Button>
        <Button size="sm" variant="secondary" rightIcon="arrowright" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Open</Button>
      </div>
    </div>
  );
}

function ChannelVitalRow({ c, series, outliers, onOpen, last }) {
  const [hover, setHover] = uState(false);
  const current = series[series.length - 1].v;
  const oCounts = {
    critical: outliers.filter(o => o.sev === 'critical' && o.status === 'open').length,
    warn: outliers.filter(o => o.sev === 'warn' && o.status === 'open').length,
    info: outliers.filter(o => o.sev === 'info' && o.status === 'open').length,
  };
  const status = !c.online ? 'offline' : oCounts.critical ? 'critical' : oCounts.warn ? 'warn' : 'ok';
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        display: 'grid',
        gridTemplateColumns: '8px 1fr 60px 60px',
        gap: 12, alignItems: 'center',
        padding: '10px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface-2)' : 'transparent',
        cursor: 'pointer',
        transition: 'background var(--t-instant)',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: 2,
        background: status === 'ok' ? 'var(--ch-4)' : status === 'critical' ? 'var(--sev-crit)' : status === 'warn' ? 'var(--sev-warn)' : 'var(--text-4)',
        opacity: status === 'offline' ? 0.5 : 1,
      }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: c.online ? 'var(--text-1)' : 'var(--text-3)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {c.name}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-4)', display: 'flex', gap: 8 }}>
          <span>{c.belt}</span>
          {!c.online && <span style={{ color: 'var(--text-3)' }}>offline · service</span>}
          {c.online && oCounts.critical > 0 && <span style={{ color: 'var(--sev-crit)' }}>{oCounts.critical} crit</span>}
          {c.online && oCounts.warn > 0 && <span style={{ color: 'var(--sev-warn)' }}>{oCounts.warn} warn</span>}
        </div>
      </div>
      <Sparkline data={series.slice(-200)} color={c.color} width={60} height={22} />
      <div className="mono" style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: c.online ? 'var(--text-1)' : 'var(--text-3)' }}>
        {fmtNum(current, 1)}
      </div>
    </div>
  );
}

window.PulseScreen = PulseScreen;
