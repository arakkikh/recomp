// ② 体組成：日付ごとの手入力・前回比・リコンプの進み具合・推移グラフ
const Body = (() => {
  const { esc, num } = UI;
  let root;
  let metric = 'fatKg';
  let range = 'all'; // all | 90 | 30

  // good: 1=増えると良い / -1=減ると良い / 0=どちらでもない
  const FIELDS = [
    { k: 'weight', label: '体重', unit: 'kg', dec: 2, good: 0 },
    { k: 'fatPct', label: '体脂肪率', unit: '%', dec: 1, good: -1 },
    { k: 'bmi', label: 'BMI', unit: '', dec: 1, good: 0 },
    { k: 'muscleKg', label: '筋肉量', unit: 'kg', dec: 1, good: 1 },
    { k: 'muscleScore', label: '筋肉スコア', unit: '', dec: 0, good: 1, select: [-4, -3, -2, -1, 0, 1, 2, 3, 4] },
    { k: 'visceral', label: '内臓脂肪レベル', unit: '', dec: 1, good: -1 },
    { k: 'boneKg', label: '推定骨量', unit: 'kg', dec: 1, good: 1 },
    { k: 'bmr', label: '基礎代謝', unit: 'kcal', dec: 0, good: 1 },
    { k: 'bodyAge', label: '体内年齢', unit: '才', dec: 0, good: -1 },
  ];
  // 入力値から計算する項目（リコンプの成果が一番わかる）
  const DERIVED = [
    { k: 'fatKg', label: '体脂肪量', unit: 'kg', dec: 1, good: -1, calc: (e) => (e.weight != null && e.fatPct != null ? (e.weight * e.fatPct) / 100 : null) },
    { k: 'lbm', label: '除脂肪体重', unit: 'kg', dec: 1, good: 1, calc: (e) => (e.weight != null && e.fatPct != null ? e.weight * (1 - e.fatPct / 100) : null) },
  ];
  const ALL = [...DERIVED, ...FIELDS];
  const META = Object.fromEntries(ALL.map((f) => [f.k, f]));

  const entries = () => Store.data.body.slice().sort((a, b) => a.date.localeCompare(b.date));
  const val = (e, k) => (META[k].calc ? META[k].calc(e) : e[k] ?? null);
  const fmt = (k, v) => (v == null ? '—' : Number(v).toFixed(META[k].dec));
  const unitOf = (k) => META[k].unit;

  // 前回比の表示（色＋矢印＋言葉。色だけに頼らない）
  function delta(k, cur, prev) {
    if (cur == null || prev == null) return '';
    const d = cur - prev;
    const f = META[k];
    const r = Math.round(d * Math.pow(10, f.dec)) / Math.pow(10, f.dec);
    if (r === 0) return '<span class="delta flat">± 0</span>';
    const dir = r > 0 ? '▲' : '▼';
    const cls = f.good === 0 ? 'flat' : Math.sign(r) === f.good ? 'good' : 'bad';
    const sign = r > 0 ? '+' : '−';
    return `<span class="delta ${cls}">${dir} ${sign}${Math.abs(r).toFixed(f.dec)}</span>`;
  }

  // ================= 画面描画 =================
  function render(el) {
    root = el;
    const es = entries();
    el.innerHTML = es.length ? summaryHtml(es) + recompHtml(es) + chartHtml() + listHtml(es) + ctaHtml() : emptyHtml() + ctaHtml();
    el.onclick = onClick;
    el.onchange = null;
    if (es.length) drawChart();
  }

  const ctaHtml = () => '<div class="bottom-cta"><button class="btn primary big" data-act="add">＋ 測定結果を記録</button></div>';

  function emptyHtml() {
    return `<div class="card">
      <h3>体組成を記録しましょう</h3>
      <p class="muted">体組成計で測った値を、日付ごとに入力します。入力した項目だけ記録されるので、全部埋めなくても大丈夫です。</p>
      <p class="hint">毎回同じ条件（例：起床後・トイレの後・朝食前）で測ると、変化が正しく見えます。</p>
    </div>`;
  }

  function summaryHtml(es) {
    const last = es[es.length - 1];
    const prev = es.length > 1 ? es[es.length - 2] : null;
    const tiles = FIELDS.filter((f) => last[f.k] != null).map((f) => `
      <div class="tile">
        <div class="tile-label">${f.label}</div>
        <div class="tile-val">${fmt(f.k, last[f.k])}<small>${f.unit}</small></div>
        ${prev ? delta(f.k, last[f.k], prev[f.k]) : ''}
      </div>`).join('');
    return `<div class="card">
      <div class="row between"><h3>最新 ${UI.fmtDate(last.date)}</h3>${prev ? `<span class="muted small">前回 ${UI.fmtShort(prev.date)} との差</span>` : ''}</div>
      <div class="tiles">${tiles}</div>
    </div>`;
  }

  // 記録開始からの変化：脂肪が減り、除脂肪（筋肉など）が増えていればリコンプ成功
  function recompHtml(es) {
    const withFat = es.filter((e) => e.weight != null && e.fatPct != null);
    if (withFat.length < 2) {
      return '<div class="card"><h3>リコンプの進み具合</h3><p class="muted small">体重と体脂肪率を2回以上記録すると、「脂肪が何kg減って、筋肉などが何kg増えたか」が表示されます。</p></div>';
    }
    const a = withFat[0], b = withFat[withFat.length - 1];
    const days = Math.round((UI.parseDate(b.date) - UI.parseDate(a.date)) / 864e5);
    const row = (k) => `<div class="recomp-row"><span>${META[k].label}</span><span>${fmt(k, val(a, k))} → <b>${fmt(k, val(b, k))}</b>${unitOf(k)}</span>${delta(k, val(b, k), val(a, k))}</div>`;
    const fatDown = val(b, 'fatKg') < val(a, 'fatKg');
    const lbmUp = val(b, 'lbm') > val(a, 'lbm');
    const msg = fatDown && lbmUp ? '✓ 脂肪が減って、除脂肪体重が増えています。順調です。'
      : fatDown ? '脂肪は減っています。タンパク質と筋トレの継続で除脂肪体重も増やしましょう。'
      : lbmUp ? '除脂肪体重は増えています。夕食の時間と量を見直すと脂肪も減りやすくなります。'
      : '変化はこれからです。体組成は2〜4週間単位で見ましょう。';
    return `<div class="card">
      <h3>リコンプの進み具合 <small class="muted">${UI.fmtShort(a.date)}から${days}日</small></h3>
      ${row('weight')}${row('fatKg')}${row('lbm')}
      ${[a, b].every((e) => e.visceral != null) ? row('visceral') : ''}
      <p class="small mt">${msg}</p>
    </div>`;
  }

  function chartHtml() {
    const ranges = [['all', '全期間'], ['90', '3か月'], ['30', '1か月']];
    return `<div class="card">
      <div class="chips scroll">${ALL.map((f) => `<button class="chip ${f.k === metric ? 'on' : ''}" data-act="metric" data-k="${f.k}">${f.label}</button>`).join('')}</div>
      <div class="row between">
        <h3 class="chart-title">${META[metric].label}${unitOf(metric) ? `（${unitOf(metric)}）` : ''}</h3>
        <div class="seg seg-sm">${ranges.map(([k, l]) => `<button class="${range === k ? 'on' : ''}" data-act="range" data-r="${k}">${l}</button>`).join('')}</div>
      </div>
      <div id="bchart"></div>
      <p class="hint">${hintFor(metric)}グラフをタップすると値が出ます。</p>
    </div>`;
  }

  function hintFor(k) {
    return {
      fatKg: '体脂肪量＝体重×体脂肪率。リコンプでは体重よりこちらを見ます。',
      lbm: '除脂肪体重＝体重−体脂肪量（筋肉・骨・水分など）。増えていれば筋肉がついている目安です。',
      visceral: '点線は「標準」の上限（9.5）です。',
      fatPct: `点線は目標（${Store.data.settings.goalFatPct}%、設定で変更可）です。`,
      weight: '体重は水分で1日1kg前後動きます。週単位の傾向を見ましょう。',
    }[k] || '';
  }

  function drawChart() {
    const el = root.querySelector('#bchart');
    if (!el) return;
    let es = entries();
    if (range !== 'all') {
      const from = new Date(); from.setDate(from.getDate() - Number(range));
      const fs = UI.dateStr(from);
      es = es.filter((e) => e.date >= fs);
    }
    const pts = es.map((e) => ({ x: e.date, y: val(e, metric) })).filter((p) => p.y != null)
      .map((p) => ({ x: p.x, y: Math.round(p.y * Math.pow(10, META[metric].dec)) / Math.pow(10, META[metric].dec) }));
    const ref = metric === 'visceral' ? { y: 9.5, label: '標準の上限' }
      : metric === 'fatPct' ? { y: Store.data.settings.goalFatPct, label: '目標' } : null;
    Chart.line(el, pts, { unit: unitOf(metric), label: `${META[metric].label}の推移`, ref, fmt: (n) => fmt(metric, n) });
  }

  function listHtml(es) {
    const cols = ['weight', 'fatPct', 'muscleKg', 'visceral'];
    const rows = es.slice().reverse().map((e) => `
      <tr data-act="edit" data-date="${e.date}">
        <td>${UI.fmtShort(e.date)}</td>${cols.map((k) => `<td>${fmt(k, e[k])}</td>`).join('')}<td class="chev">›</td>
      </tr>`).join('');
    return `<div class="card">
      <h3>記録一覧</h3>
      <table class="tbl tbl-num">
        <thead><tr><th>日付</th><th>体重</th><th>体脂肪%</th><th>筋肉kg</th><th>内臓</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="hint">行をタップすると、全項目の確認・修正・削除ができます。</p>
    </div>`;
  }

  // ================= 操作 =================
  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    switch (b.dataset.act) {
      case 'add': openForm(UI.dateStr()); break;
      case 'edit': openForm(b.dataset.date); break;
      case 'metric': metric = b.dataset.k; render(root); break;
      case 'range': range = b.dataset.r; render(root); break;
    }
  }

  // ---- 入力シート ----
  function openForm(date) {
    const find = (d) => Store.data.body.find((x) => x.date === d);
    const last = entries().slice(-1)[0] || {};
    const fieldHtml = (f) => {
      if (f.select) {
        return `<label class="bf"><span>${f.label}</span>
          <select data-k="${f.k}"><option value="">—</option>${f.select.map((v) => `<option value="${v}">${v > 0 ? '+' + v : v}</option>`).join('')}</select></label>`;
      }
      return `<label class="bf"><span>${f.label}${f.unit ? ` <small>${f.unit}</small>` : ''}</span>
        <input data-k="${f.k}" type="text" inputmode="decimal" autocomplete="off" placeholder="${last[f.k] != null ? fmt(f.k, last[f.k]) : ''}"></label>`;
    };
    const html = `
      <h3>測定結果を記録</h3>
      <label class="bf bf-date"><span>測定日</span><input type="date" id="b-date" value="${date}" max="${UI.dateStr()}"></label>
      <p class="hint" id="b-mode"></p>
      <div class="bform">${FIELDS.map(fieldHtml).join('')}</div>
      <p class="hint">薄い文字は前回の値です。空欄の項目は記録しません。</p>
      <button class="btn primary big" data-b="save">保存</button>
      <div class="row gap mt"><button class="btn ghost danger" data-b="delete" id="b-del" hidden>この日の記録を削除</button></div>`;

    UI.sheet(html, (sh) => {
      const dateIn = sh.querySelector('#b-date');
      const fill = () => {
        const ex = find(dateIn.value);
        FIELDS.forEach((f) => { sh.querySelector(`[data-k="${f.k}"]`).value = ex && ex[f.k] != null ? String(ex[f.k]) : ''; });
        sh.querySelector('#b-mode').textContent = ex ? 'この日の記録があります。修正して保存すると上書きされます。' : '';
        sh.querySelector('#b-del').hidden = !ex;
      };
      fill();
      dateIn.addEventListener('change', fill);

      sh.addEventListener('click', (e) => {
        const b = e.target.closest('[data-b]');
        if (!b) return;
        const d = dateIn.value;
        if (!d) { UI.toast('測定日を入れてください'); return; }
        if (b.dataset.b === 'delete') {
          if (!confirm(`${UI.fmtDate(d)} の記録を削除しますか？`)) return;
          Store.data.body = Store.data.body.filter((x) => x.date !== d);
          Store.save(); UI.closeSheet(); render(root); UI.toast('削除しました');
          return;
        }
        const entry = { date: d };
        const bad = [];
        FIELDS.forEach((f) => {
          const raw = sh.querySelector(`[data-k="${f.k}"]`).value.trim().replace(',', '.').replace('−', '-');
          if (raw === '') return;
          const v = parseFloat(raw);
          if (!Number.isFinite(v) || (!f.select && v < 0)) bad.push(f.label); else entry[f.k] = v;
        });
        if (bad.length) { UI.toast(`数字を確認してください：${bad.join('、')}`); return; }
        if (Object.keys(entry).length === 1) { UI.toast('1つ以上の項目を入力してください'); return; }
        Store.data.body = Store.data.body.filter((x) => x.date !== d).concat(entry);
        Store.save(); UI.closeSheet(); render(root); UI.toast('保存しました');
      });
    });
  }

  return { render, title: '体組成', FIELDS, entries, val };
})();
