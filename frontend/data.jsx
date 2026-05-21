// Reliat — data seam.
//
// This file is the ONLY mutable surface of the frontend. It populates
// `window.ReliatData` with the same shape every screen has always consumed.
// In v1.0.0 it fetches from the FastAPI backend (default http://localhost:8000)
// and falls back to a deterministic mock substrate if the backend is offline,
// so the design always renders.
//
// Contract — what every screen reads:
//   ReliatData = {
//     CHANNELS:        [{id, name, belt, color, baseF80, baseTopsize, online, shift}]
//     SERIES:          { [channelId]: [{t, v, outlier, color}] }
//     OUTLIERS:        [{id, channelId, channelName, metric, t, value, baseline,
//                         deviation, type, confidence, status, summary, action,
//                         sev, indexInSeries}]
//     psdAt(id, idx):  ({pcts: [{name,x,y}], sieves: [{size,passing}]})
//     AGENT_THREAD, SHIFT_SUMMARY, COMMANDS, rng    // unchanged from mock
//   }
//
// The two live endpoints in v1.0.0 are CHANNELS, SERIES, OUTLIERS, psdAt.
// AGENT_THREAD / SHIFT_SUMMARY / COMMANDS are still seeded locally — the
// Agent / Pulse screens aren't backed yet.

