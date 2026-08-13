class Component extends DCLogic {
  setRoot = (el) => { this.root = el; };

  renderVals() {
    return { setRoot: this.setRoot };
  }

  componentDidMount() { this.init(); }
  componentWillUnmount() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._minePlayTimer);
    window.removeEventListener('scroll', this._scroll);
    window.removeEventListener('resize', this._resize);
  }

  // ---------- helpers ----------
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  ss(t) { t = this.clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  norm(p, a, b) { return this.clamp((p - a) / (b - a), 0, 1); }
  fade(p, a, b, c, d) { return this.ss((p - a) / (b - a)) * (1 - this.ss((p - c) / (d - c))); }
  lerp(a, b, t) { return a + (b - a) * t; }
  kf(p, pts) {
    if (p <= pts[0][0]) return pts[0][1];
    if (p >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (p >= x0 && p <= x1) return this.lerp(y0, y1, (p - x0) / (x1 - x0));
    }
    return pts[pts.length - 1][1];
  }

  init() {
    const r = this.root || document;
    this.q = (s) => r.querySelector(s);
    this.qa = (s) => Array.prototype.slice.call(r.querySelectorAll(s));
    this.track = this.q('[data-track]');
    this.pin = this.q('[data-pin]');
    this.mineTrack = this.q('[data-mine-track]');
    this.minePin = this.q('[data-mine-pin]');
    this.mineVideo = this.q('[data-mine-video]');
    this.mineShade = this.q('[data-mine-shade]');
    this.mineCopy = this.q('[data-mine-copy]');
    this.mineScroll = this.q('[data-mine-scroll]');
    this.mineTransition = this.q('[data-mine-transition]');
    this.world = this.q('[data-world]');
    this.canvas = this.q('[data-canvas]');
    this.ctx = this.canvas.getContext('2d');
    this.chip = this.q('[data-chip]');
    this.copies = this.qa('[data-copy]');
    this.evs = this.qa('[data-ev]');
    this.hyps = this.qa('[data-hyp]');
    this.confs = this.qa('[data-conf]');
    this.copies.forEach(c => { c._css = c.getAttribute('style') || ''; });
    this.progress = this.q('[data-progress]');
    this.beltSvgHost = this.q('[data-belt-svg]');
    this.sizeSvgHost = this.q('[data-size-chart]');
    this.topoHost = this.q('[data-topo]');
    this.topologyGrid = this.q('[data-topology-grid]');
    this.evGrid = this.q('[data-evgrid]');
    this.evidenceFrame = this.q('[data-evidence-frame]');
    this.evidenceMeta = this.q('[data-evidence-meta]');
    this.evRules = this.qa('[data-ev-rule]');
    this.hypGrid = this.q('[data-hypgrid]');
    this.hypEvidence = this.qa('[data-hyp-evidence]');
    this.hypDetails = this.qa('[data-hyp-detail]');
    this.hypAccents = this.qa('[data-hyp-accent]');
    this.artifactMetrics = this.q('[data-artifact-metrics]');
    this.finalScene = this.q('[data-scene="6"]');
    this.video = this.q('[data-belt-video]');
    this.videoNext = this.q('[data-belt-video-next]');
    this.NS = 7;

    if (this.mineVideo) {
      this.mineVideo.loop = true;
      this.mineVideo.muted = true;
      this.mineVideo.defaultMuted = true;
      this.mineVideo.playsInline = true;
      this.mineVideo.pause();
      try { this.mineVideo.currentTime = 0.001; } catch (_) {}
      this._minePlayTimer = setTimeout(() => {
        if (this.prefersReducedMotion) return;
        try { this.mineVideo.currentTime = 0; } catch (_) {}
        this.mineVideo.play().catch(() => {});
      }, 500);
    }

    this.beltVideos = [this.video, this.videoNext].filter(Boolean);
    this._beltActive = 0;
    this._beltCrossfading = false;
    this._beltFadeSeconds = 0.72;
    this.beltVideos.forEach((video, index) => {
      video.loop = false;
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.playbackRate = 1;
      video.style.opacity = index === 0 ? 1 : 0;
      if (index === 0) video.play().catch(() => {});
    });
    this.accent = (this.props && this.props.accentColor) || '#72B798';

    this.p = 0; this.target = 0; this._lastFrame = performance.now();
    this.mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.buildParticles();
    this.buildBeltSvg();
    this.buildSizeSvg();
    this.buildTopology();
    this.buildSparks();

    this._scroll = () => this.onScroll();
    this._resize = () => this.onResize();
    window.addEventListener('scroll', this._scroll, { passive: true });
    window.addEventListener('resize', this._resize);
    if (this.mq.addEventListener) this.mq.addEventListener('change', this._resize);

    this.onResize();
    const loop = (now) => { this.frame(now); this._raf = requestAnimationFrame(loop); };
    loop();
  }

  get prefersReducedMotion() { return this.mq && this.mq.matches; }

  computeP() {
    const rect = this.track.getBoundingClientRect();
    const total = this.track.offsetHeight - window.innerHeight;
    return this.clamp((-rect.top) / (total || 1), 0, 1);
  }

  onScroll() {
    this.updateMine();
    if (this.mode === 'sequence') {
      const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (this.progress) this.progress.style.width = (this.clamp(window.scrollY / total, 0, 1) * 100) + '%';
    } else {
      this.target = this.computeP();
    }
  }

  computeMineP() {
    if (!this.mineTrack) return 1;
    const rect = this.mineTrack.getBoundingClientRect();
    const total = this.mineTrack.offsetHeight;
    return this.clamp((-rect.top) / (total || 1), 0, 1);
  }

  updateMine() {
    if (!this.mineTrack || !this.mineVideo) return;
    const p = this.computeMineP();
    const mineRect = this.mineTrack.getBoundingClientRect();
    if (this.prefersReducedMotion) {
      this.minePin.style.position = 'relative';
      this.minePin.style.visibility = 'visible';
    } else {
      this.minePin.style.position = 'fixed';
      this.minePin.style.visibility = 'visible';
    }
    if (this.pin) {
      if (this.mode === 'sequence') {
        this.pin.style.visibility = 'visible';
      } else {
        const storyRect = this.track.getBoundingClientRect();
        this.pin.style.visibility = storyRect.top <= 0 && storyRect.bottom > 0 ? 'visible' : 'hidden';
      }
    }
    const copyO = 1 - this.ss(this.norm(p, 0.08, 0.46));
    const scrollO = 1 - this.ss(this.norm(p, 0.015, 0.18));
    const veilO = this.ss(this.norm(p, 0.62, 0.98));
    if (this.mineCopy) {
      this.mineCopy.style.opacity = copyO;
      const y = this.vw < 600 ? (1 - copyO) * 14 : -46 + (1 - copyO) * 3;
      this.mineCopy.style.transform = this.vw < 600
        ? 'translateY(' + y + 'px)'
        : 'translateY(' + y + '%)';
    }
    if (this.mineScroll) this.mineScroll.style.opacity = scrollO;
    if (this.mineShade) this.mineShade.style.opacity = this.lerp(1, 0.76, this.ss(this.norm(p, 0.22, 0.68)));
    if (this.mineTransition) this.mineTransition.style.opacity = veilO * 0.92;
    this.mineVideo.style.transform = 'scale(1.002)';
  }

  onResize() {
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.vw * dpr;
    this.canvas.height = this.vh * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const seq = true;
    if (this.mineTrack && this.minePin) {
      this.mineTrack.style.height = '100vh';
      this.minePin.style.position = this.prefersReducedMotion ? 'relative' : 'fixed';
    }
    this.setMode(seq ? 'sequence' : 'cinematic');
    this.onScroll();
    this.target = this.computeP();
    this.p = this.target;
    if (this.mode === 'cinematic') this.applyCinematic();
    this.updateMine();
    this.drawCanvas();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'sequence') {
      const compact = this.vw < 900;
      this.track.style.height = 'auto';
      this.pin.style.position = 'static';
      this.pin.style.height = 'auto';
      this.pin.style.overflow = 'visible';
      this.world.style.display = 'block';
      this.world.style.position = 'relative';
      this.world.style.height = 'auto';
      this.world.style.width = '100%';
      this.world.style.transform = 'none';
      this.canvas.style.display = 'none';
      this.chip.style.display = 'none';
      (this.beltVideos || []).forEach(video => video.pause());
      this.beltSvgHost.style.display = 'none';
      this.sizeSvgHost.style.display = 'block';
      this.sizeSvgHost.style.position = 'relative';
      this.sizeSvgHost.style.inset = 'auto';
      this.sizeSvgHost.style.margin = '18px 0 28px';
      this.evGrid.style.gridTemplateColumns = compact ? '1fr' : '1.12fr 1fr 1fr';
      this.evGrid.style.gridTemplateRows = compact ? 'auto' : 'repeat(2,minmax(134px,1fr))';
      this.hyps.forEach(h => {
        h.style.gridTemplateColumns = compact
          ? '42px minmax(0,1fr)'
          : '74px minmax(255px,.9fr) minmax(500px,1.65fr) 92px';
      });
      this.hypEvidence.forEach(e => { e.style.gridTemplateColumns = compact ? '1fr' : 'repeat(3,minmax(0,1fr))'; });
      if (this.topologyGrid) this.topologyGrid.style.gridTemplateColumns = compact ? '1fr' : '1.75fr .75fr';
      if (this.artifactMetrics) this.artifactMetrics.style.gridTemplateColumns = compact ? 'repeat(2,1fr)' : 'repeat(4,1fr)';
      this.finalScene.style.flexDirection = 'column';
      this.finalScene.style.gap = '72px';
      this.qa('[data-scene]').forEach((s, i) => {
        if (i === 0) {
          s.style.display = 'none';
          return;
        }
        s.style.display = '';
        s.style.flex = 'none';
        s.style.width = '100%';
        s.style.height = 'auto';
        s.style.minHeight = '100svh';
        s.style.padding = '96px 7vw';
        s.style.borderBottom = '1px solid rgba(175,211,198,.14)';
      });
      this.copies.forEach(c => { c.setAttribute('style', c._css + ';position:relative;left:auto;right:auto;top:auto;bottom:auto;inset:auto;opacity:1;transform:none;background:transparent;margin-bottom:18px'); });
      this.evs.forEach(e => e.style.opacity = 1);
      if (this.evidenceFrame) {
        this.evidenceFrame.style.opacity = 1;
        this.evidenceFrame.style.transform = 'none';
      }
      if (this.evidenceMeta) this.evidenceMeta.style.opacity = 1;
      this.evRules.forEach(rule => rule.style.transform = 'scaleX(1)');
      (this.sparkPaths || []).forEach(path => path.setAttribute('stroke-dashoffset', 0));
      this.hyps.forEach(h => h.style.opacity = 1);
      if (this.hypGrid) {
        this.hypGrid.style.opacity = 1;
        this.hypGrid.style.transform = 'none';
      }
      this.hypDetails.forEach(d => d.style.opacity = 1);
      this.hypAccents.forEach(a => a.style.transform = 'scaleY(1)');
      this.confs.forEach(c => c.style.width = (parseFloat(c.dataset.conf) * 100) + '%');
      this.setTopo(1);
      this.setSizeStatic();
    } else {
      this.track.style.height = '1500vh';
      this.pin.style.position = 'fixed';
      this.pin.style.top = '0';
      this.pin.style.left = '0';
      this.pin.style.width = '100vw';
      this.pin.style.height = '100vh';
      this.pin.style.overflow = 'hidden';
      this.world.style.display = 'flex';
      this.world.style.position = 'absolute';
      this.world.style.height = '100%';
      this.world.style.width = '';
      this.world.style.transition = 'none';
      this.copies.forEach(c => { c.setAttribute('style', c._css + ';transition:none'); });
      this.evs.forEach(e => { e.style.transition = 'none'; });
      if (this.evidenceFrame) this.evidenceFrame.style.transition = 'none';
      this.hyps.forEach(hh => { hh.style.transition = 'none'; });
      this.canvas.style.display = 'block';
      this.chip.style.display = 'flex';
      this.beltSvgHost.style.display = 'none';
      this.beltSvgHost.style.position = 'absolute';
      this.beltSvgHost.style.inset = '0';
      this.beltSvgHost.style.margin = '';
      this.sizeSvgHost.style.display = 'none';
      this.sizeSvgHost.style.position = 'absolute';
      this.sizeSvgHost.style.inset = '0';
      this.sizeSvgHost.style.margin = '';
      this.evGrid.style.gridTemplateColumns = '1.12fr 1fr 1fr';
      this.evGrid.style.gridTemplateRows = 'repeat(2,minmax(134px,1fr))';
      this.hyps.forEach(h => { h.style.gridTemplateColumns = '74px minmax(255px,.9fr) minmax(500px,1.65fr) 92px'; });
      this.hypEvidence.forEach(e => { e.style.gridTemplateColumns = 'repeat(3,minmax(0,1fr))'; });
      if (this.topologyGrid) this.topologyGrid.style.gridTemplateColumns = '1.75fr .75fr';
      if (this.artifactMetrics) this.artifactMetrics.style.gridTemplateColumns = 'repeat(4,1fr)';
      this.finalScene.style.flexDirection = '';
      this.finalScene.style.gap = '';
      this.qa('[data-scene]').forEach(s => {
        s.style.display = '';
        s.style.flex = '0 0 100vw';
        s.style.width = '';
        s.style.height = '100vh';
        s.style.minHeight = '';
        s.style.padding = s.dataset.scene === '3' || s.dataset.scene === '4' ? '0 7vw' : s.dataset.scene === '5' ? '0 5vw' : s.dataset.scene === '6' ? '0 6vw' : s.dataset.scene === '0' ? '0 8vw' : '0';
        s.style.borderBottom = 'none';
      });
    }
  }

  // ---------- build: particles ----------
  buildParticles() {
    this.bins = [10, 30, 46, 40, 24, 20, 16];   // 0-20 ... 120-140mm
    this.binW = 20; this.maxMm = 140; this.usl = 90;
    const seed = () => Math.random();
    this.parts = [];
    this.bins.forEach((cnt, b) => {
      for (let k = 0; k < cnt; k++) {
        this.parts.push({ b: b, k: k, n: cnt, sx: seed(), sy: seed(), rot: seed() * Math.PI });
      }
    });
    this.maxCount = Math.max.apply(null, this.bins);
  }

  // ---------- build: SVG belt (sequence) ----------
  svg(w, h) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    s.setAttribute('width', '100%'); s.style.height = 'auto'; s.style.display = 'block';
    return s;
  }
  el(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  buildBeltSvg() {
    const s = this.svg(1000, 300);
    s.appendChild(this.el('rect', { x: 0, y: 150, width: 1000, height: 92, rx: 8, fill: '#2b2620' }));
    for (let i = 0; i < 24; i++) s.appendChild(this.el('line', { x1: i * 44, y1: 150, x2: i * 44 - 22, y2: 242, stroke: 'rgba(255,255,255,.06)', 'stroke-width': 3 }));
    const rocks = [[120, '#8f8478'], [210, '#7c7266'], [300, '#a49a8c'], [430, '#6f665b'], [560, '#948a7c'], [690, '#7c7266'], [820, '#a49a8c']];
    rocks.forEach(([x, c]) => {
      const r = 14 + (x % 5) * 3;
      s.appendChild(this.el('circle', { cx: x, cy: 196, r: r, fill: c }));
    });
    s.appendChild(this.el('line', { x1: 500, y1: 110, x2: 500, y2: 250, stroke: '#1F41BB', 'stroke-width': 2, 'stroke-dasharray': '4 4' }));
    this.beltSvgHost.appendChild(s);
  }

  // ---------- build: SVG size chart (sequence static) ----------
  buildSizeSvg() {
    const W = 1000, H = 460, ml = 70, mr = 40, mt = 40, mb = 60;
    const s = this.svg(W, H);
    const pw = W - ml - mr, ph = H - mt - mb;
    const uslX = ml + (this.usl / this.maxMm) * pw;
    s.appendChild(this.el('rect', { x: ml, y: mt, width: uslX - ml, height: ph, fill: 'rgba(89,162,132,.14)' }));
    s.appendChild(this.el('rect', { x: uslX, y: mt, width: ml + pw - uslX, height: ph, fill: 'rgba(169,219,159,.12)' }));
    s.appendChild(this.el('line', { x1: uslX, y1: mt, x2: uslX, y2: mt + ph, stroke: '#72B798', 'stroke-width': 2, 'stroke-dasharray': '6 5' }));
    const bw = pw / this.bins.length;
    this.bins.forEach((cnt, b) => {
      const hgt = (cnt / this.maxCount) * ph;
      const over = ((b + 0.5) * this.binW) > this.usl;
      s.appendChild(this.el('rect', { x: ml + b * bw + bw * 0.16, y: mt + ph - hgt, width: bw * 0.68, height: hgt, rx: 4, fill: over ? '#A9DB9F' : '#4C8F91' }));
    });
    s.appendChild(this.el('line', { x1: ml, y1: mt + ph, x2: ml + pw, y2: mt + ph, stroke: 'rgba(194,222,213,.26)', 'stroke-width': 1.5 }));
    const lbl = this.el('text', { x: uslX, y: mt - 12, fill: '#A9DB9F', 'font-size': 16, 'font-family': 'IBM Plex Mono, monospace', 'text-anchor': 'middle' }); lbl.textContent = 'USL 90mm'; s.appendChild(lbl);
    this.sizeSvgHost.appendChild(s);
  }
  setSizeStatic() {}

  // ---------- build: topology ----------
  buildTopology() {
    const W = 1100, H = 440;
    const s = this.svg(W, H);
    this.topoSvg = s;
    const N = {
      crusher: { x: 110, y: 190, code: 'CR-01', label: 'Crusher', index: '01' },
      cv02: { x: 310, y: 190, code: 'CV-02', label: 'Conveyor', index: '02' },
      sc01: { x: 510, y: 190, code: 'SC-01', label: 'Screen', index: '03' },
      ml01: { x: 510, y: 345, code: 'ML-01', label: 'Mill', index: '04' },
      el01: { x: 765, y: 345, code: 'EL-01', label: 'Elevator', index: '05' },
      out: { x: 990, y: 190, code: 'LO-01', label: 'Load-out', index: '06' }
    };
    this.N = N;
    this.edges = [
      { a: 'crusher', b: 'cv02', o: 0 },
      { a: 'cv02', b: 'sc01', o: 1 },
      { a: 'sc01', b: 'ml01', o: 2, dashed: true },
      { a: 'ml01', b: 'el01', o: 3 },
      { a: 'el01', b: 'out', o: 4, curve: true },
      { a: 'sc01', b: 'crusher', o: -1, loop: true }
    ];
    this.edgeEls = this.edges.map(e => {
      const A = N[e.a], B = N[e.b];
      let d;
      if (e.loop) d = 'M ' + A.x + ' ' + (A.y - 38) + ' C ' + (A.x - 30) + ' 56, ' + (B.x + 24) + ' 56, ' + B.x + ' ' + (B.y - 38);
      else if (e.curve) d = 'M ' + (A.x + 62) + ' ' + A.y + ' C ' + (A.x + 130) + ' ' + A.y + ', ' + (B.x - 90) + ' ' + B.y + ', ' + (B.x - 62) + ' ' + B.y;
      else if (A.x === B.x) d = 'M ' + A.x + ' ' + (A.y + 38) + ' L ' + B.x + ' ' + (B.y - 38);
      else d = 'M ' + (A.x + 62) + ' ' + A.y + ' L ' + (B.x - 62) + ' ' + B.y;
      const base = this.el('path', { d: d, fill: 'none', stroke: e.loop ? 'rgba(104,169,179,.38)' : 'rgba(177,209,199,.24)', 'stroke-width': e.loop ? 1.25 : 1.5, 'stroke-linecap': 'square', 'vector-effect': 'non-scaling-stroke' });
      if (e.dashed || e.loop) base.setAttribute('stroke-dasharray', '6 7');
      s.appendChild(base);
      const hot = this.el('path', { d: d, fill: 'none', stroke: '#A9DB9F', 'stroke-width': 2.5, 'stroke-linecap': 'square', 'vector-effect': 'non-scaling-stroke', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, opacity: 0 });
      if (e.o >= 0) s.appendChild(hot);
      if (e.loop) {
        const t = this.el('text', { x: (A.x + B.x) / 2, y: 72, fill: '#68A9B3', 'font-size': 11, 'letter-spacing': 1.2, 'font-family': 'IBM Plex Mono, monospace', 'text-anchor': 'middle' });
        t.textContent = 'NOMINAL RECIRCULATION'; s.appendChild(t);
      }
      return { spec: e, hot: hot };
    });
    this.nodeEls = {};
    Object.keys(N).forEach(key => {
      const n = N[key];
      const g = this.el('g', {});
      const box = this.el('rect', { x: n.x - 62, y: n.y - 38, width: 124, height: 76, rx: 3, fill: '#102428', stroke: 'rgba(175,211,198,.28)', 'stroke-width': 1.25, 'vector-effect': 'non-scaling-stroke' });
      const index = this.el('text', { x: n.x - 48, y: n.y - 17, fill: '#68A9B3', 'font-size': 9.5, 'letter-spacing': 1.1, 'font-family': 'IBM Plex Mono, monospace' });
      index.textContent = n.index;
      const code = this.el('text', { x: n.x, y: n.y + 1, fill: '#F2F1E8', 'font-size': 14, 'font-weight': 600, 'letter-spacing': .5, 'font-family': 'IBM Plex Mono, monospace', 'text-anchor': 'middle' });
      code.textContent = n.code;
      const label = this.el('text', { x: n.x, y: n.y + 22, fill: '#A9BBB6', 'font-size': 11, 'font-family': 'Sora, sans-serif', 'text-anchor': 'middle' });
      label.textContent = n.label;
      const dot = this.el('circle', { cx: n.x + 48, cy: n.y - 22, r: 3.5, fill: '#A9DB9F', opacity: 0 });
      g.appendChild(box); g.appendChild(index); g.appendChild(code); g.appendChild(label); g.appendChild(dot); s.appendChild(g);
      this.nodeEls[key] = { box: box, index: index, code: code, label: label, dot: dot };
    });
    this.timeLabels = [
      { key: 'crusher', txt: 't0' },
      { key: 'cv02', txt: '+38s' },
      { key: 'sc01', txt: '+52s' },
      { key: 'ml01', txt: '+1m47s' }
    ].map(o => {
      const n = N[o.key];
      const t = this.el('text', { x: n.x, y: n.y + 57, fill: '#A9DB9F', 'font-size': 10.5, 'letter-spacing': .8, 'font-family': 'IBM Plex Mono, monospace', 'text-anchor': 'middle', opacity: 0 });
      t.textContent = o.txt; s.appendChild(t);
      return { el: t, key: o.key };
    });
    this.topoHost.appendChild(s);
  }

  setTopo(t) {
    this.edgeEls.forEach(({ spec, hot }) => {
      if (spec.o < 0) return;
      const start = 0.08 + spec.o * 0.17;
      const lt = this.ss(this.norm(t, start, start + 0.15));
      hot.setAttribute('opacity', lt > 0.001 ? 1 : 0);
      hot.setAttribute('stroke-dashoffset', 1 - lt);
    });
    const stageFor = { crusher: 0.02, cv02: 0.20, sc01: 0.38, ml01: 0.56, el01: 0.74, out: 0.92 };
    Object.keys(stageFor).forEach(key => {
      const lt = this.ss(this.norm(t, stageFor[key], stageFor[key] + 0.07));
      const node = this.nodeEls[key];
      node.box.setAttribute('fill', this.mix('#102428', '#173B33', lt));
      node.box.setAttribute('stroke', this.mix('#35514E', '#72B798', lt));
      node.code.setAttribute('fill', '#F2F1E8');
      node.label.setAttribute('fill', this.mix('#A9BBB6', '#F2F1E8', lt));
      node.index.setAttribute('fill', this.mix('#68A9B3', '#A9DB9F', lt));
      node.dot.setAttribute('opacity', lt);
    });
    const labelStarts = [0.04, 0.22, 0.40, 0.58];
    this.timeLabels.forEach((o, i) => {
      o.el.setAttribute('opacity', this.ss(this.norm(t, labelStarts[i], labelStarts[i] + 0.08)));
    });
  }

  // ---------- build: sparklines ----------
  buildSparks() {
    const data = [
      [3, 4, 4, 5, 4, 5, 6, 12, 20, 26, 30, 31],
      [0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1],
      [1, 1, 1.2, 1, 1, 1.1, 2, 4, 5, 6, 6.1, 6],
      [0, 5, 5, 8, 6, 10, 20, 60, 110, 135, 140, 138],
      [2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4]
    ];
    const colors = ['#72B798', '#72B798', '#72B798', '#72B798', '#A9DB9F'];
    this.sparkPaths = [];
    this.qa('[data-spark]').forEach((host, idx) => {
      const d = data[idx] || data[0];
      const W = 200, H = parseFloat(host.dataset.sparkHeight) || 40;
      const s = this.svg(W, H); s.setAttribute('preserveAspectRatio', 'none'); s.style.height = H + 'px';
      const mn = Math.min.apply(null, d), mx = Math.max.apply(null, d);
      const rng = (mx - mn) || 1;
      let path = '';
      d.forEach((v, i) => {
        const x = (i / (d.length - 1)) * W;
        const y = H - 4 - ((v - mn) / rng) * (H - 8);
        path += (i === 0 ? 'M ' : 'L ') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      });
      s.appendChild(this.el('line', { x1: 0, y1: H - 1, x2: W, y2: H - 1, stroke: 'rgba(175,211,198,.18)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
      const spark = this.el('path', { d: path, fill: 'none', stroke: colors[idx], 'stroke-width': idx === 0 ? 2 : 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'square', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, 'vector-effect': 'non-scaling-stroke' });
      s.appendChild(spark);
      this.sparkPaths.push(spark);
      host.appendChild(s);
    });
  }

  setEvidence(t) {
    const frameT = this.ss(this.norm(t, 0, 0.18));
    if (this.evidenceFrame) {
      this.evidenceFrame.style.opacity = frameT;
      this.evidenceFrame.style.transform = 'translateY(' + ((1 - frameT) * 10) + 'px)';
    }
    if (this.evidenceMeta) this.evidenceMeta.style.opacity = this.ss(this.norm(t, 0.08, 0.28));

    this.evs.forEach((e, i) => {
      const start = i === 0 ? 0.08 : 0.18 + (i - 1) * 0.12;
      const reveal = this.ss(this.norm(t, start, start + 0.30));
      const line = this.ss(this.norm(t, start + 0.08, start + 0.38));
      const chart = this.ss(this.norm(t, start + 0.14, start + 0.46));
      e.style.opacity = reveal;
      e.style.transform = 'translateY(' + ((1 - reveal) * 13) + 'px)';
      if (this.evRules[i]) this.evRules[i].style.transform = 'scaleX(' + line + ')';
      if (this.sparkPaths[i]) this.sparkPaths[i].setAttribute('stroke-dashoffset', 1 - chart);
    });
  }

  setHypotheses(t) {
    const frameT = this.ss(this.norm(t, 0, 0.18));
    if (this.hypGrid) {
      this.hypGrid.style.opacity = frameT;
      this.hypGrid.style.transform = 'translateY(' + ((1 - frameT) * 10) + 'px)';
    }

    this.hyps.forEach((h, i) => {
      const start = 0.06 + i * 0.16;
      const reveal = this.ss(this.norm(t, start, start + 0.28));
      const accent = this.ss(this.norm(t, start + 0.04, start + 0.31));
      h.style.opacity = reveal;
      h.style.transform = 'translateY(' + ((1 - reveal) * 12) + 'px)';
      if (this.hypAccents[i]) this.hypAccents[i].style.transform = 'scaleY(' + accent + ')';

      const details = Array.prototype.slice.call(h.querySelectorAll('[data-hyp-detail]'));
      details.forEach((detail, j) => {
        detail.style.opacity = this.ss(this.norm(t, start + 0.10 + j * 0.025, start + 0.34 + j * 0.025));
      });

      const conf = h.querySelector('[data-conf]');
      if (conf) {
        const target = parseFloat(conf.dataset.conf) * 100;
        const confidenceT = this.ss(this.norm(t, start + 0.10, start + 0.38));
        conf.style.width = (target * confidenceT) + '%';
        conf.style.transition = 'none';
      }
    });
  }

  // ---------- frame ----------
  frame(now) {
    this.updateBeltLoop(now || performance.now());
    if (this.mode === 'sequence') { this.ctx.clearRect(0, 0, this.vw, this.vh); return; }
    this.target = this.computeP();
    const dt = Math.min(40, Math.max(1, (now || performance.now()) - this._lastFrame));
    this._lastFrame = now || performance.now();
    const alpha = 1 - Math.exp(-dt / 95);
    const delta = this.target - this.p;
    if (Math.abs(delta) > 0.00002) {
      this.p += delta * alpha;
      this.applyCinematic();
    } else if (this.p !== this.target) {
      this.p = this.target;
      this.applyCinematic();
    }
    this.drawCanvas();
  }

  updateBeltLoop(now) {
    if (!this.beltVideos || this.beltVideos.length < 2 || this.prefersReducedMotion) return;
    const active = this.beltVideos[this._beltActive];
    const standbyIndex = this._beltActive === 0 ? 1 : 0;
    const standby = this.beltVideos[standbyIndex];
    const duration = active.duration;
    if (!Number.isFinite(duration) || duration <= this._beltFadeSeconds) return;

    if (!this._beltCrossfading && active.currentTime >= duration - this._beltFadeSeconds) {
      this._beltCrossfading = true;
      this._beltFadeStarted = now;
      try { standby.currentTime = 0; } catch (_) {}
      standby.style.opacity = 0;
      standby.play().catch(() => {});
    }

    if (!this._beltCrossfading) return;
    const t = this.clamp((now - this._beltFadeStarted) / (this._beltFadeSeconds * 1000), 0, 1);
    active.style.opacity = 1 - t;
    standby.style.opacity = t;
    if (t < 1) return;

    active.pause();
    try { active.currentTime = 0; } catch (_) {}
    active.style.opacity = 0;
    standby.style.opacity = 1;
    this._beltActive = standbyIndex;
    this._beltCrossfading = false;
  }

  drawCanvas() {
    const p = this.p, vw = this.vw, vh = this.vh;
    const camIndex = this.kf(p, [[0, 1], [0.24, 1], [0.28, 2], [0.52, 2], [0.56, 3], [0.66, 3], [0.70, 4], [0.80, 4], [0.825, 5], [0.945, 5], [0.958, 6], [1, 6]]);
    this.ctx.clearRect(0, 0, vw, vh);
    // Let the conveyor begin inside the hero's open right side, then use the
    // existing camera move to carry that same belt into the detection scene.
    // On narrower cinematic viewports it starts farther right to protect copy.
    const heroBeltOffset = vw < 1200 ? 0.72 : 0.58;
    const beltX = camIndex <= 1
      ? (1 - camIndex) * vw * heroBeltOffset
      : (1 - camIndex) * vw;
    if (beltX > -vw && beltX < vw) this.drawBelt(beltX, this.norm(p, 0.14, 0.235));
    const anX = (2 - camIndex) * vw;
    if (anX > -vw && anX < vw) this.drawAnalysis(anX, this.ss(this.norm(p, 0.285, 0.375)), this.ss(this.norm(p, 0.375, 0.44)), this.ss(this.norm(p, 0.44, 0.49)));
  }

  applyCinematic() {
    const p = this.p, vw = this.vw, vh = this.vh;
    const camIndex = this.kf(p, [[0, 1], [0.24, 1], [0.28, 2], [0.52, 2], [0.56, 3], [0.66, 3], [0.70, 4], [0.80, 4], [0.825, 5], [0.945, 5], [0.958, 6], [1, 6]]);
    this.world.style.transform = 'translateX(' + (-camIndex * vw) + 'px)';
    if (this.progress) this.progress.style.width = (p * 100) + '%';

    // copy windows
    const wins = {
      hero: [2, 2, 2, 2],
      belt: [-0.04, -0.01, 0.225, 0.255],
      resolve: [0.285, 0.31, 0.362, 0.40],
      anomaly: [0.372, 0.40, 0.45, 0.50],
      bound: [0.465, 0.49, 0.515, 0.55],
      evidence: [0.555, 0.585, 0.655, 0.685],
      hypo: [0.695, 0.725, 0.795, 0.83],
      topo: [0.81, 0.833, 0.937, 0.952],
      propagation: [0.835, 0.86, 0.939, 0.952],
      artifact: [0.955, 0.965, 0.988, 0.998],
      cta: [0.987, 0.994, 1.02, 1.03]
    };
    this.copies.forEach(c => {
      const w = wins[c.dataset.copy]; if (!w) return;
      const o = this.fade(p, w[0], w[1], w[2], w[3]);
      c.style.opacity = o;
      c.style.transform = 'translateY(' + ((1 - o) * 16) + 'px)';
      if (c.dataset.copy === 'cta') c.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
    });

    // sub-progress
    const resolveT = this.ss(this.norm(p, 0.285, 0.375));
    const anomalyT = this.ss(this.norm(p, 0.375, 0.44));
    const pushT = this.ss(this.norm(p, 0.44, 0.49));
    const evidenceT = this.norm(p, 0.565, 0.67);
    const hypoT = this.norm(p, 0.71, 0.815);
    const topoT = this.norm(p, 0.83, 0.94);

    // evidence dossier: establish the frame, then reveal findings in reading order
    this.setEvidence(evidenceT);
    // root-cause assessment: reveal rank, evidence ledger, then confidence
    this.setHypotheses(hypoT);
    // topology
    this.setTopo(topoT);

    // chip
    const chipO = this.fade(p, 0.372, 0.41, 1.02, 1.03);
    this.chip.style.opacity = chipO;
    const cx = this.kf(p, [[0.372, 0.5], [0.55, 0.5], [0.80, 0.5], [0.83, 0.78], [0.945, 0.78], [0.958, 0.5], [1, 0.5]]);
    const cy = this.kf(p, [[0.372, 0.34], [0.55, 0.13], [0.80, 0.13], [0.83, 0.12], [0.945, 0.12], [0.958, 0.12], [1, 0.12]]);
    this.chip.style.left = (cx * vw) + 'px';
    this.chip.style.top = (cy * vh) + 'px';
    this.chip.style.transform = 'translate(-50%,-50%) scale(' + this.lerp(0.9, 1, chipO) + ')';
  }

  drawBelt(sx, gradationT) {
    const ctx = this.ctx, vw = this.vw, vh = this.vh;
    ctx.save();
    ctx.translate(sx, 0);
    // Relative-size rings travel with the footage to make gradation legible
    // without implying that the pilot is already performing optical sizing.
    const reveal = this.ss(this.clamp(gradationT * 2.8, 0, 1));
    if (reveal > 0) {
      const activeVideo = this.beltVideos && this.beltVideos[this._beltActive];
      const duration = activeVideo && Number.isFinite(activeVideo.duration) ? activeVideo.duration : 6;
      const videoT = activeVideo ? activeVideo.currentTime / duration : 0;
      const markers = [
        { phase: .02, y: .47, r: .017 },
        { phase: .19, y: .58, r: .029 },
        { phase: .37, y: .45, r: .013 },
        { phase: .54, y: .54, r: .038 },
        { phase: .73, y: .55, r: .022 },
        { phase: .91, y: .49, r: .031 }
      ];
      const scale = Math.min(vw, vh);
      markers.forEach((marker, index) => {
        const travel = (marker.phase + videoT * 1.18) % 1.18;
        const x = vw * (travel - .06);
        const y = vh * marker.y;
        const radius = scale * marker.r;
        const copyClearance = this.ss(this.norm(x, vw * .30, vw * .48));
        const edgeFade = 1 - this.ss(this.norm(x, vw * .92, vw * 1.02));
        const alpha = reveal * Math.max(.28, copyClearance) * edgeFade;
        if (alpha <= 0) return;

        ctx.strokeStyle = 'rgba(85,200,232,' + (.74 * alpha) + ')';
        ctx.lineWidth = index % 2 ? 1.4 : 1.1;
        ctx.shadowColor = 'rgba(85,200,232,' + (.22 * alpha) + ')';
        ctx.shadowBlur = 7;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;

        const tick = Math.max(4, radius * .2);
        ctx.strokeStyle = 'rgba(85,200,232,' + (.82 * alpha) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - radius - tick); ctx.lineTo(x, y - radius + tick);
        ctx.moveTo(x, y + radius - tick); ctx.lineTo(x, y + radius + tick);
        ctx.moveTo(x - radius - tick, y); ctx.lineTo(x - radius + tick, y);
        ctx.moveTo(x + radius - tick, y); ctx.lineTo(x + radius + tick, y);
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  drawAnalysis(sx, resolveT, anomalyT, pushT) {
    const ctx = this.ctx, vw = this.vw, vh = this.vh;
    const ml = vw * 0.42, mr = vw * 0.10, mt = vh * 0.30, mb = vh * 0.20;
    const pw = vw - ml - mr, ph = vh - mt - mb;
    const uslX = ml + (this.usl / this.maxMm) * pw;
    const bins = this.bins.length;
    const bw = pw / bins;
    const cols = 5;
    // anomaly center for push
    const anomCx = uslX + (ml + pw - uslX) * 0.5;
    const anomCy = mt + ph * 0.55;

    ctx.save();
    ctx.translate(sx, 0);
    if (pushT > 0) {
      const s = 1 + pushT * 0.5;
      ctx.translate(anomCx, anomCy); ctx.scale(s, s); ctx.translate(-anomCx, -anomCy);
    }

    // control bands (fade in with resolveT)
    ctx.globalAlpha = this.clamp(resolveT * 1.2, 0, 1);
    ctx.fillStyle = 'rgba(89,162,132,.14)'; ctx.fillRect(ml, mt, uslX - ml, ph);
    ctx.fillStyle = anomalyT > 0 ? 'rgba(169,219,159,' + (0.05 + anomalyT * 0.11) + ')' : 'rgba(169,219,159,.07)';
    ctx.fillRect(uslX, mt, ml + pw - uslX, ph);
    // USL line
    ctx.globalAlpha = this.clamp(resolveT * 1.4, 0, 1);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = '#A9DB9F'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(uslX, mt - 6); ctx.lineTo(uslX, mt + ph); ctx.stroke();
    ctx.setLineDash([]);
    // baseline
    ctx.strokeStyle = 'rgba(194,222,213,.26)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ml, mt + ph); ctx.lineTo(ml + pw, mt + ph); ctx.stroke();
    ctx.globalAlpha = 1;

    // particles
    const rowsMax = Math.ceil(this.maxCount / cols);
    const cellW = (bw * 0.7) / cols;
    const cellH = Math.min(cellW, ph / rowsMax);
    const dotR = cellH * 0.34;
    // start belt strip (left side of scene)
    const bx0 = vw * 0.05, bx1 = vw * 0.30, by0 = mt + ph * 0.1, by1 = mt + ph * 0.9;

    this.parts.forEach(pt => {
      const over = ((pt.b + 0.5) * this.binW) > this.usl;
      const barLeft = ml + pt.b * bw + bw * 0.15;
      const col = pt.k % cols, row = Math.floor(pt.k / cols);
      const tx = barLeft + col * cellW + cellW / 2;
      const ty = mt + ph - row * cellH - cellH / 2;
      const startX = this.lerp(bx0, bx1, pt.sx);
      const startY = this.lerp(by0, by1, pt.sy);
      // per particle progress with slight stagger by bin size (large last)
      const stag = pt.b * 0.04 + pt.sx * 0.05;
      const lt = this.ss(this.clamp((resolveT - stag) / (1 - stag), 0, 1));
      const x = this.lerp(startX, tx, lt);
      const y = this.lerp(startY, ty, lt);
      const rad = this.lerp(dotR * 2.4, dotR, lt);
      // color: grey rock -> blue data; oversize -> amber after anomalyT
      let col1;
      if (lt < 0.55) {
        const rockPalette = ['#6f665b', '#7c7266', '#8f8478', '#a49a8c'];
        col1 = rockPalette[pt.b % rockPalette.length];
      } else if (over && anomalyT > 0) {
        col1 = this.mix('#4C8F91', '#A9DB9F', anomalyT);
      } else {
        col1 = '#4C8F91';
      }
      ctx.fillStyle = col1;
      if (lt < 0.5) {
        // irregular rock while transforming
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
    });

    // anomaly bracket box
    if (anomalyT > 0.05) {
      ctx.globalAlpha = anomalyT;
      ctx.strokeStyle = '#A9DB9F'; ctx.lineWidth = 2;
      const boxX = uslX + 4, boxW = ml + pw - uslX - 4;
      this.rr(ctx, boxX, mt - 4, boxW, ph + 8, 8); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // rounded rect path
  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  mix(c1, c2, t) {
    const h = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const a = h(c1), b = h(c2);
    return 'rgb(' + Math.round(this.lerp(a[0], b[0], t)) + ',' + Math.round(this.lerp(a[1], b[1], t)) + ',' + Math.round(this.lerp(a[2], b[2], t)) + ')';
  }
}
