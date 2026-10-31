// 種目の動きを示すオリジナルの棒人間アニメーション（SVG）
// 「始めの姿勢」と「終わりの姿勢」の2つを定義し、その間をなめらかに行き来させる。
// 画像ファイルは使わず、関節の角度から毎回描くので、外部への読み込みも不要。
const Figures = (() => {
  // 体の各部の長さ（座標の単位。地面が y=0、上がプラス）
  const L = { torso: 36, neck: 5, head: 8, ua: 21, fa: 19, th: 28, sh: 28, ft: 9 };
  const GROUND = 140; // 画面上の地面の位置（viewBox 200×150）
  const rad = (d) => (d * Math.PI) / 180;
  const dir = (a, len) => [Math.cos(rad(a)) * len, Math.sin(rad(a)) * len];
  const add = (p, v) => [p[0] + v[0], p[1] + v[1]];

  // ---- 道具（すべて地面からの座標）----
  const bench = (x1, x2, y = 24) => ({ t: 'bench', x1, x2, y });
  const pad = (a, b, strut) => ({ t: 'pad', a, b, strut });
  const bar = (x1, x2, y) => ({ t: 'bar', x1, x2, y });
  const dip = (x1, x2, y) => ({ t: 'dip', x1, x2, y });
  const box = (x1, x2, y) => ({ t: 'box', x1, x2, y });

  // 姿勢：torso=腰→肩、ua=肩→肘、fa=肘→手首、th=腰→膝、sh=膝→足首、ft=足首→つま先 の角度（度、右が0・上が90）
  // ua2/fa2/th2/sh2/ft2 は奥側の手足（省略すると手前と同じ。正面図では左右対称）
  // anchor=[関節, [x, y]]：その関節をこの位置に固定して全体を置く
  // 角度は始め→終わりへ数値どおりに補間するので、回る向きに合わせて 250 や -210 のように書く
  const STAND = { torso: 90, th: -90, sh: -90, ft: 0, ua: -90, fa: -90 };
  const FIG = {
    db_bench: {
      props: [bench(40, 150)], db: 'both', muscles: ['chest', 'triceps'],
      poses: [
        { torso: 180, ua: 90, fa: 90, th: -4, sh: -90, ft: 0, anchor: ['H', [118, 30]] },
        { torso: 180, ua: -70, fa: 90, th: -4, sh: -90, ft: 0, anchor: ['H', [118, 30]] },
      ],
    },
    incline_press: {
      props: [bench(85, 125, 22), pad([112, 25], [64, 53])], db: 'both', muscles: ['chest', 'delts', 'triceps'],
      poses: [
        { torso: 150, ua: 90, fa: 90, th: 0, sh: -88, ft: 0, anchor: ['H', [112, 30]] },
        { torso: 150, ua: -40, fa: 90, th: 0, sh: -88, ft: 0, anchor: ['H', [112, 30]] },
      ],
    },
    dips: {
      props: [dip(88, 130, 68)], db: null, muscles: ['chest', 'triceps'],
      poses: [
        { torso: 80, ua: -90, fa: -90, th: -100, sh: 200, ft: -60, anchor: ['W', [106, 68]] },
        { torso: 72, ua: -150, fa: -30, th: -100, sh: 200, ft: -60, anchor: ['W', [106, 68]] },
      ],
    },
    one_arm_row: {
      props: [bench(18, 112)], db: 'one', muscles: ['lats', 'biceps'],
      poses: [
        { torso: 20, headTilt: -10, ua: -95, fa: -90, ua2: -90, fa2: -90, th: -60, sh: -110, ft: 0, th2: -100, sh2: 180, ft2: 180, anchor: ['H', [60, 52]] },
        { torso: 20, headTilt: -10, ua: -210, fa: -90, ua2: -90, fa2: -90, th: -60, sh: -110, ft: 0, th2: -100, sh2: 180, ft2: 180, anchor: ['H', [60, 52]] },
      ],
    },
    incline_row: {
      props: [pad([72, 47], [103, 73], true)], db: 'both', muscles: ['upperBack', 'biceps'],
      poses: [
        { torso: 40, ua: -90, fa: -90, th: -110, sh: -100, ft: 0, anchor: ['H', [70, 54]] },
        { torso: 40, ua: -185, fa: -80, th: -110, sh: -100, ft: 0, anchor: ['H', [70, 54]] },
      ],
    },
    pullup: {
      props: [bar(70, 135, 115)], db: null, muscles: ['lats', 'biceps'], primaryOnly: ['lats'],
      poses: [
        { torso: 92, ua: 90, fa: 90, th: -65, sh: -165, ft: -80, anchor: ['W', [100, 115]] },
        { torso: 95, headTilt: -15, ua: -100, fa: 80, th: -65, sh: -165, ft: -80, anchor: ['W', [100, 115]] },
      ],
    },
    seated_press: {
      props: [bench(70, 120, 22), pad([84, 24], [86, 70])], db: 'both', muscles: ['delts', 'triceps'],
      poses: [
        { torso: 88, ua: -70, fa: 90, th: 0, sh: -90, ft: 0, anchor: ['H', [90, 28]] },
        { torso: 88, ua: 92, fa: 90, th: 0, sh: -90, ft: 0, anchor: ['H', [90, 28]] },
      ],
    },
    side_raise: {
      view: 'front', db: 'both', muscles: ['delts'],
      poses: [
        { torso: 90, ua: -85, fa: -80, th: -88, sh: -88, ft: 0, anchor: ['A', [107, 2]] },
        { torso: 90, ua: 2, fa: 8, th: -88, sh: -88, ft: 0, anchor: ['A', [107, 2]] },
      ],
    },
    rear_raise: {
      view: 'front', db: 'both', muscles: ['delts'],
      caption: '実際はインクラインベンチにうつ伏せになり、腕を横に広げます',
      poses: [
        { torso: 90, ua: -95, fa: -88, th: -88, sh: -88, ft: 0, anchor: ['A', [107, 2]] },
        { torso: 90, ua: -8, fa: -2, th: -88, sh: -88, ft: 0, anchor: ['A', [107, 2]] },
      ],
    },
    db_curl: {
      db: 'both', muscles: ['biceps'],
      poses: [
        { ...STAND, ua: -85, fa: -85, anchor: ['A', [100, 2]] },
        { ...STAND, ua: -85, fa: 75, anchor: ['A', [100, 2]] },
      ],
    },
    oh_triceps: {
      props: [bench(70, 120, 22)], db: 'goblet', muscles: ['triceps'],
      poses: [
        { torso: 90, ua: 95, fa: 90, th: 0, sh: -90, ft: 0, anchor: ['H', [92, 28]] },
        { torso: 90, ua: 95, fa: 250, th: 0, sh: -90, ft: 0, anchor: ['H', [92, 28]] },
      ],
    },
    goblet_squat: {
      db: 'goblet', muscles: ['quads', 'glutes'],
      poses: [
        { torso: 90, th: -90, sh: -90, ft: 0, ua: -70, fa: 80, anchor: ['A', [110, 2]] },
        { torso: 62, th: -10, sh: -105, ft: 0, ua: -95, fa: 55, anchor: ['A', [110, 2]] },
      ],
    },
    db_rdl: {
      db: 'both', muscles: ['hams', 'glutes'],
      poses: [
        { ...STAND, anchor: ['A', [100, 2]] },
        { torso: 15, th: -65, sh: -95, ft: 0, ua: -90, fa: -90, anchor: ['A', [100, 2]] },
      ],
    },
    bulgarian: {
      props: [bench(18, 66)], db: 'both', muscles: ['quads', 'glutes'],
      poses: [
        { torso: 85, ua: -90, fa: -90, th: -85, sh: -92, ft: 0, th2: -140, sh2: 199.5, ft2: 180, anchor: ['A', [115, 2]] },
        { torso: 78, ua: -90, fa: -90, th: -10, sh: -100, ft: 0, th2: -110, sh2: 129, ft2: 180, anchor: ['A', [115, 2]] },
      ],
    },
    step_up: {
      props: [bench(105, 178, 20)], db: 'both', muscles: ['quads', 'glutes'],
      poses: [
        { torso: 80, ua: -90, fa: -90, th: -10, sh: -95, ft: 0, th2: -105, sh2: -110, ft2: -30, anchor: ['A', [115, 22]] },
        { torso: 88, ua: -90, fa: -90, th: -90, sh: -90, ft: 0, th2: -95, sh2: -100, ft2: 0, anchor: ['A', [115, 22]] },
      ],
    },
    hip_thrust: {
      props: [bench(26, 70)], db: 'hip', muscles: ['glutes', 'hams'],
      poses: [
        { torso: 155, ua: -25, fa: -25, th: 40, sh: -95, ft: 0, anchor: ['A', [130, 2]] },
        { torso: 180, ua: 0, fa: 0, th: 0, sh: -90, ft: 0, anchor: ['A', [130, 2]] },
      ],
    },
    calf_raise: {
      props: [box(100, 150, 12)], db: 'both', muscles: ['calves'],
      poses: [
        { ...STAND, ft: 25, anchor: ['T', [106, 12]] },
        { ...STAND, ft: -55, anchor: ['T', [106, 12]] },
      ],
    },
    plank: {
      db: null, muscles: ['abs'], caption: 'この姿勢を30〜60秒キープ',
      poses: [
        { torso: 10, ua: -90, fa: 0, th: 190, sh: 190, ft: -100, anchor: ['E', [130, 2]] },
        { torso: 10, ua: -90, fa: 0, th: 190, sh: 190, ft: -100, anchor: ['E', [130, 2]] },
      ],
    },
    hanging_knee: {
      props: [bar(70, 135, 134)], db: null, muscles: ['abs'],
      poses: [
        { torso: 90, ua: 90, fa: 90, th: -85, sh: -85, ft: 0, anchor: ['W', [100, 134]] },
        { torso: 100, ua: 90, fa: 90, th: 15, sh: -75, ft: 0, anchor: ['W', [100, 134]] },
      ],
    },
    dead_bug: {
      db: null, muscles: ['abs'], caption: '腰を床につけたまま、対角の手足を伸ばします',
      poses: [
        { torso: 180, ua: 90, fa: 90, th: 90, sh: 0, ft: 90, ua2: 90, fa2: 90, th2: 90, sh2: 0, ft2: 90, anchor: ['H', [105, 8]] },
        { torso: 180, ua: 175, fa: 175, th: 15, sh: 10, ft: 60, ua2: 90, fa2: 90, th2: 90, sh2: 0, ft2: 90, anchor: ['H', [105, 8]] },
      ],
    },
    stepper: {
      props: [box(80, 125, 8)], db: null, muscles: ['quads', 'glutes'], caption: '会話できるくらいのペースで続けます',
      poses: [
        { torso: 88, ua: -70, fa: 10, ua2: -110, fa2: -10, th: -88, sh: -92, ft: 0, th2: -60, sh2: -110, ft2: 0, anchor: ['H', [100, 64]] },
        { torso: 88, ua: -110, fa: -10, ua2: -70, fa2: 10, th: -60, sh: -110, ft: 0, th2: -88, sh2: -92, ft2: 0, anchor: ['H', [100, 64]] },
      ],
    },
  };
  FIG.chinup = { ...FIG.pullup, muscles: ['lats', 'biceps'] };

  // ---- 関節の位置を計算 ----
  function joints(p, view) {
    const front = view === 'front';
    const mir = (a) => (front ? 180 - a : a);
    const H = [0, 0];
    const S = add(H, dir(p.torso, L.torso));
    const head = add(S, dir(p.torso + (p.headTilt || 0), L.neck + L.head));
    const SN = front ? add(S, [11, 0]) : S;
    const SF = front ? add(S, [-11, 0]) : S;
    const HN = front ? add(H, [5, 0]) : H;
    const HF = front ? add(H, [-5, 0]) : H;
    const E = add(SN, dir(p.ua, L.ua)), W = add(E, dir(p.fa, L.fa));
    const E2 = add(SF, dir(p.ua2 ?? mir(p.ua), L.ua)), W2 = add(E2, dir(p.fa2 ?? mir(p.fa), L.fa));
    const K = add(HN, dir(p.th, L.th)), A = add(K, dir(p.sh, L.sh)), T = add(A, dir(p.ft ?? 0, L.ft));
    const K2 = add(HF, dir(p.th2 ?? mir(p.th), L.th)), A2 = add(K2, dir(p.sh2 ?? mir(p.sh), L.sh)), T2 = add(A2, dir(p.ft2 ?? mir(p.ft ?? 0), L.ft));
    const j = { H, S, head, SN, SF, HN, HF, E, W, E2, W2, K, A, T, K2, A2, T2 };
    const [name, at] = p.anchor;
    const off = [at[0] - j[name][0], at[1] - j[name][1]];
    for (const k in j) j[k] = add(j[k], off);
    return j;
  }

  // 2つの姿勢の間を補間（k=0 始め、k=1 終わり）
  function lerpPose(a, b, k) {
    const out = { anchor: [a.anchor[0], [a.anchor[1][0] + (b.anchor[1][0] - a.anchor[1][0]) * k, a.anchor[1][1] + (b.anchor[1][1] - a.anchor[1][1]) * k]] };
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    keys.forEach((key) => {
      if (key === 'anchor') return;
      const va = a[key], vb = b[key];
      if (va == null && vb == null) return;
      out[key] = (va ?? vb) + ((vb ?? va) - (va ?? vb)) * k;
    });
    return out;
  }

  // ---- 効く部位（色を付ける楕円）----
  const angleOf = (v) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  // 線分 p→q 上の位置 t に、side 方向（度）へずらした楕円
  function blob(p, q, t, side, off, rx, ry) {
    const c = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const o = add(c, dir(side, off));
    return { c: o, rx, ry, rot: angleOf(sub(q, p)) };
  }
  // 曲がっている側（先の骨が折れ曲がる側）を返す。まっすぐなら fallback
  function bendSide(base, mid, tip, fallback) {
    const a = angleOf(sub(mid, base));
    const v = sub(tip, mid);
    const seg = sub(mid, base);
    const cross = seg[0] * v[1] - seg[1] * v[0];
    if (Math.abs(cross) / (Math.hypot(...seg) * Math.hypot(...v) || 1) < 0.25) return fallback;
    return dot(dir(a + 90, 1), v) > 0 ? a + 90 : a - 90;
  }

  function muscleShapes(def, j) {
    const front = def.view === 'front';
    const ta = angleOf(sub(j.S, j.H));
    const chestSide = ta - 90, backSide = ta + 90;
    const out = [];
    for (const m of def.muscles || []) {
      if (m === 'delts') {
        out.push({ c: j.SN, rx: 5.5, ry: 5.5, rot: 0 });
        if (front) out.push({ c: j.SF, rx: 5.5, ry: 5.5, rot: 0 });
      }
      if (front) continue;
      if (m === 'chest') out.push(blob(j.H, j.S, 0.75, chestSide, 4, 8, 4));
      if (m === 'abs') out.push(blob(j.H, j.S, 0.35, chestSide, 3.5, 8, 3.5));
      if (m === 'lats') out.push(blob(j.H, j.S, 0.62, backSide, 4, 10, 4));
      if (m === 'upperBack') out.push(blob(j.H, j.S, 0.85, backSide, 4, 8, 4));
      if (m === 'glutes') out.push(blob(j.H, j.S, 0.04, backSide, 4.5, 6, 5));
      const ua = angleOf(sub(j.E, j.SN));
      const bic = bendSide(j.SN, j.E, j.W, ua + 90);
      if (m === 'biceps') out.push(blob(j.SN, j.E, 0.5, bic, 3, 7, 3));
      if (m === 'triceps') out.push(blob(j.SN, j.E, 0.5, bic + 180, 3, 7, 3));
      const th = angleOf(sub(j.K, j.HN));
      const ham = bendSide(j.HN, j.K, j.A, th - 90);
      if (m === 'quads') out.push(blob(j.HN, j.K, 0.5, ham + 180, 3, 9, 3.5));
      if (m === 'hams') out.push(blob(j.HN, j.K, 0.5, ham, 3, 9, 3.5));
      if (m === 'calves') {
        const sa = angleOf(sub(j.A, j.K));
        const toe = sub(j.T, j.A);
        const calf = dot(dir(sa + 90, 1), toe) > 0 ? sa - 90 : sa + 90;
        out.push(blob(j.K, j.A, 0.35, calf, 3, 7, 3));
      }
    }
    return out;
  }

  // ---- SVG を文字列で作る ----
  const X = (p) => p[0].toFixed(1);
  const Y = (p) => (GROUND - p[1]).toFixed(1);
  const pts = (...ps) => ps.map((p) => `${X(p)},${Y(p)}`).join(' ');

  function propSvg(pr) {
    const g = GROUND;
    if (pr.t === 'bench') {
      const top = g - pr.y;
      return `<rect class="fig-prop" x="${pr.x1}" y="${top - 4}" width="${pr.x2 - pr.x1}" height="5" rx="2"/>
        <line class="fig-prop-line" x1="${pr.x1 + 6}" y1="${top}" x2="${pr.x1 + 6}" y2="${g}"/>
        <line class="fig-prop-line" x1="${pr.x2 - 6}" y1="${top}" x2="${pr.x2 - 6}" y2="${g}"/>`;
    }
    if (pr.t === 'pad') {
      const mid = [(pr.a[0] + pr.b[0]) / 2, (pr.a[1] + pr.b[1]) / 2];
      return `<line class="fig-pad" x1="${X(pr.a)}" y1="${Y(pr.a)}" x2="${X(pr.b)}" y2="${Y(pr.b)}"/>
        ${pr.strut ? `<line class="fig-prop-line" x1="${X(mid)}" y1="${Y(mid)}" x2="${X(mid)}" y2="${g}"/><line class="fig-prop-line" x1="${X(mid) - 14}" y1="${g}" x2="${+X(mid) + 14}" y2="${g}"/>` : ''}`;
    }
    if (pr.t === 'bar' || pr.t === 'dip') {
      const y = g - pr.y;
      return `<line class="fig-bar" x1="${pr.x1}" y1="${y}" x2="${pr.x2}" y2="${y}"/>
        <line class="fig-prop-line" x1="${pr.x2}" y1="${y}" x2="${pr.x2}" y2="${g}"/>
        ${pr.t === 'bar' ? `<line class="fig-prop-line" x1="${pr.x1}" y1="${y}" x2="${pr.x1}" y2="${g}"/>` : ''}`;
    }
    if (pr.t === 'box') return `<rect class="fig-prop" x="${pr.x1}" y="${g - pr.y}" width="${pr.x2 - pr.x1}" height="${pr.y}" rx="2"/>`;
    return '';
  }

  const dbSvg = (p, r = 5, cls = 'fig-db') => `<circle class="${cls}" cx="${X(p)}" cy="${Y(p)}" r="${r}"/>`;

  function svg(exId, k = 0) {
    const def = FIG[exId];
    if (!def) return '';
    const p = lerpPose(def.poses[0], def.poses[1], k);
    const j = joints(p, def.view);
    const front = def.view === 'front';
    const ms = muscleShapes(def, j);
    const parts = [];
    parts.push(`<line class="fig-ground" x1="0" y1="${GROUND}" x2="200" y2="${GROUND}"/>`);
    (def.props || []).forEach((pr) => parts.push(propSvg(pr)));
    // 奥側の手足（薄く）
    parts.push(`<polyline class="fig-far" points="${pts(j.HF, j.K2, j.A2, j.T2)}"/>`);
    parts.push(`<polyline class="fig-far" points="${pts(j.SF, j.E2, j.W2)}"/>`);
    if (def.db === 'both') parts.push(dbSvg(j.W2, 5, 'fig-db far'));
    // 胴体
    if (front) {
      parts.push(`<polyline class="fig-body" points="${pts(j.SF, j.SN)}"/>`);
      parts.push(`<polyline class="fig-body" points="${pts(j.HF, j.HN)}"/>`);
    }
    parts.push(`<polyline class="fig-body" points="${pts(j.H, j.S)}"/>`);
    // 手前の手足
    parts.push(`<polyline class="fig-body" points="${pts(j.HN, j.K, j.A, j.T)}"/>`);
    if (front) parts.push(`<polyline class="fig-body" points="${pts(j.HF, j.K2, j.A2, j.T2)}"/><polyline class="fig-body" points="${pts(j.SF, j.E2, j.W2)}"/>`);
    parts.push(`<polyline class="fig-body" points="${pts(j.SN, j.E, j.W)}"/>`);
    parts.push(`<circle class="fig-head" cx="${X(j.head)}" cy="${Y(j.head)}" r="${L.head}"/>`);
    // 効く部位
    ms.forEach((m) => parts.push(`<ellipse class="fig-blob" cx="${X(m.c)}" cy="${Y(m.c)}" rx="${m.rx}" ry="${m.ry}" transform="rotate(${(-m.rot).toFixed(1)} ${X(m.c)} ${Y(m.c)})"/>`));
    // ダンベル
    if (def.db === 'both' || def.db === 'one') parts.push(dbSvg(j.W));
    if (def.db === 'both' && front) parts.push(dbSvg(j.W2));
    if (def.db === 'goblet') parts.push(dbSvg(j.W, 6.5));
    if (def.db === 'hip') parts.push(dbSvg(add(j.H, dir(angleOf(sub(j.S, j.H)) - 90, 8)), 6.5));
    return `<svg class="fig" viewBox="0 0 200 150" role="img" aria-label="動きの図">${parts.join('')}</svg>`;
  }

  // ---- アニメーション ----
  // 1周：始めで止まる → 終わりへ → 終わりで止まる → 始めへ戻る
  const PERIOD = 2800;
  const ease = (x) => (1 - Math.cos(Math.PI * x)) / 2;
  function phase(t) {
    const p = (t % PERIOD) / PERIOD;
    if (p < 0.15) return 0;
    if (p < 0.5) return ease((p - 0.15) / 0.35);
    if (p < 0.65) return 1;
    return 1 - ease((p - 0.65) / 0.35);
  }
  const live = new Set();
  let raf = 0, lastFrame = 0;
  function loop(now) {
    raf = 0;
    if (now - lastFrame >= 33) { // 約30コマ/秒で十分
      lastFrame = now;
      live.forEach((st) => {
        if (!st.el.isConnected) { live.delete(st); return; }
        if (st.paused) return;
        const k = phase(now - st.t0);
        if (Math.abs(k - st.k) > 0.004 || st.k < 0) { st.k = k; st.el.innerHTML = svg(st.exId, k); }
      });
    }
    if (live.size) raf = requestAnimationFrame(loop);
  }
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // el に図を表示する。animate=false なら止まった絵（終わりの姿勢）
  function mount(el, exId, { animate = true } = {}) {
    const st = { el, exId, t0: performance.now(), k: -1, paused: !animate || reduceMotion() };
    const still = !animate ? 1 : 0;
    el.innerHTML = svg(exId, still);
    st.k = still;
    live.add(st);
    if (!raf) raf = requestAnimationFrame(loop);
    return {
      get paused() { return st.paused; },
      toggle() { st.paused = !st.paused; if (!st.paused) { st.t0 = performance.now() - (st.k >= 1 ? PERIOD * 0.5 : 0); if (!raf) raf = requestAnimationFrame(loop); } return st.paused; },
      show(k) { st.paused = true; st.k = k; el.innerHTML = svg(exId, k); },
    };
  }

  const has = (exId) => !!FIG[exId];
  const caption = (exId) => (FIG[exId] && FIG[exId].caption) || '';

  return { svg, mount, has, caption };
})();
