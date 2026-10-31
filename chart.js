// SVG折れ線グラフ（1系列）：タップ/ホバーで値を表示
const Chart = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  function niceTicks(lo, hi, count = 4) {
    if (lo === hi) { lo -= 1; hi += 1; }
    const span = hi - lo;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const start = Math.floor(lo / step) * step;
    const ticks = [];
    for (let v = start; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000);
    if (ticks[ticks.length - 1] < hi) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
  }

  /**
   * @param {HTMLElement} el
   * @param {{x:string, y:number}[]} points  x = YYYY-MM-DD
   * @param {{unit?:string, fmt?:(n:number)=>string, label?:string}} opt
   */
  function line(el, points, opt = {}) {
    const fmt = opt.fmt || ((n) => UI.num(n));
    const unit = opt.unit || '';
    el.innerHTML = '';
    el.classList.add('chart');
    if (!points.length) { el.innerHTML = '<p class="muted center">まだ記録がありません</p>'; return; }

    const W = Math.max(280, el.clientWidth || 320);
    const H = 200;
    const m = { t: 16, r: 16, b: 28, l: 40 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;

    // 予測（opt.forecast = [{x, y, lo, hi, label?}]）は破線＋幅の帯で描く
    const fc = opt.forecast || [];
    const fxs = fc.map((p) => UI.parseDate(p.x).getTime());
    const xs = points.map((p) => UI.parseDate(p.x).getTime());
    let x0 = Math.min(...xs, ...fxs), x1 = Math.max(...xs, ...fxs);
    if (x0 === x1) { x0 -= 3 * 864e5; x1 += 3 * 864e5; }
    const ys = points.map((p) => p.y).concat(fc.flatMap((p) => [p.lo, p.hi, p.y]));
    let yMin = Math.min(...ys), yMax = Math.max(...ys);
    // 目標線・基準線（opt.ref）も表示範囲に含める
    if (opt.ref && Number.isFinite(opt.ref.y)) { yMin = Math.min(yMin, opt.ref.y); yMax = Math.max(yMax, opt.ref.y); }
    const pad = (yMax - yMin) * 0.15 || Math.max(1, Math.abs(yMax) * 0.1);
    const ticks = niceTicks(opt.zero ? 0 : yMin - pad, yMax + pad);
    const ty0 = ticks[0], ty1 = ticks[ticks.length - 1];

    const sx = (t) => m.l + ((t - x0) / (x1 - x0)) * iw;
    const sy = (v) => m.t + ih - ((v - ty0) / (ty1 - ty0)) * ih;

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opt.label || 'グラフ');
    const add = (tag, attrs, parent = svg) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      parent.appendChild(n);
      return n;
    };

    // グリッドとY軸ラベル
    for (const v of ticks) {
      add('line', { x1: m.l, x2: W - m.r, y1: sy(v), y2: sy(v), class: 'grid' });
      add('text', { x: m.l - 6, y: sy(v) + 4, class: 'axis', 'text-anchor': 'end' }).textContent = UI.num(v);
    }
    // X軸ラベル（最大5つ。予測があるときは最初の記録日と予測の区切りだけ）
    if (fc.length) {
      add('text', { x: sx(xs[0]), y: H - 8, class: 'axis', 'text-anchor': 'start' }).textContent = UI.fmtShort(points[0].x);
      fc.forEach((p, i) => {
        if (!p.label) return;
        const last = i === fc.length - 1;
        add('text', { x: sx(fxs[i]), y: H - 8, class: 'axis', 'text-anchor': last ? 'end' : 'middle' }).textContent = p.label;
      });
    }
    const nx = fc.length ? 0 : Math.min(5, points.length);
    const used = new Set();
    for (let i = 0; i < nx; i++) {
      const idx = nx === 1 ? 0 : Math.round((i * (points.length - 1)) / (nx - 1));
      if (used.has(idx)) continue;
      used.add(idx);
      const anchor = idx === 0 && points.length > 1 ? 'start' : idx === points.length - 1 && points.length > 1 ? 'end' : 'middle';
      add('text', { x: sx(xs[idx]), y: H - 8, class: 'axis', 'text-anchor': anchor }).textContent = UI.fmtShort(points[idx].x);
    }

    // 目標線・基準線
    if (opt.ref && Number.isFinite(opt.ref.y)) {
      add('line', { x1: m.l, x2: W - m.r, y1: sy(opt.ref.y), y2: sy(opt.ref.y), class: 'ref-line' });
      add('text', { x: m.l + 4, y: sy(opt.ref.y) - 5, class: 'ref-label' }).textContent = `${opt.ref.label} ${fmt(opt.ref.y)}${unit}`;
    }

    // 予測の帯と破線
    if (fc.length) {
      const up = fc.map((p, i) => `${i ? 'L' : 'M'}${sx(fxs[i]).toFixed(1)},${sy(p.hi).toFixed(1)}`).join('');
      const down = fc.slice().reverse().map((p, i) => `L${sx(fxs[fc.length - 1 - i]).toFixed(1)},${sy(p.lo).toFixed(1)}`).join('');
      add('path', { d: `${up}${down}Z`, class: 'fc-band' });
      add('path', { d: fc.map((p, i) => `${i ? 'L' : 'M'}${sx(fxs[i]).toFixed(1)},${sy(p.y).toFixed(1)}`).join(''), class: 'fc-line' });
      fc.forEach((p, i) => { if (i) add('circle', { cx: sx(fxs[i]), cy: sy(p.y), r: 4, class: 'fc-dot' }); });
    }

    // 線と点
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    add('path', { d, class: 'series-line' });
    points.forEach((p, i) => add('circle', { cx: sx(xs[i]), cy: sy(p.y), r: points.length > 30 ? 2.5 : 4, class: 'series-dot' }));

    // 最新値のラベル
    const li = points.length - 1;
    const lastP = fc.length ? { t: fxs[fc.length - 1], y: fc[fc.length - 1].y } : { t: xs[li], y: points[li].y };
    const lastLabel = add('text', { x: Math.min(sx(lastP.t), W - m.r), y: sy(lastP.y) - 10, class: 'value-label', 'text-anchor': 'end' });
    lastLabel.textContent = `${fmt(lastP.y)}${unit}`;

    // タップで値を出す対象（実績＋予測）
    const targets = points.map((p, i) => ({ t: xs[i], y: p.y, html: `<b>${fmt(p.y)}${unit}</b><span>${UI.fmtDate(p.x)}${opt.pointLabel ? ' ' + opt.pointLabel : ''}</span>` }))
      .concat(fc.slice(1).map((p, i) => ({ t: fxs[i + 1], y: p.y, html: `<b>${fmt(p.y)}${unit}</b><span>${p.tip || p.label || UI.fmtShort(p.x)} 幅 ${fmt(p.lo)}〜${fmt(p.hi)}</span>` })));

    // ホバー層
    const hover = add('g', { class: 'hover', style: 'display:none' });
    const vline = add('line', { y1: m.t, y2: m.t + ih, class: 'crosshair' }, hover);
    const hdot = add('circle', { r: 6, class: 'hover-dot' }, hover);
    const hit = add('rect', { x: m.l, y: 0, width: iw, height: H, fill: 'transparent' });

    el.appendChild(svg);
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    el.appendChild(tip);

    function show(clientX) {
      const r = svg.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * W;
      let best = 0;
      targets.forEach((g, i) => { if (Math.abs(sx(g.t) - x) < Math.abs(sx(targets[best].t) - x)) best = i; });
      const px = sx(targets[best].t), py = sy(targets[best].y);
      hover.style.display = '';
      lastLabel.style.display = 'none';
      vline.setAttribute('x1', px); vline.setAttribute('x2', px);
      hdot.setAttribute('cx', px); hdot.setAttribute('cy', py);
      tip.innerHTML = targets[best].html;
      tip.style.display = 'block';
      const left = (px / W) * r.width;
      tip.style.left = `${Math.min(Math.max(left, 50), r.width - 50)}px`;
    }
    function hide() { hover.style.display = 'none'; tip.style.display = 'none'; lastLabel.style.display = ''; }
    hit.addEventListener('pointermove', (e) => show(e.clientX));
    hit.addEventListener('pointerdown', (e) => show(e.clientX));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  }

  return { line };
})();