(function () {
  const API_BASE = (window.RELIAT_API_BASE || 'http://localhost:8000').replace(/\/$/, '');
  const RANGE_DEFAULT = '24h';

  // ─── Mulberry32 PRNG (kept — `rng` is exposed on ReliatData and used by screens) ───
  function rng(seed) {
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      let r = t;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ─── HTTP helpers ───
  // Sync XHR for initial load — yes, deprecated, but: the screens read
  // ReliatData at render time and there's no re-render trigger we can wire
  // up without touching the (locked) design. Localhost backend is sub-10ms;
  // ECONNREFUSED returns immediately. The async path below is used for
  // hot-path fetches (PSD on hover, outlier PATCH).
  function getJSONSync(path) {
    const x = new XMLHttpRequest();
    x.open('GET', `${API_BASE}${path}`, false);  // sync
    x.send(null);
    if (x.status < 200 || x.status >= 300) throw new Error(`${path} → ${x.status}`);
    return JSON.parse(x.responseText);
  }

  async function getJSON(path) {
    const res = await fetch(`${API_BASE}${path}`, { mode: 'cors' });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  }

  async function patchJSON(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      mode: 'cors',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  }

  // ─── PSD cache — channel screens hover repeatedly on the same series ───
  const psdCache = new Map();  // key: `${channelId}:${tMs}`  →  {pcts, sieves}

  function makePsdAt(channels, series) {
    // psdAt(channelId, idx) is sync (the chart code calls it during render).
    // We hydrate the cache lazily: on first access we kick off a fetch and
    // return a deterministic on-the-fly approximation until the real answer
    // arrives. After hydration, subsequent calls return the cached snapshot.
    return function psdAt(channelId, idx) {
      const s = series[channelId];
      const channel = channels.find(c => c.id === channelId);
      if (!s || !channel) return fallbackPsd(channel, 0, idx);
      const point = s[idx] || s[s.length - 1];
      const key = `${channelId}:${point.t}`;
      if (psdCache.has(key)) return psdCache.get(key);

      // Kick off background hydration. Same shape will replace the placeholder
      // before the next render cycle for hover-driven moves.
      hydratePsd(channelId, point.t, key);
      return fallbackPsd(channel, point.v, idx);
    };
  }

  async function hydratePsd(channelId, t, key) {
    if (psdCache.has(key)) return;
    psdCache.set(key, _placeholderForKey(key));  // mark in-flight
    try {
      const snap = await getJSON(`/api/channels/${channelId}/psd?t=${t}`);
      psdCache.set(key, snap);
    } catch (_e) {
      // leave placeholder — design still renders
    }
  }

  function _placeholderForKey(key) { return { pcts: [], sieves: [] }; }

  function fallbackPsd(channel, f80, idx) {
    // Deterministic local PSD — matches the curve shape the design expects.
    if (!channel) return { pcts: [], sieves: [] };
    const baseF80 = channel.baseF80 || f80 || 1;
    const v = f80 || baseF80;
    const k = v / baseF80;
    const r = rng(((channel.id.charCodeAt(2) || 0) + idx) * 7);
    const ratios = { F10: 0.22, F20: 0.32, F30: 0.42, F40: 0.52, F50: 0.62, F60: 0.72, F70: 0.84, F80: 1.0, F90: 1.18 };
    const pcts = Object.entries(ratios).map(([name, ratio]) => ({
      name, x: parseFloat(name.slice(1)),
      y: name === 'F80' ? v : baseF80 * ratio * k + (r() - 0.5) * 2,
    }));
    const sieveSizes = [1, 2.5, 4, 6.3, 9.5, 12.5, 19, 25, 31.5, 45, 63, 80, 100, 125, 160];
    const sieves = sieveSizes.map(sz => {
      const center = v * 0.55;
      const passing = 100 / (1 + Math.exp(-(sz - center) / (center * 0.32)));
      return { size: sz, passing: Math.max(0, Math.min(100, passing + (r() - 0.5) * 1.5)) };
    });
    return { pcts, sieves };
  }

  // ─── Reconcile API outlier rows with the windowed series ───
  // The backend stores absolute series positions; the screens want an index
  // relative to whatever window is currently in `SERIES[id]`. We rewrite
  // `indexInSeries` to match the local array.
  function reindexOutliers(outliers, series) {
    return outliers.map(o => {
      const s = series[o.channelId] || [];
      // Find the point whose timestamp matches (closest within 60s) — series
      // points are minute-aligned so an exact match is the common case.
      let bestIdx = -1; let bestDelta = Infinity;
      for (let i = 0; i < s.length; i++) {
        const d = Math.abs(s[i].t - o.t);
        if (d < bestDelta) { bestDelta = d; bestIdx = i; if (d === 0) break; }
      }
      if (bestIdx < 0 || bestDelta > 90_000) return null;  // not in window
      return { ...o, indexInSeries: bestIdx };
    }).filter(Boolean);
  }

  // ─── Mutation passthrough (Outliers triage actions) ───
  function makeOutlierActions(state) {
    async function updateStatus(id, status) {
      const updated = await patchJSON(`/api/outliers/${id}`, { status });
      const i = state.OUTLIERS.findIndex(o => o.id === id);
      if (i >= 0) state.OUTLIERS[i] = { ...state.OUTLIERS[i], ...updated };
      return updated;
    }
    return { updateStatus };
  }

  // ─── Loader (sync — runs before screens mount) ───
  function loadFromAPISync() {
    const channels = getJSONSync('/api/channels');
    const series = {};
    for (const c of channels) {
      series[c.id] = getJSONSync(`/api/channels/${c.id}/series?range=${RANGE_DEFAULT}`);
    }
    const outliersRaw = getJSONSync('/api/outliers?limit=500');
    const OUTLIERS = reindexOutliers(outliersRaw, series).sort((a, b) => b.t - a.t);
    return { CHANNELS: channels, SERIES: series, OUTLIERS };
  }

  // ─── Local mock fallback (kept identical to the original mock so nothing
  //     in the design surface looks different when the backend is offline) ───
  function buildMock() {
    const CHANNELS = [
      { id: 'cv42', name: 'CV42 Tunnel',     belt: 'Primary',   color: 'var(--ch-1)',  baseF80: 78.2, baseTopsize: 142, online: true,  shift: 'A' },
      { id: 'cv18', name: 'CV18 Mill Feed',  belt: 'Mill',      color: 'var(--ch-4)',  baseF80: 64.8, baseTopsize: 118, online: true,  shift: 'A' },
      { id: 'cv07', name: 'CV07 Stockpile',  belt: 'Stockpile', color: 'var(--ch-6)',  baseF80: 92.4, baseTopsize: 164, online: true,  shift: 'A' },
      { id: 'cv33', name: 'CV33 Crusher Out',belt: 'Crusher',   color: 'var(--ch-3)',  baseF80: 84.1, baseTopsize: 156, online: true,  shift: 'A' },
      { id: 'cv51', name: 'CV51 Reclaim',    belt: 'Reclaim',   color: 'var(--ch-2)',  baseF80: 71.6, baseTopsize: 132, online: true,  shift: 'A' },
      { id: 'cv09', name: 'CV09 ROM',        belt: 'ROM',       color: 'var(--ch-5)',  baseF80: 116.4,baseTopsize: 218, online: true,  shift: 'A' },
      { id: 'cv24', name: 'CV24 Conveyor B', belt: 'Transfer',  color: 'var(--ch-7)',  baseF80: 68.2, baseTopsize: 124, online: true,  shift: 'A' },
      { id: 'cv12', name: 'CV12 Tertiary',   belt: 'Tertiary',  color: 'var(--ch-8)',  baseF80: 52.8, baseTopsize: 96,  online: true,  shift: 'A' },
      { id: 'cv66', name: 'CV66 Screening',  belt: 'Screen',    color: 'var(--ch-10)', baseF80: 38.4, baseTopsize: 74,  online: true,  shift: 'A' },
      { id: 'cv28', name: 'CV28 SAG Feed',   belt: 'SAG',       color: 'var(--ch-9)',  baseF80: 88.9, baseTopsize: 168, online: false, shift: 'A' },
      { id: 'cv03', name: 'CV03 Pebble',     belt: 'Pebble',    color: 'var(--ch-11)', baseF80: 42.1, baseTopsize: 82,  online: true,  shift: 'A' },
      { id: 'cv77', name: 'CV77 Fines',      belt: 'Fines',     color: 'var(--ch-12)', baseF80: 21.6, baseTopsize: 42,  online: true,  shift: 'A' },
    ];

    function buildSeries(channel, points = 1440) {
      const r = rng(channel.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
      const series = [];
      const base = channel.baseF80;
      const now = Date.now();
      const outlierIdx = new Set();
      const nOut = Math.floor(r() * 5);
      for (let i = 0; i < nOut; i++) outlierIdx.add(Math.floor(r() * points));
      const colorDrift = r() > 0.45 ? { start: Math.floor(r()*points*0.7), len: Math.floor(60 + r()*180) } : null;

      let walk = 0;
      for (let i = 0; i < points; i++) {
        walk += (r() - 0.5) * 0.4;
        walk *= 0.985;
        const diurn = Math.sin((i / points) * Math.PI * 2) * (base * 0.04);
        let v = base + walk + diurn + (r() - 0.5) * (base * 0.012);

        let outlier = null;
        if (outlierIdx.has(i)) {
          const sevR = r();
          const sev = sevR < 0.18 ? 'critical' : sevR < 0.55 ? 'warn' : 'info';
          const dir = r() > 0.5 ? 1 : -1;
          const mag = (sev === 'critical' ? 0.34 : sev === 'warn' ? 0.18 : 0.08) * base;
          v += dir * mag;
          outlier = { sev, deviation: (dir * mag / (base * 0.05)) };
        }

        let h = 24 + Math.sin(i / 60) * 6 + (r() - 0.5) * 4;
        let s = 24 + Math.sin(i / 120) * 6 + (r() - 0.5) * 4;
        let l = 28 + Math.sin(i / 180) * 4 + (r() - 0.5) * 3;
        if (colorDrift && i >= colorDrift.start && i < colorDrift.start + colorDrift.len) {
          const t = (i - colorDrift.start) / colorDrift.len;
          const bell = Math.sin(t * Math.PI);
          h += bell * (channel.id === 'cv42' ? -14 : channel.id === 'cv33' ? 28 : 18);
          s += bell * 18;
          l += bell * (channel.id === 'cv66' ? -6 : 6);
        }

        series.push({
          t: now - (points - i) * 60_000,
          v,
          outlier,
          color: `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`,
        });
      }
      return series;
    }

    const SERIES = {};
    CHANNELS.forEach(c => { SERIES[c.id] = buildSeries(c); });

    const OUTLIER_TYPES = [
      { tag: 'Particle-size spike',    metric: 'F80',        unit: 'mm' },
      { tag: 'Topsize excursion',      metric: 'Topsize',    unit: 'mm' },
      { tag: 'Fines collapse',         metric: 'F10',        unit: 'mm' },
      { tag: 'Color shift',            metric: 'Hue avg',    unit: '°' },
      { tag: 'Sieve drift',            metric: 'Sieve 12.5', unit: '%' },
      { tag: 'Sensor flutter',         metric: 'Topsize',    unit: 'mm' },
    ];
    const STATUSES = ['open', 'open', 'open', 'acknowledged', 'resolved', 'dismissed'];
    const ASSIGNEES = [null, null, 'You', 'M. Okafor', 'A. Lindqvist', 'R. Patel'];

    const EXPLANATIONS = {
      'Particle-size spike': 'F80 jumped %DEV%σ above the rolling baseline over ~3min. Pattern matches a feed pulse from the upstream stockpile reclaim — not the crusher.',
      'Topsize excursion':   'Topsize crossed the alarm band and held above for %DUR%. Consistent with oversized fragments bypassing the grizzly screen.',
      'Fines collapse':      'F10 dropped sharply with no corresponding F80 change. Suggests dust suppression water surge rather than a real fines reduction.',
      'Color shift':         'Average belt hue shifted from earth-brown into a redder band for %DUR%. Likely material transition — high-iron ore on belt.',
      'Sieve drift':         '12.5mm passing % drifted out of band gradually over the last hour. No discrete event; trend is the signal.',
      'Sensor flutter':      'High-frequency oscillation on Topsize with no PSD change. Likely camera vibration during conveyor restart, not material.',
    };
    const SUGGESTED = {
      'Particle-size spike': 'Cross-check stockpile reclaim feeder rate at the same window.',
      'Topsize excursion':   'Inspect grizzly screen panel C-3 for damage at next downtime.',
      'Fines collapse':      'Confirm dust suppression nozzle sequence — likely a programming artifact.',
      'Color shift':         'Notify downstream of high-iron pulse — expect SAG draw +6%.',
      'Sieve drift':         'No immediate action. Re-evaluate at end of shift.',
      'Sensor flutter':      'Mark as instrumentation; suppress for next 15 min.',
    };

    const OUTLIERS = [];
    CHANNELS.forEach(c => {
      SERIES[c.id].forEach((pt, i) => {
        if (pt.outlier) {
          const r = rng(i + c.id.charCodeAt(2));
          const type = OUTLIER_TYPES[Math.floor(r() * OUTLIER_TYPES.length)];
          const dev = Math.abs(pt.outlier.deviation);
          const confidence = 0.62 + r() * 0.36;
          const id = `OUT-${(2400 + OUTLIERS.length).toString(36).toUpperCase()}`;
          OUTLIERS.push({
            id, channelId: c.id, channelName: c.name,
            t: pt.t, metric: type.metric, unit: type.unit,
            value: pt.v, baseline: c.baseF80, deviation: dev,
            sev: pt.outlier.sev, type: type.tag, confidence,
            status: STATUSES[Math.floor(r() * STATUSES.length)],
            assignee: ASSIGNEES[Math.floor(r() * ASSIGNEES.length)],
            summary: (EXPLANATIONS[type.tag] || '')
              .replace('%DEV%', dev.toFixed(1))
              .replace('%DUR%', `${(2 + Math.floor(r()*7))}m ${(10+Math.floor(r()*50))}s`),
            action: SUGGESTED[type.tag] || '',
            indexInSeries: i,
          });
        }
      });
    });
    OUTLIERS.sort((a, b) => b.t - a.t);
    return { CHANNELS, SERIES, OUTLIERS };
  }

  // ─── Static seeds (Agent thread, Shift summary, Commands) ───
  // These surfaces aren't backed in v1.0.0 — keep the same constants the
  // design has always had.
  const AGENT_THREAD = [{
    role: 'user',
    content: 'Why did CV42 Tunnel spike at 02:47 this morning?',
    t: Date.now() - 1000 * 60 * 32,
  }, {
    role: 'agent',
    t: Date.now() - 1000 * 60 * 31,
    answer: [
      'CV42 Tunnel\'s Topsize crossed the upper alarm band at 02:47:14 and held there for 4m 12s. The deviation was 3.6σ above the trailing 7-day baseline for the same shift slot.',
      'This is consistent with a feed pulse from CV51 Reclaim, not the upstream crusher — the timing aligns with the reclaim feeder ramp at 02:46:51 and the PSD shape (F80↑, F10 flat) matches reclaim signatures from 11 prior events this quarter.',
      'Downstream effect, predicted: SAG mill draw on CV28 will rise ~6% over the next 18–24 minutes. CV28 is currently offline for scheduled service so the effect is absorbed.',
    ],
    refs: [{ kind: 'outlier', id: 'OUT-1L' }, { kind: 'channel', id: 'cv51' }],
    evidence: [
      { tool: 'series.query',  args: 'channel=cv42 metric=Topsize window=02:30..03:00', rows: 1840 },
      { tool: 'baseline.compare', args: 'channel=cv42 metric=Topsize lookback=7d match=shift', sigma: 3.6 },
      { tool: 'similar.vector_search', args: 'embed(OUT-1L) k=20 filter=channel=cv42', returned: 11 },
      { tool: 'cascade.predict', args: 'origin=cv42 horizon=30m', confidence: 0.81 },
    ],
    followups: [
      'Show the 11 similar past events on CV42.',
      'What did we do last time CV51 caused this?',
      'Is the SAG service window still on schedule?',
    ],
  }];

  const SHIFT_SUMMARY = `Shift A is 4h 12m in. Throughput tracking 3.1% above the 7-day mean; CV42 Tunnel and CV33 Crusher Out account for 71% of feed. Three open outliers: one critical (CV09 ROM Topsize, 02:47), two warnings (CV66 Screening drift, CV51 Reclaim color shift). CV28 SAG Feed is offline for scheduled service; CV33 is absorbing the diverted load with no anomalies. Recommended attention: confirm CV09 ROM grizzly screen at next downtime — same outlier signature appeared on three prior shifts this week.`;

  const COMMANDS = [
    { id: 'go.pulse',    label: 'Go to Pulse',     kind: 'Navigate', shortcut: 'G P', surface: 'pulse'    },
    { id: 'go.channels', label: 'Go to Channels',  kind: 'Navigate', shortcut: 'G C', surface: 'channels' },
    { id: 'go.outliers', label: 'Go to Outliers',  kind: 'Navigate', shortcut: 'G O', surface: 'outliers' },
    { id: 'go.agent',    label: 'Go to Agent',     kind: 'Navigate', shortcut: 'G A', surface: 'agent'    },
    { id: 'go.library',  label: 'Go to Library',   kind: 'Navigate', shortcut: 'G L', surface: 'library'  },
    { id: 'go.notes',    label: 'Open Design Notes', kind: 'Navigate', surface: 'notes' },
    { id: 'agent.toggle', label: 'Toggle Agent drawer',     kind: 'Action', shortcut: '⌘J' },
    { id: 'theme.toggle', label: 'Toggle density: compact', kind: 'Preference' },
    { id: 'view.shift',   label: 'Open saved view: Shift handoff', kind: 'Saved view' },
    { id: 'view.crit',    label: 'Open saved view: Critical only', kind: 'Saved view' },
    { id: 'kbd.help',     label: 'Show keyboard shortcuts', kind: 'Help', shortcut: '?' },
  ];

  // ─── Publish synchronously with mock, then upgrade in-place from API ───
  // The screens import window.ReliatData at module init; making the load sync
  // (with later mutation) keeps the design 100% intact while wiring real data.
  function publish({ CHANNELS, SERIES, OUTLIERS }, source) {
    const state = {
      CHANNELS, SERIES, OUTLIERS,
      AGENT_THREAD, SHIFT_SUMMARY, COMMANDS,
      psdAt: makePsdAt(CHANNELS, SERIES),
      rng,
      __source: source,
    };
    state.actions = makeOutlierActions(state);
    window.ReliatData = state;
    window.dispatchEvent(new CustomEvent('reliat:data-updated', { detail: { source } }));
  }

  // Try the API synchronously first. If it answers, the screens render with
  // live data on first paint. If anything fails (backend offline, CORS,
  // sync-XHR blocked), fall back to the mock substrate — design still renders.
  try {
    publish(loadFromAPISync(), 'api');
    console.log('[reliat] live data loaded from', API_BASE);
  } catch (err) {
    console.warn('[reliat] backend unreachable, using mock substrate:', err && err.message);
    publish(buildMock(), 'mock');
  }
})();
