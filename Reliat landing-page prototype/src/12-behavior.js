class Component extends DCLogic {
  state = { reduced: false };

  setRoot = (el) => { this.root = el; };

  renderVals() {
    return { setRoot: this.setRoot, toggleReduced: () => this.toggleReduced() };
  }

  componentDidMount() { this.init(); }
  componentWillUnmount() {
    cancelAnimationFrame(this._raf);
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
    this.reduceBtn = this.q('[data-reduce]');
    this.beltSvgHost = this.q('[data-belt-svg]');
    this.sizeSvgHost = this.q('[data-size-chart]');
    this.topoHost = this.q('[data-topo]');
    this.video = this.q('[data-belt-video]');
    this.NS = 7;

    const src = this.props && this.props.beltVideoSrc;
    if (src) { this.video.src = src; this.video.style.display = 'block'; this.video.play().catch(() => {}); }
    this.accent = (this.props && this.props.accentColor) || '#c96a4a';

    this.p = 0; this.target = 0;
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
    const loop = () => { this.frame(); this._raf = requestAnimationFrame(loop); };
    loop();
  }

  toggleReduced() {
    this.userReduced = !this.userReduced;
    if (this.reduceBtn) this.reduceBtn.textContent = 'Motion: ' + (this.userReduced ? 'reduced' : 'full');
    this.onResize();
  }

  get reduced() { return this.userReduced || (this.mq && this.mq.matches); }

  computeP() {
    const rect = this.track.getBoundingClientRect();
    const total = this.track.offsetHeight - window.innerHeight;
    return this.clamp((-rect.top) / (total || 1), 0, 1);
  }

  onScroll() {
    if (this.mode === 'sequence') return;
    this.p = this.computeP();
    this.applyCinematic();
    this.drawCanvas();
  }

  onResize() {
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.vw * dpr;
    this.canvas.height = this.vh * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const seq = this.vw < 900 || this.reduced;
    this.setMode(seq ? 'sequence' : 'cinematic');
    this.onScroll();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'sequence') {
      this.track.style.height = 'auto';
      this.pin.style.position = 'static';
      this.pin.style.height = 'auto';
      this.pin.style.overflow = 'visible';
      this.world.style.display = 'block';
      this.world.style.transform = 'none';
      this.canvas.style.display = 'none';
      this.chip.style.display = 'none';
      this.beltSvgHost.style.display = 'block';
      this.sizeSvgHost.style.display = 'block';
      this.qa('[data-scene]').forEach((s, i) => {
        s.style.flex = 'none';
        s.style.width = '100%';
        s.style.height = 'auto';
        s.style.minHeight = i === 0 ? '92vh' : 'auto';
        s.style.padding = '84px 7vw 84px';
        s.style.borderBottom = '1px solid #eee4cb';
      });
      this.copies.forEach(c => { c.setAttribute('style', c._css + ';position:relative;left:auto;right:auto;top:auto;bottom:auto;inset:auto;opacity:1;transform:none;background:transparent;margin-bottom:18px'); });
      this.evs.forEach(e => e.style.opacity = 1);
      this.hyps.forEach(h => h.style.opacity = 1);
      this.confs.forEach(c => c.style.width = (parseFloat(c.dataset.conf) * 100) + '%');
      this.setTopo(1);
      this.setSizeStatic();
    } else {
      this.track.style.height = '960vh';
      this.pin.style.position = 'fixed';
      this.pin.style.top = '0';
      this.pin.style.left = '0';
      this.pin.style.width = '100vw';
      this.pin.style.height = '100vh';
      this.pin.style.overflow = 'hidden';
      this.world.style.display = 'flex';
      this.world.style.transition = 'transform .22s cubic-bezier(.22,.61,.36,1)';
      this.copies.forEach(c => { c.setAttribute('style', c._css + ';transition:opacity .4s ease, transform .4s ease'); });
      this.evs.forEach(e => { e.style.transition = 'opacity .4s ease, transform .4s ease'; });
      this.hyps.forEach(hh => { hh.style.transition = 'opacity .4s ease, transform .4s ease'; });
      this.canvas.style.display = 'block';
      this.chip.style.display = 'flex';
      this.beltSvgHost.style.display = 'none';
      this.sizeSvgHost.style.display = 'none';
      this.qa('[data-scene]').forEach(s => {
        s.style.flex = '0 0 100vw';
        s.style.width = '';
        s.style.height = '100vh';
        s.style.minHeight = '';
        s.style.padding = s.dataset.scene === '3' || s.dataset.scene === '4' ? '0 7vw' : s.dataset.scene === '5' ? '0 6vw' : s.dataset.scene === '6' ? '0 6vw' : s.dataset.scene === '0' ? '0 8vw' : '0';
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
    s.appendChild(this.el('line', { x1: 500, y1: 110, x2: 500, y2: 250, stroke: '#3f6fb0', 'stroke-width': 2, 'stroke-dasharray': '4 4' }));
    this.beltSvgHost.appendChild(s);
  }

  // ---------- build: SVG size chart (sequence static) ----------
  buildSizeSvg() {
    const W = 1000, H = 460, ml = 70, mr = 40, mt = 40, mb = 60;
    const s = this.svg(W, H);
    const pw = W - ml - mr, ph = H - mt - mb;
    const uslX = ml + (this.usl / this.maxMm) * pw;
    s.appendChild(this.el('rect', { x: ml, y: mt, width: uslX - ml, height: ph, fill: 'rgba(94,156,99,.10)' }));
    s.appendChild(this.el('rect', { x: uslX, y: mt, width: ml + pw - uslX, height: ph, fill: 'rgba(217,138,42,.12)' }));
    s.appendChild(this.el('line', { x1: uslX, y1: mt, x2: uslX, y2: mt + ph, stroke: '#c96a2a', 'stroke-width': 2, 'stroke-dasharray': '6 5' }));
    const bw = pw / this.bins.length;
    this.bins.forEach((cnt, b) => {
      const hgt = (cnt / this.maxCount) * ph;
      const over = ((b + 0.5) * this.binW) > this.usl;
      s.appendChild(this.el('rect', { x: ml + b * bw + bw * 0.16, y: mt + ph - hgt, width: bw * 0.68, height: hgt, rx: 4, fill: over ? '#d98a2a' : '#3f6fb0' }));
    });
    s.appendChild(this.el('line', { x1: ml, y1: mt + ph, x2: ml + pw, y2: mt + ph, stroke: '#c8bda0', 'stroke-width': 1.5 }));
    const lbl = this.el('text', { x: uslX, y: mt - 12, fill: '#c96a2a', 'font-size': 16, 'font-family': 'IBM Plex Mono, monospace', 'text-anchor': 'middle' }); lbl.textContent = 'USL 90mm'; s.appendChild(lbl);
    this.sizeSvgHost.appendChild(s);
  }
  setSizeStatic() {}

  // ---------- build: topology ----------
  buildTopology() {
    const W = 1000, H = 520;
    const s = this.svg(W, H);
    this.topoSvg = s;
    const N = {
      crusher: { x: 130, y: 150, label: 'CRUSHER' },
      cv02: { x: 340, y: 150, label: 'CV-02' },
      sc01: { x: 555, y: 150, label: 'SCREEN' },
      ml01: { x: 555, y: 360, label: 'MILL' },
      el01: { x: 790, y: 360, label: 'ELEVATOR' },
      out: { x: 900, y: 150, label: 'LOAD-OUT' }
    };
    this.N = N;
    // edges: [from,to, order(-1=neutral loop), dashed, path]
    this.edges = [
      { a: 'crusher', b: 'cv02', o: 0 },
      { a: 'cv02', b: 'sc01', o: 1 },
      { a: 'sc01', b: 'ml01', o: 2, dashed: true },
      { a: 'ml01', b: 'el01', o: 3 },
      { a: 'el01', b: 'out', o: 4, curve: true },
      { a: 'sc01', b: 'crusher', o: -1, loop: true }
    ];
    // draw edges
    this.edgeEls = this.edges.map(e => {
      const A = N[e.a], B = N[e.b];
      let d;
      if (e.loop) d = 'M ' + A.x + ' ' + (A.y - 34) + ' C ' + (A.x - 40) + ' ' + (A.y - 150) + ', ' + (B.x - 20) + ' ' + (B.y - 150) + ', ' + B.x + ' ' + (B.y - 34);
      else if (e.curve) d = 'M ' + (A.x + 34) + ' ' + A.y + ' C ' + (A.x + 90) + ' ' + A.y + ', ' + (B.x - 60) + ' ' + B.y + ', ' + B.x + ' ' + (B.y + 30);
      else if (A.x === B.x) d = 'M ' + A.x + ' ' + (A.y + 34) + ' L ' + B.x + ' ' + (B.y - 34);
      else d = 'M ' + (A.x + 34) + ' ' + A.y + ' L ' + (B.x - 34) + ' ' + B.y;
      const base = this.el('path', { d: d, fill: 'none', stroke: '#d8ceb2', 'stroke-width': e.loop ? 2 : 3, 'stroke-linecap': 'round' });
      if (e.dashed || e.loop) base.setAttribute('stroke-dasharray', '7 6');
      s.appendChild(base);
      const hot = this.el('path', { d: d, fill: 'none', stroke: '#d98a2a', 'stroke-width': e.loop ? 2 : 3.5, 'stroke-linecap': 'round', opacity: 0 });
      const len = 400;
      hot.setAttribute('stroke-dasharray', len);
      hot.setAttribute('stroke-dashoffset', len);
      hot._len = len;
      if (e.o >= 0) s.appendChild(hot);
      // loop label
      if (e.loop) {
        const t = this.el('text', { x: (A.x + B.x) / 2, y: A.y - 128, fill: '#8a857b', 'font-size': 13, 'font-family': 'IBM Plex Mono, monospace', 'text-anchor': 'middle' });
        t.textContent = 'recirc (intended)'; s.appendChild(t);
      }
      return { spec: e, hot: hot };
    });
    // nodes
    this.nodeEls = {};
    Object.keys(N).forEach(key => {
      const n = N[key];
      const g = this.el('g', {});
      const box = this.el('rect', { x: n.x - 46, y: n.y - 26, width: 92, height: 52, rx: 12, fill: '#fffdf4', stroke: '#c8bda0', 'stroke-width': 1.6 });
      const t = this.el('text', { x: n.x, y: n.y + 5, fill: '#20201c', 'font-size': 15, 'font-weight': 600, 'font-family': 'IBM Plex Mono, monospace', 'text-anchor': 'middle' });
      t.textContent = n.label;
      g.appendChild(box); g.appendChild(t); s.appendChild(g);
      this.nodeEls[key] = { box: box, text: t };
    });
    // timing labels on amber path
    this.timeLabels = [
      { key: 'crusher', txt: 't0' },
      { key: 'cv02', txt: '+38s' },
      { key: 'sc01', txt: '+52s' },
      { key: 'ml01', txt: '+1m47s' }
    ].map(o => {
      const n = N[o.key];
      const t = this.el('text', { x: n.x, y: n.y + 46, fill: '#c96a2a', 'font-size': 13, 'font-family': 'IBM Plex Mono, monospace', 'text-anchor': 'middle', opacity: 0 });
      t.textContent = o.txt; s.appendChild(t);
      return { el: t, key: o.key };
    });
    this.topoHost.appendChild(s);
  }

  setTopo(t) {
    // amber path activation by order; each edge gets a slice of t
    const orders = [0, 1, 2, 3, 4];
    this.edgeEls.forEach(({ spec, hot }) => {
      if (spec.o < 0) return;
      const seg = 1 / orders.length;
      const lt = this.clamp((t - spec.o * seg) / seg, 0, 1);
      hot.setAttribute('opacity', lt > 0 ? 1 : 0);
      hot.setAttribute('stroke-dashoffset', hot._len * (1 - lt));
    });
    const amberFor = { crusher: 0, cv02: 1, sc01: 2, ml01: 3, el01: 4 };
    Object.keys(amberFor).forEach(key => {
      const seg = 1 / 5;
      const lt = this.clamp((t - amberFor[key] * seg) / seg, 0, 1);
      const box = this.nodeEls[key].box;
      if (lt > 0.15) {
        box.setAttribute('stroke', '#d98a2a');
        box.setAttribute('stroke-width', 2.4);
        box.setAttribute('fill', key === 'ml01' ? '#fbe9a6' : '#fffdf4');
      } else {
        box.setAttribute('stroke', '#c8bda0'); box.setAttribute('stroke-width', 1.6); box.setAttribute('fill', '#fffdf4');
      }
    });
    this.timeLabels.forEach((o, i) => {
      const seg = 1 / 5;
      o.el.setAttribute('opacity', this.clamp((t - i * seg) / seg, 0, 1));
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
    const colors = ['#c96a2a', '#c96a2a', '#c96a2a', '#c96a2a', '#5e9c63'];
    this.qa('[data-spark]').forEach((host, idx) => {
      const d = data[idx] || data[0];
      const W = 200, H = 40;
      const s = this.svg(W, H); s.setAttribute('preserveAspectRatio', 'none'); s.style.height = '40px';
      const mn = Math.min.apply(null, d), mx = Math.max.apply(null, d);
      const rng = (mx - mn) || 1;
      let path = '';
      d.forEach((v, i) => {
        const x = (i / (d.length - 1)) * W;
        const y = H - 4 - ((v - mn) / rng) * (H - 8);
        path += (i === 0 ? 'M ' : 'L ') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      });
      s.appendChild(this.el('path', { d: path, fill: 'none', stroke: colors[idx], 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      host.appendChild(s);
    });
  }

  // ---------- frame ----------
  frame() {
    if (this.mode === 'sequence') { this.ctx.clearRect(0, 0, this.vw, this.vh); return; }
    const p = this.computeP();
    if (Math.abs(p - this.p) > 0.00004) { this.p = p; this.applyCinematic(); }
    this.drawCanvas();
  }

  drawCanvas() {
    const p = this.p, vw = this.vw, vh = this.vh;
    const camIndex = this.kf(p, [[0, 0], [0.09, 0], [0.14, 1], [0.24, 1], [0.28, 2], [0.52, 2], [0.56, 3], [0.66, 3], [0.70, 4], [0.80, 4], [0.84, 5], [0.925, 5], [0.955, 6], [1, 6]]);
    this.ctx.clearRect(0, 0, vw, vh);
    const beltX = (1 - camIndex) * vw;
    if (beltX > -vw && beltX < vw) this.drawBelt(beltX, this.norm(p, 0.14, 0.235));
    const anX = (2 - camIndex) * vw;
    if (anX > -vw && anX < vw) this.drawAnalysis(anX, this.ss(this.norm(p, 0.285, 0.375)), this.ss(this.norm(p, 0.375, 0.44)), this.ss(this.norm(p, 0.44, 0.49)));
  }

  applyCinematic() {
    const p = this.p, vw = this.vw, vh = this.vh;
    const camIndex = this.kf(p, [[0, 0], [0.09, 0], [0.14, 1], [0.24, 1], [0.28, 2], [0.52, 2], [0.56, 3], [0.66, 3], [0.70, 4], [0.80, 4], [0.84, 5], [0.925, 5], [0.955, 6], [1, 6]]);
    this.world.style.transform = 'translateX(' + (-camIndex * vw) + 'px)';
    if (this.progress) this.progress.style.width = (p * 100) + '%';

    // copy windows
    const wins = {
      hero: [-0.06, -0.02, 0.075, 0.10],
      belt: [0.115, 0.145, 0.225, 0.255],
      resolve: [0.285, 0.31, 0.362, 0.40],
      anomaly: [0.372, 0.40, 0.45, 0.50],
      bound: [0.465, 0.49, 0.515, 0.55],
      evidence: [0.555, 0.585, 0.655, 0.685],
      hypo: [0.695, 0.725, 0.795, 0.83],
      topo: [0.835, 0.86, 0.915, 0.945],
      propagation: [0.865, 0.89, 0.918, 0.945],
      artifact: [0.95, 0.965, 1.02, 1.03],
      cta: [0.985, 0.993, 1.02, 1.03]
    };
    this.copies.forEach(c => {
      const w = wins[c.dataset.copy]; if (!w) return;
      const o = this.fade(p, w[0], w[1], w[2], w[3]);
      c.style.opacity = o;
      c.style.transform = 'translateY(' + ((1 - o) * 16) + 'px)';
      if (c.dataset.copy === 'cta') c.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
    });

    // sub-progress
    const scanT = this.norm(p, 0.14, 0.235);
    const resolveT = this.ss(this.norm(p, 0.285, 0.375));
    const anomalyT = this.ss(this.norm(p, 0.375, 0.44));
    const pushT = this.ss(this.norm(p, 0.44, 0.49));
    const evidenceT = this.norm(p, 0.57, 0.665);
    const hypoT = this.norm(p, 0.71, 0.815);
    const topoT = this.norm(p, 0.845, 0.925);

    // evidence stagger
    this.evs.forEach((e, i) => {
      const lt = this.clamp((evidenceT - i * 0.12) / 0.35, 0, 1);
      e.style.opacity = this.ss(lt);
      e.style.transform = 'translateY(' + ((1 - this.ss(lt)) * 22) + 'px)';
    });
    // hypotheses stagger + confidence bars
    this.hyps.forEach((h, i) => {
      const lt = this.clamp((hypoT - i * 0.16) / 0.4, 0, 1);
      h.style.opacity = this.ss(lt);
      h.style.transform = 'translateY(' + ((1 - this.ss(lt)) * 22) + 'px)';
    });
    this.confs.forEach(c => {
      const target = parseFloat(c.dataset.conf) * 100;
      c.style.width = (target * this.ss(this.clamp((hypoT - 0.15) / 0.5, 0, 1))) + '%';
      c.style.transition = 'width .1s linear';
    });
    // topology
    this.setTopo(topoT);

    // chip
    const chipO = this.fade(p, 0.372, 0.41, 1.02, 1.03);
    this.chip.style.opacity = chipO;
    const cx = this.kf(p, [[0.372, 0.5], [0.55, 0.5], [0.84, 0.5], [0.885, 0.2], [0.925, 0.2], [0.955, 0.5], [1, 0.5]]);
    const cy = this.kf(p, [[0.372, 0.34], [0.55, 0.13], [0.84, 0.13], [0.885, 0.34], [0.925, 0.34], [0.955, 0.12], [1, 0.12]]);
    this.chip.style.left = (cx * vw) + 'px';
    this.chip.style.top = (cy * vh) + 'px';
    this.chip.style.transform = 'translate(-50%,-50%) scale(' + this.lerp(0.9, 1, chipO) + ')';
  }

  drawBelt(sx, scanT) {
    const ctx = this.ctx, vw = this.vw, vh = this.vh;
    const t = performance.now() / 1000;
    ctx.save();
    ctx.translate(sx, 0);
    const beltY = vh * 0.5, beltH = vh * 0.2;
    // belt band
    ctx.fillStyle = '#2b2620';
    this.rr(ctx, vw * 0.06, beltY, vw * 0.88, beltH, 10); ctx.fill();
    // chevrons moving
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 3;
    const off = (t * 90) % 46;
    for (let x = vw * 0.06 - 46 + off; x < vw * 0.94; x += 46) {
      ctx.beginPath(); ctx.moveTo(x, beltY); ctx.lineTo(x - beltH * 0.5, beltY + beltH); ctx.stroke();
    }
    // rocks
    if (!this._rocks) {
      this._rocks = [];
      for (let i = 0; i < 26; i++) this._rocks.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), g: 120 + Math.random() * 50, verts: 6 + (i % 3) });
    }
    const speed = vw * 0.09;
    this._rocks.forEach(rk => {
      let rx = vw * 0.94 - ((t * speed + rk.x * vw) % (vw * 0.9));
      const ry = beltY + beltH * (0.28 + rk.y * 0.44);
      const rad = beltH * 0.14 * rk.s;
      ctx.beginPath();
      for (let v = 0; v <= rk.verts; v++) {
        const a = (v / rk.verts) * Math.PI * 2;
        const rr = rad * (0.78 + 0.34 * Math.abs(Math.sin(v * 2.3 + rk.g)));
        const px = rx + Math.cos(a) * rr, py = ry + Math.sin(a) * rr * 0.82;
        if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      const g = Math.round(rk.g);
      ctx.fillStyle = 'rgb(' + g + ',' + Math.round(g * 0.93) + ',' + Math.round(g * 0.83) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.stroke();
    });
    // scanning plane
    if (scanT > 0 && scanT < 1) {
      const planeX = vw * 0.1 + scanT * vw * 0.8;
      const grad = ctx.createLinearGradient(planeX - 40, 0, planeX + 40, 0);
      grad.addColorStop(0, 'rgba(63,111,176,0)');
      grad.addColorStop(0.5, 'rgba(120,180,240,.5)');
      grad.addColorStop(1, 'rgba(63,111,176,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(planeX - 40, beltY - vh * 0.14, 80, beltH + vh * 0.14);
      ctx.strokeStyle = '#7fb0ea'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(planeX, beltY - vh * 0.14); ctx.lineTo(planeX, beltY + beltH); ctx.stroke();
      // sample crosses left behind
      ctx.strokeStyle = 'rgba(63,111,176,.5)'; ctx.lineWidth = 1.2;
      for (let sxp = vw * 0.1; sxp < planeX; sxp += vw * 0.04) {
        const yy = beltY - vh * 0.09 - ((sxp * 13) % (vh * 0.05));
        ctx.beginPath(); ctx.moveTo(sxp - 4, yy); ctx.lineTo(sxp + 4, yy); ctx.moveTo(sxp, yy - 4); ctx.lineTo(sxp, yy + 4); ctx.stroke();
      }
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
    ctx.fillStyle = 'rgba(94,156,99,.10)'; ctx.fillRect(ml, mt, uslX - ml, ph);
    ctx.fillStyle = anomalyT > 0 ? 'rgba(217,138,42,' + (0.06 + anomalyT * 0.12) + ')' : 'rgba(217,138,42,.05)';
    ctx.fillRect(uslX, mt, ml + pw - uslX, ph);
    // USL line
    ctx.globalAlpha = this.clamp(resolveT * 1.4, 0, 1);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = '#c96a2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(uslX, mt - 6); ctx.lineTo(uslX, mt + ph); ctx.stroke();
    ctx.setLineDash([]);
    // baseline
    ctx.strokeStyle = '#c8bda0'; ctx.lineWidth = 1.5;
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
        const g = 120 + pt.sy * 40;
        col1 = 'rgba(' + Math.round(g) + ',' + Math.round(g * 0.92) + ',' + Math.round(g * 0.82) + ',' + this.clamp(0.4 + lt, 0, 1) + ')';
      } else if (over && anomalyT > 0) {
        col1 = this.mix('#3f6fb0', '#d98a2a', anomalyT);
      } else {
        col1 = '#3f6fb0';
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
      ctx.strokeStyle = '#c96a2a'; ctx.lineWidth = 2;
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
