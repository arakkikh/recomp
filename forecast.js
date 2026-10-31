// 将来予測のガイド：今のトレーニングと食事を続けた場合の 1・3・6・12か月後の目安
// 40代男性・筋トレ初心者の現実的なペースを前提に、「控えめ／標準／順調」の幅で示す。
// 記録が4週間分以上あれば、週平均の実際の推移で補正する。
const Forecast = (() => {
  const { esc } = UI;
  let metric = 'fatPct';
  const MONTH_DAYS = 30.44;
  const HORIZONS = [1, 3, 6, 12];

  // 1か月あたりの変化（初心者の最初の半年）。内臓脂肪は「体脂肪1kg減あたり」の下がり幅
  const MODEL = {
    low: { name: '控えめ', fat: -0.2, muscle: 0.1, vPerFat: 0.3 },
    mid: { name: '標準', fat: -0.45, muscle: 0.25, vPerFat: 0.4 },
    high: { name: '順調', fat: -0.8, muscle: 0.4, vPerFat: 0.5 },
  };
  const SC = ['low', 'mid', 'high'];
  // 実際の推移として採用する範囲（測定のぶれで極端な値にならないように）
  const CLAMP = { fat: [-2, 1], muscle: [-0.5, 0.8], visceral: [-1, 0.5] };

  const METRICS = {
    weight: { label: '体重', unit: 'kg', dec: 1 },
    fatPct: { label: '体脂肪率', unit: '%', dec: 1 },
    muscleKg: { label: '筋肉量', unit: 'kg', dec: 1 },
    visceral: { label: '内臓脂肪レベル', unit: '', dec: 1 },
  };
  const f1 = (k, v) => (v == null ? '—' : Number(v).toFixed(METRICS[k].dec));
  const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
  const addDays = (s, n) => { const d = UI.parseDate(s); d.setDate(d.getDate() + Math.round(n)); return UI.dateStr(d); };

  // ================= 週平均 =================
  function weekly() {
    const map = new Map();
    Body.entries().forEach((e) => {
      const ws = UI.dateStr(UI.weekStart(UI.parseDate(e.date)));
      if (!map.has(ws)) map.set(ws, []);
      map.get(ws).push(e);
    });
    return [...map.entries()].map(([week, arr]) => {
      const avg = (vals) => { const v = vals.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      return {
        week,
        date: arr[arr.length - 1].date, // その週の最後の測定日
        n: arr.length,
        weight: avg(arr.map((e) => e.weight)),
        fatPct: avg(arr.map((e) => e.fatPct)),
        muscleKg: avg(arr.map((e) => e.muscleKg)),
        visceral: avg(arr.map((e) => e.visceral)),
        fatKg: avg(arr.map((e) => (e.weight != null && e.fatPct != null ? (e.weight * e.fatPct) / 100 : null))),
      };
    });
  }

  // 週平均の傾き（1か月あたり、最小二乗法）。4週以上・3週間以上の幅がないときは null
  function slope(ws, key) {
    const pts = ws.filter((w) => w[key] != null).map((w) => ({ t: (UI.parseDate(w.week) - UI.parseDate(ws[0].week)) / 864e5 / MONTH_DAYS, v: w[key] }));
    if (pts.length < 4 || pts[pts.length - 1].t * MONTH_DAYS < 21) return null;
    const n = pts.length;
    const mt = pts.reduce((a, p) => a + p.t, 0) / n;
    const mv = pts.reduce((a, p) => a + p.v, 0) / n;
    const den = pts.reduce((a, p) => a + (p.t - mt) ** 2, 0);
    return den ? pts.reduce((a, p) => a + (p.t - mt) * (p.v - mv), 0) / den : null;
  }

  // ================= 予測の計算 =================
  function compute() {
    const ws = weekly();
    if (!ws.length) return { ok: false, reason: '体組成を記録すると、将来の目安が表示されます。' };
    const latest = (k) => { for (let i = ws.length - 1; i >= 0; i--) if (ws[i][k] != null) return ws[i][k]; return null; };
    const lastW = ws[ws.length - 1];
    const base = { weight: latest('weight'), fatPct: latest('fatPct'), muscleKg: latest('muscleKg'), visceral: latest('visceral') };
    if (base.weight == null || base.fatPct == null) return { ok: false, reason: '体重と体脂肪率を記録すると、将来の目安が表示されます。' };
    const fat0 = (base.weight * base.fatPct) / 100;
    const lean0 = base.weight - fat0;

    // 実績での補正
    const fatW = ws.filter((w) => w.fatKg != null);
    const weeks = fatW.length;
    const spanDays = weeks ? (UI.parseDate(fatW[weeks - 1].week) - UI.parseDate(fatW[0].week)) / 864e5 : 0;
    const act = { fat: slope(ws, 'fatKg'), muscle: slope(ws, 'muscleKg'), visceral: slope(ws, 'visceral') };
    for (const k in act) if (act[k] != null) act[k] = clamp(act[k], CLAMP[k]);
    const on = act.fat != null;
    const w = on ? Math.min(0.8, 0.3 + 0.05 * (weeks - 4)) : 0; // 記録が長いほど実績を重く
    const blend = (model, actual) => (actual == null ? model : model * (1 - w) + actual * w);

    const midFat = blend(MODEL.mid.fat, on ? act.fat : null);
    const midMus = blend(MODEL.mid.muscle, on ? act.muscle : null);
    const midV = blend(MODEL.mid.vPerFat * MODEL.mid.fat, on ? act.visceral : null);
    const rates = {};
    SC.forEach((s) => {
      const fat = midFat + (MODEL[s].fat - MODEL.mid.fat);
      rates[s] = {
        fat,
        muscle: midMus + (MODEL[s].muscle - MODEL.mid.muscle),
        visceral: midV + (MODEL[s].vPerFat * MODEL[s].fat - MODEL.mid.vPerFat * MODEL.mid.fat),
      };
    });

    // 24か月分を1か月ずつ計算
    const sim = {};
    SC.forEach((s) => {
      const r = rates[s];
      let fat = fat0, mus = base.muscleKg ?? 0, lean = lean0, v = base.visceral;
      const rows = [{ weight: base.weight, fatPct: base.fatPct, muscleKg: base.muscleKg, visceral: base.visceral }];
      for (let m = 1; m <= 24; m++) {
        const weight = fat + lean;
        // 体脂肪率が10%に近づくほど落ちにくくなる
        const slow = base.fatPct <= 12 ? 0.25 : clamp(((fat / weight) * 100 - 10) / (base.fatPct - 10), [0.25, 1]);
        // 筋肉の伸びは最初の半年が一番大きく、その後ゆるやかになる
        const musFactor = m <= 6 ? 1 : m <= 12 ? 0.6 : 0.4;
        const dFat = r.fat < 0 ? r.fat * slow : r.fat;
        const dMus = r.muscle > 0 ? r.muscle * musFactor : r.muscle;
        fat = Math.max(fat + dFat, (fat + lean) * 0.06);
        mus += dMus;
        lean += dMus;
        if (v != null) v = Math.max(1, v + (r.visceral < 0 ? r.visceral * slow : r.visceral));
        const wt = fat + lean;
        rows.push({ weight: wt, fatPct: (fat / wt) * 100, muscleKg: base.muscleKg != null ? mus : null, visceral: v });
      }
      sim[s] = rows;
    });

    const at = (k, m) => {
      const vals = SC.map((s) => sim[s][m][k]);
      if (vals.some((x) => x == null)) return null;
      return { mid: sim.mid[m][k], lo: Math.min(...vals), hi: Math.max(...vals) };
    };

    return { ok: true, ws, lastW, base, rates, act, on, w, weeks, spanDays, sim, at, baseDate: lastW.date };
  }

  // 目標に届く月（届かなければ null）
  function reachMonth(rows, k, goal, down) {
    for (let m = 1; m < rows.length; m++) {
      const v = rows[m][k];
      if (v == null) return null;
      if (down ? v <= goal : v >= goal) return m;
    }
    return null;
  }
  const monthText = (m) => (m == null ? '2年以上' : m < 12 ? `約${m}か月` : m === 12 ? '約1年' : m < 24 ? `約1年${m - 12}か月` : '約2年');

  function goals() {
    const s = Store.data.settings;
    return [
      ['fatPct', s.goalFatPct],
      ['visceral', s.goalVisceral],
      ['muscleKg', s.goalMuscleKg],
      ['weight', s.goalWeight],
    ].filter(([, g]) => g != null && g !== '');
  }

  function goalHtml(r) {
    const items = goals().map(([k, g]) => {
      const cur = r.base[k];
      const M = METRICS[k];
      if (cur == null) return '';
      // 体脂肪率・内臓脂肪は「目標以下」、筋肉量は「目標以上」、体重は「目標に近づく」で判定
      const down = k === 'muscleKg' ? false : k === 'weight' ? g < cur : true;
      const done = k === 'weight' ? Math.abs(cur - g) < 0.3 : down ? cur <= g : cur >= g;
      if (done) return `<li><b>✓ ${M.label} ${f1(k, g)}${M.unit}</b><span class="muted">すでに目標に届いています。維持していきましょう。</span></li>`;
      const mm = reachMonth(r.sim.mid, k, g, down);
      const mh = reachMonth(r.sim.high, k, g, down);
      const ml = reachMonth(r.sim.low, k, g, down);
      const range = `順調なら${monthText(mh)}、控えめだと${monthText(ml)}`;
      return `<li><b>🎯 ${M.label} ${f1(k, g)}${M.unit}（今 ${f1(k, cur)}${M.unit}）</b>${mm != null
        ? `このままだと<b class="inline">${monthText(mm)}</b>で達成見込み（${range}）`
        : `今のペースだと2年以内の達成は難しい見込みです（${range}）。ペースを上げる工夫を検討しましょう。`}</li>`;
    }).join('');
    return items ? `<h4>目標までの見込み</h4><ul class="goal-list">${items}</ul>` : '<p class="hint">設定タブで目標（体脂肪率・内臓脂肪・筋肉量・体重）を入れると、達成までの見込みが表示されます。</p>';
  }

  // ================= 画面 =================
  function html() {
    const r = compute();
    if (!r.ok) return `<div class="card"><div class="row between"><h3>将来予測のガイド</h3><span class="tag">あくまで目安</span></div><p class="muted small">${esc(r.reason)}</p></div>`;
    const avail = Object.keys(METRICS).filter((k) => r.base[k] != null);
    if (!avail.includes(metric)) metric = avail[0];
    const M = METRICS[metric];
    const rows = HORIZONS.map((m) => {
      const a = r.at(metric, m);
      return `<tr><td>${m === 12 ? '1年後' : `${m}か月後`}</td><td>${f1(metric, a.mid)}${M.unit}</td><td class="muted">${f1(metric, a.lo)}〜${f1(metric, a.hi)}</td></tr>`;
    }).join('');
    const lastW = r.lastW;
    const weekEnd = addDays(lastW.week, 6);
    return `<div class="card">
      <div class="row between"><h3>将来予測のガイド</h3><span class="tag">あくまで目安</span></div>
      <p class="muted small">今のトレーニングと食事を続けた場合の目安です。起点は直近の週の平均（${UI.fmtShort(lastW.week)}〜${UI.fmtShort(weekEnd)}、${lastW.n}回の測定）です。</p>
      <div class="chips">${avail.map((k) => `<button class="chip ${k === metric ? 'on' : ''}" data-act="fmetric" data-k="${k}">${METRICS[k].label}</button>`).join('')}</div>
      <div id="fchart"></div>
      <div class="fc-legend"><span><i></i>実績（週平均）</span><span><i class="dash"></i>予測（標準）</span><span><i class="band"></i>幅（控えめ〜順調）</span></div>
      <table class="tbl fc-table mt">
        <thead><tr><th>時期</th><th>標準</th><th>幅（控えめ〜順調）</th></tr></thead>
        <tbody><tr><td>今（週平均）</td><td>${f1(metric, r.base[metric])}${M.unit}</td><td></td></tr>${rows}</tbody>
      </table>
      ${goalHtml(r)}
      <div class="calib ${r.on ? 'on' : ''}">${r.on
        ? `✓ 実際の記録（${r.weeks}週分）の推移で補正しています（実績の重み ${Math.round(r.w * 100)}%）。`
        : `記録が4週間分たまると、実際の推移で予測を補正します（今 ${r.weeks}週分）。`}</div>
      <p class="hint">体組成計の値は、水分・食事・測る時間帯で日によってぶれます（体重で±1kg、体脂肪率で±1〜2%ほど）。そのため1回ごとの値ではなく、<b>週ごとの平均</b>で傾向を見ています。毎回同じ条件（例：起床後・トイレの後）で測ると精度が上がります。</p>
      <button class="btn block" data-act="fbasis">計算の根拠</button>
    </div>`;
  }

  function draw(root) {
    const el = root.querySelector('#fchart');
    if (!el) return;
    const r = compute();
    if (!r.ok) return;
    const pts = r.ws.filter((w) => w[metric] != null).map((w) => ({ x: w.date, y: Math.round(w[metric] * 10) / 10 }));
    const fc = [{ x: r.baseDate, y: r.base[metric], lo: r.base[metric], hi: r.base[metric] }]
      .concat(HORIZONS.map((m) => {
        const a = r.at(metric, m);
        const name = m === 12 ? '1年後' : `${m}か月後`;
        // 1か月後は軸の上で「今」と近く文字が重なるので、軸ラベルは出さずタップで見られるようにする
        return { x: addDays(r.baseDate, m * MONTH_DAYS), y: a.mid, lo: a.lo, hi: a.hi, label: m === 1 ? '' : name, tip: name };
      }))
      .map((p) => ({ ...p, y: Math.round(p.y * 10) / 10, lo: Math.round(p.lo * 10) / 10, hi: Math.round(p.hi * 10) / 10 }));
    Chart.line(el, pts, { unit: METRICS[metric].unit, label: `${METRICS[metric].label}の予測`, forecast: fc, fmt: (n) => f1(metric, n), pointLabel: '（週平均）' });
  }

  function openBasis() {
    const r = compute();
    const s = Store.data.settings;
    const pace = (v, u) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(2)}${u}/月`);
    const rateRow = (label, k, u, dig = 2) => `<tr><td>${label}</td>${SC.map((sc) => `<td>${r.ok ? (r.rates[sc][k] > 0 ? '+' : r.rates[sc][k] < 0 ? '−' : '±') + Math.abs(r.rates[sc][k]).toFixed(dig) : '—'}</td>`).join('')}<td class="muted small">${u}</td></tr>`;
    const html = `
      <div class="sheet-head"><button class="back-btn" data-x="back">‹ 戻る</button><h3>計算の根拠</h3></div>
      <div class="basis">
        <p class="calib">この予測は<b>あくまで目安</b>です。体組成計（体に微弱な電流を流して推定する方式）の値には誤差があり、体調・仕事・季節でもペースは変わります。医学的な判断の代わりにはなりません。</p>

        <h4>前提</h4>
        <ul>
          <li>40代男性・筋トレ初心者が、週${s.daysPerWeek}回の筋トレを続ける</li>
          <li>食事は、筋トレの日は消費とほぼ同じ、休みの日は約15%少なめ（週平均で1日あたり約100〜200kcal少なめ）。タンパク質は体重×${s.proteinPerKg}g</li>
          <li>体脂肪1kgは約7,200kcal。1日150kcal少ない状態が続くと、1か月で約0.6kgの脂肪が減る計算</li>
          <li>筋トレ初心者は最初の1年が一番筋肉がつきやすい。ただし40代で、カロリーを少し抑えながらなので、20代より控えめに見積もる</li>
        </ul>

        <h4>1か月あたりの変化（いま使っている値）</h4>
        <table class="tbl small">
          <thead><tr><th></th><th>控えめ</th><th>標準</th><th>順調</th><th></th></tr></thead>
          <tbody>
            ${rateRow('体脂肪量', 'fat', 'kg')}
            ${rateRow('筋肉量', 'muscle', 'kg')}
            ${rateRow('内臓脂肪', 'visceral', 'レベル')}
          </tbody>
        </table>
        <p class="hint">記録がないときの初期値：体脂肪 −0.2／−0.45／−0.8kg、筋肉 +0.1／+0.25／+0.4kg、内臓脂肪は体脂肪が1kg減るごとに −0.3／−0.4／−0.5。</p>

        <h4>計算のしかた</h4>
        <ul>
          <li>1か月ずつ、24か月先まで順に計算</li>
          <li>体重 ＝ 体脂肪量 ＋ 除脂肪量（筋肉・骨・水分など）。筋肉が増えた分だけ除脂肪量も増える</li>
          <li>体脂肪率 ＝ 体脂肪量 ÷ 体重</li>
          <li>体脂肪率が10%に近づくほど、脂肪は落ちにくくなる（ペースを最大で4分の1まで落とす）</li>
          <li>筋肉の増え方は、7〜12か月目は最初の6割、13か月目以降は4割にゆるやかになる</li>
          <li>内臓脂肪は、体脂肪の減り方に合わせて下がる（運動は内臓脂肪から先に減りやすい）。最低は1</li>
        </ul>

        <h4>実際の記録での補正</h4>
        <ul>
          <li>記録を週ごとに平均し、4週間分以上（3週間以上の幅）たまったら、週平均の傾き（最小二乗法）から実際のペースを出す</li>
          <li>「標準」は、初期値と実際のペースを混ぜたもの。実績の重みは4週で30%、そこから1週ごとに5%ずつ増え、最大80%</li>
          <li>「控えめ」「順調」は、標準から初期値の差の分だけずらした幅</li>
          <li>測定のぶれで極端にならないよう、実際のペースには上限・下限を設けています（体脂肪 −2〜+1kg/月、筋肉 −0.5〜+0.8kg/月）</li>
        </ul>
        ${r.ok ? `<p class="calib ${r.on ? 'on' : ''}">${r.on
          ? `いまの実際のペース（${r.weeks}週分の週平均から）：体脂肪 ${pace(r.act.fat, 'kg')}、筋肉 ${pace(r.act.muscle, 'kg')}、内臓脂肪 ${pace(r.act.visceral, '')}。実績の重み ${Math.round(r.w * 100)}%。`
          : `いまは記録が${r.weeks}週分なので、初期値だけで計算しています。`}</p>` : ''}

        <h4>目標の見込み</h4>
        <ul>
          <li>設定タブの目標に、各パターンで何か月目に届くかを表示</li>
          <li>「このままだと」は標準パターンの値です</li>
        </ul>
      </div>
      <div class="row gap mt form-foot"><button class="btn ghost" data-x="back">‹ 戻る</button></div>`;
    UI.sheet(html, (sh) => sh.addEventListener('click', (e) => { if (e.target.closest('[data-x="back"]')) UI.closeSheet(); }));
  }

  function setMetric(k) { if (METRICS[k]) metric = k; }

  return { html, draw, openBasis, setMetric, compute };
})();
