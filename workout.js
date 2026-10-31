// ① トレーニング：メニュー・記録・休憩タイマー・履歴・推移グラフ・種目図鑑
const Workout = (() => {
  const { esc, num } = UI;
  let root;
  let view = 'today';          // today | history | progress | balance | library
  let balWeek = 0;             // 部位タブで見ている週（0=今週, -1=先週…）
  let pickedDay = null;        // 「別のメニューを選ぶ」で選んだ日
  let progressEx = null;
  let progressMetric = null;
  let wakeLock = null;

  const S = () => Store.data;
  const active = () => S().active;
  const U = Exercises.UNIT_LABEL;

  // ================= 画面描画 =================
  function render(el) {
    root = el;
    const tabs = [['today', active() ? '実施中' : '今日'], ['history', '履歴'], ['progress', '推移'], ['balance', '部位'], ['library', '種目']];
    const seg = `<div class="seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="${view === k ? 'on' : ''}" data-act="view" data-v="${k}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (view === 'today') body = active() ? activeHtml() : todayHtml();
    if (view === 'history') body = historyHtml();
    if (view === 'progress') body = progressHtml();
    if (view === 'balance') body = balanceHtml();
    if (view === 'library') body = libraryHtml();
    el.innerHTML = seg + body;
    el.onclick = onClick;
    el.onchange = onChange;
    if (view === 'progress') drawProgress();
    if (view === 'today' && active()) requestWakeLock();
    tick();
  }

  // ---- 今日（開始前）----
  function weekCount() {
    const ws = UI.dateStr(UI.weekStart());
    return S().workouts.filter((w) => w.date >= ws).length;
  }

  function todayHtml() {
    const rot = Program.rotation();
    const dayKey = pickedDay && Program.DAYS[pickedDay] ? pickedDay : Program.nextDay();
    const day = Program.DAYS[dayKey];
    const target = S().settings.daysPerWeek;
    const done = weekCount();
    const items = day.items.map((id) => {
      const ex = Exercises.byId[id];
      const vol = ex.unit === 'sec' || ex.unit === 'min' ? `${ex.range[0]}〜${ex.range[1]}${U[ex.unit]}` : `${ex.sets}×${ex.range[0]}〜${ex.range[1]}回`;
      return `<li><span>${esc(ex.name)}${ex.optional ? ' <small class="muted">任意</small>' : ''}</span><span class="muted">${vol}</span></li>`;
    }).join('');
    return `
      <div class="card">
        <div class="row between"><span class="muted">今週のトレーニング</span><b>${done} / ${target} 回</b></div>
        <div class="meter"><div style="width:${Math.min(100, (done / target) * 100)}%"></div></div>
      </div>
      <div class="card hero">
        <div class="muted">${pickedDay ? '選んだメニュー' : '次のメニュー'}</div>
        <h2>${esc(day.name)}</h2>
        <p class="muted">${esc(day.sub)}</p>
        <ul class="preview">${items}</ul>
      </div>
      <div class="card">
        <h3>別のメニューにする</h3>
        <div class="chips">${rot.map((k) => `<button class="chip ${k === dayKey ? 'on' : ''}" data-act="pick" data-day="${k}">${Program.DAYS[k].name}</button>`).join('')}</div>
      </div>
      <div class="bottom-cta"><button class="btn primary big" data-act="start" data-day="${dayKey}">ワークアウト開始</button></div>`;
  }

  // ---- 実施中 ----
  function setLabel(ex, s) {
    if (ex.unit === 'sec' || ex.unit === 'min') return `<b>${num(s.reps)}</b><small>${U[ex.unit]}</small>`;
    const w = ex.unit === 'bw' ? (s.weight > 0 ? `+${num(s.weight)}<small>kg</small>` : '自重') : `${num(s.weight)}<small>kg</small>`;
    return `<b>${w}</b> × <b>${s.reps}</b><small>回</small>`;
  }

  function activeHtml() {
    const a = active();
    const day = Program.DAYS[a.dayKey];
    const showWu = S().settings.showWarmup !== false;
    const warmed = new Set(); // その日すでに温まっている部位
    const cards = a.items.map((it, i) => {
      const ex = Exercises.byId[it.exId];
      let wuHtml = '';
      const mainGroups = Object.keys(ex.work).filter((k) => ex.work[k] >= 1);
      if (showWu && mainGroups.some((g) => !warmed.has(g))) {
        const wu = Program.warmup(ex.id, (it.sets[0] || {}).weight);
        if (wu && (wu.sets.length || wu.note)) {
          const done = it.wu || [];
          wuHtml = `<div class="wu">
            <div class="wu-head">🔥 ウォームアップ <small class="muted">記録・セット数には入りません</small></div>
            ${wu.note ? `<p class="small wu-note">${esc(wu.note)}</p>` : ''}
            ${wu.sets.length ? `<div class="wu-sets">${wu.sets.map((w, k) => `<button class="wu-chip ${done[k] ? 'done' : ''}" data-act="wu" data-i="${i}" data-s="${k}">${done[k] ? '✓ ' : ''}${esc(w.text)}</button>`).join('<span class="wu-arrow">→</span>')}</div>` : ''}
          </div>`;
        }
      }
      mainGroups.forEach((g) => warmed.add(g)); // メインで使った部位だけ「温まった」とみなす
      const prev = Program.sessionsFor(it.exId)[0];
      const sets = it.sets.map((s, j) => `
        <li class="set ${s.done ? 'done' : ''}">
          <button class="set-main" data-act="edit" data-i="${i}" data-s="${j}" aria-label="セット${j + 1}を編集">
            <span class="set-no">${j + 1}</span>
            <span class="set-val">${setLabel(ex, s)}</span>
            <span class="set-rpe">${s.rpe ? 'RPE ' + s.rpe : ''}</span>
          </button>
          <button class="check" data-act="toggle" data-i="${i}" data-s="${j}" aria-label="完了">✓</button>
        </li>`).join('');
      const doneN = it.sets.filter((s) => s.done).length;
      return `
        <section class="card ex ${doneN && doneN === it.sets.length ? 'ex-done' : ''}">
          <div class="ex-head">
            <button class="fig-thumb" data-act="info" data-ex="${ex.id}" data-i="${i}" aria-label="${esc(ex.name)}の動きとフォームを見る">${Figures.svg(ex.id, 1)}<span class="fig-play">▶</span></button>
            <div class="ex-title">
              <h3>${esc(ex.name)}${ex.perSide ? ' <small class="muted">片側ずつ</small>' : ''}</h3>
              <div class="muscles">${ex.primary.map(esc).join('・')}${ex.secondary.length ? ` <span class="muted">/ ${ex.secondary.map(esc).join('・')}</span>` : ''}</div>
              <button class="link-btn" data-act="info" data-ex="${ex.id}" data-i="${i}">動きとフォームを見る ›</button>
            </div>
          </div>
          <div class="prev">${prev ? `前回 ${UI.fmtShort(prev.date)}：${esc(Program.fmtSets(ex.id, prev.sets))}` : '前回の記録なし'}</div>
          <div class="sug sug-${it.sug.kind}">${{ up: '⬆', down: '⬇', keep: '→', first: '★', max: '★' }[it.sug.kind]} ${esc(it.sug.text)}</div>
          ${wuHtml}
          <ol class="sets">${sets}</ol>
          <div class="row gap">
            <button class="btn small" data-act="addset" data-i="${i}">＋セット</button>
            ${it.sets.length ? `<button class="btn small ghost" data-act="delset" data-i="${i}">− 最後のセット</button>` : ''}
          </div>
        </section>`;
    }).join('');
    return `
      <div class="wk-head">
        <div><h2>${esc(day ? day.name : 'ワークアウト')}</h2><span class="muted">開始から <span id="elapsed">0:00</span></span></div>
        <button class="btn small ghost" data-act="cancel">中止</button>
      </div>
      <p class="hint">セットを終えたら ✓ をタップ → 休憩タイマーが始まります。数字をタップすると重量・回数・RPEを変更できます。</p>
      ${S().settings.showWarmup !== false ? `<div class="card wu-general ${a.gwu ? 'done' : ''}">
        <button class="wu-gen-btn" data-act="gwu">
          <span class="ok-mark ${a.gwu ? 'yes' : 'none'}">${a.gwu ? '✓' : '−'}</span>
          <span><b>はじめに体を温める（約5分）</b><span class="muted small">ステッパー3分 → 肩回し・股関節回し・腕振りを各10回</span></span>
        </button>
      </div>` : ''}
      ${cards}
      <button class="btn block" data-act="addex">＋ 種目を追加</button>
      <div class="bottom-cta"><button class="btn primary big" data-act="finish">ワークアウト完了</button></div>`;
  }

  // ---- 履歴 ----
  function historyHtml() {
    const ws = S().workouts.slice().reverse();
    if (!ws.length) return '<div class="card"><p class="muted center">まだ記録がありません。「今日」からワークアウトを始めましょう。</p></div>';
    return ws.map((w) => {
      const min = w.finishedAt && w.startedAt ? Math.round((w.finishedAt - w.startedAt) / 60000) : null;
      const setsN = w.items.reduce((a, it) => a + it.sets.length, 0);
      const rows = w.items.map((it) => {
        const ex = Exercises.byId[it.exId];
        return ex ? `<li><span>${esc(ex.name)}</span><span class="muted">${esc(Program.fmtSets(it.exId, it.sets))}</span></li>` : '';
      }).join('');
      return `
        <details class="card hist">
          <summary>
            <div><b>${UI.fmtDate(w.date)}</b> ${esc(Program.DAYS[w.dayKey]?.name || '')}</div>
            <div class="muted small">${w.items.length}種目 · ${setsN}セット${min ? ` · ${min}分` : ''}</div>
          </summary>
          <ul class="hist-list">${rows}</ul>
          <button class="btn small ghost danger" data-act="delwk" data-id="${w.id}">この記録を削除</button>
        </details>`;
    }).join('');
  }

  // ---- 推移 ----
  const METRICS = {
    kg: [['e1rm', '推定1RM'], ['maxW', '最大重量'], ['volume', '総負荷量']],
    bw: [['maxReps', '最大回数'], ['maxW', '加重']],
    sec: [['maxReps', '最長秒数']],
    min: [['maxReps', '時間']],
  };

  function progressHtml() {
    const withData = Exercises.list.filter((e) => Program.sessionsFor(e.id).length);
    if (!withData.length) return '<div class="card"><p class="muted center">記録がたまるとここに種目別のグラフが出ます。</p></div>';
    if (!progressEx || !withData.some((e) => e.id === progressEx)) progressEx = withData[0].id;
    const ex = Exercises.byId[progressEx];
    const ms = METRICS[ex.unit];
    if (!ms.some(([k]) => k === progressMetric)) progressMetric = ms[0][0];
    const data = Program.metrics(progressEx).slice().reverse();
    const rows = data.map((d) => `<tr><td>${UI.fmtShort(d.date)}</td><td>${esc(Program.fmtSets(ex.id, d.sets))}</td></tr>`).join('');
    return `
      <div class="card">
        <label class="field"><span>種目</span>
          <select data-act="pex">${withData.map((e) => `<option value="${e.id}" ${e.id === progressEx ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
        </label>
        <div class="chips">${ms.map(([k, l]) => `<button class="chip ${k === progressMetric ? 'on' : ''}" data-act="pmetric" data-m="${k}">${l}</button>`).join('')}</div>
        <h3 class="chart-title">${esc(ms.find(([k]) => k === progressMetric)[1])}</h3>
        <div id="pchart"></div>
        <p class="hint">${progressMetric === 'e1rm' ? '推定1RM＝1回だけ挙げられる重量の推定値（重量×(1+回数÷30)）。重量と回数の伸びをまとめて見られます。' : progressMetric === 'volume' ? '総負荷量＝重量×回数の合計（片手の重量で計算）。' : ''}グラフをタップすると値が出ます。</p>
      </div>
      <div class="card"><h3>記録一覧</h3><table class="tbl"><tbody>${rows}</tbody></table></div>`;
  }

  function drawProgress() {
    const el = root.querySelector('#pchart');
    if (!el) return;
    const ex = Exercises.byId[progressEx];
    const unit = progressMetric === 'maxReps' ? U[ex.unit] : 'kg';
    const pts = Program.metrics(progressEx).map((d) => ({ x: d.date, y: progressMetric === 'e1rm' ? Math.round(d.e1rm * 10) / 10 : d[progressMetric] }));
    Chart.line(el, pts, { unit, label: `${ex.name}の推移`, zero: progressMetric === 'volume' });
  }

  // ---- 部位ごとの週のセット数 ----
  function balanceHtml() {
    const start = UI.weekStart();
    start.setDate(start.getDate() + balWeek * 7);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const from = UI.dateStr(start), to = UI.dateStr(end);
    const counts = Program.groupSets(from, to);
    const isCur = balWeek === 0;
    // 今週は経過日数に応じて「このペースなら」の見込みも出す
    const dayN = isCur ? ((new Date().getDay() + 6) % 7) + 1 : 7;
    const SCALE = 20;
    const fmtN = (n) => (Number.isInteger(n) ? n : n.toFixed(1));
    const low = [];
    const rows = Exercises.GROUPS.map((g) => {
      const n = counts[g.k];
      const st = n < g.min ? 'low' : n > g.max ? 'high' : 'ok';
      if (st === 'low') low.push(g);
      const label = st === 'ok' ? '✓ ちょうど' : st === 'low' ? `▲ あと${fmtN(Math.ceil(g.min - n))}` : '● 多め';
      return `<div class="bal-row">
        <div class="bal-name">${g.label}</div>
        <div class="bal-track" aria-hidden="true">
          <div class="bal-range" style="left:${(g.min / SCALE) * 100}%;width:${((g.max - g.min) / SCALE) * 100}%"></div>
          <div class="bal-bar ${st}" style="width:${Math.min(100, (n / SCALE) * 100)}%"></div>
        </div>
        <div class="bal-num"><b>${fmtN(n)}</b><small>/${g.min}〜${g.max}</small></div>
        <div class="bal-st ${st}">${label}</div>
      </div>`;
    }).join('');
    // 足りない部位を主に鍛える種目（今のメニューにあるものを優先）
    const rot = Program.rotation().flatMap((k) => Program.DAYS[k].items);
    const suggest = low.map((g) => {
      const exs = Exercises.list.filter((e) => (e.work[g.k] || 0) >= 1).sort((a, b) => rot.includes(b.id) - rot.includes(a.id)).slice(0, 2);
      return `<li><b>${g.label}</b>：${exs.map((e) => esc(e.name)).join('、')} などを1〜2セット足す</li>`;
    }).join('');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return `
      <div class="card">
        <div class="row between">
          <button class="icon-btn" data-act="bweek" data-d="-1" aria-label="前の週">‹</button>
          <div class="center"><h3>${isCur ? '今週' : balWeek === -1 ? '先週' : ''}の部位別セット数</h3><span class="muted small">${UI.fmtShort(from)}〜${UI.fmtShort(to)}</span></div>
          <button class="icon-btn" data-act="bweek" data-d="1" aria-label="次の週" ${isCur ? 'disabled' : ''}>›</button>
        </div>
        <div class="bal-legend muted small"><span><i class="bal-key"></i>目安の範囲</span><span>メインで効く種目＝1セット、サブ＝0.5セットで数えています</span></div>
        ${total ? rows : '<p class="muted center mt">この週の記録はまだありません。</p>'}
        ${total && isCur && dayN < 7 ? `<p class="hint">今週はまだ途中（${dayN}日目）です。残りのトレーニングで目安に近づけましょう。</p>` : ''}
      </div>
      ${total && low.length ? `<div class="card"><h3>バランスを整えるヒント</h3><ul class="tips">${suggest}</ul>
        <p class="hint">「ワークアウト中」の画面の一番下の「＋ 種目を追加」から足せます。</p></div>` : ''}
      <div class="card">
        <h3>目安について</h3>
        <p class="small">筋肉を増やすには、1つの部位につき<b>週10セット前後</b>が目安とされています。初心者は少なめでも十分伸びるので、大きな部位（胸・背中・肩・脚）は週8〜16セット、腕・ふくらはぎ・体幹は少なめを目安にしています。</p>
        <p class="hint">きつさの目安：RPE 7〜9（あと1〜3回できる）で行ったセットを数えるのが理想です。ウォームアップは数えません。</p>
      </div>`;
  }

  // ---- 種目図鑑 ----
  function libraryHtml() {
    return Exercises.PARTS.map((p) => {
      const items = Exercises.list.filter((e) => e.part === p).map((e) => `
        <li><button class="list-btn lib-item" data-act="info" data-ex="${e.id}"><span class="fig-thumb sm">${Figures.svg(e.id, 1)}</span><span class="lib-name">${esc(e.name)}<small class="muted">${e.primary.map(esc).join('・')}</small></span><span class="muted">›</span></button></li>`).join('');
      return `<div class="card"><h3>${p}</h3><ul class="list">${items}</ul></div>`;
    }).join('');
  }

  // ================= 操作 =================
  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    UI.unlockAudio();
    const i = +b.dataset.i, s = +b.dataset.s;
    switch (b.dataset.act) {
      case 'view': view = b.dataset.v; render(root); window.scrollTo(0, 0); break;
      case 'pick': pickedDay = b.dataset.day; render(root); break;
      case 'start': start(b.dataset.day); break;
      case 'toggle': toggleSet(i, s); break;
      case 'wu': {
        const it = active().items[i];
        it.wu = it.wu || [];
        it.wu[s] = !it.wu[s];
        if (it.wu[s]) Rest.start(45); // ウォームアップ後は短めの休憩
        persist();
        break;
      }
      case 'gwu': active().gwu = !active().gwu; persist(); break;
      case 'edit': editSet(i, s); break;
      case 'addset': addSet(i); break;
      case 'delset': active().items[i].sets.pop(); persist(); break;
      case 'info': showInfo(b.dataset.ex, b.dataset.i !== undefined ? i : null); break;
      case 'addex': pickExercise(); break;
      case 'finish': finish(); break;
      case 'cancel': cancel(); break;
      case 'delwk': deleteWorkout(b.dataset.id); break;
      case 'pmetric': progressMetric = b.dataset.m; render(root); break;
      case 'bweek': balWeek = Math.min(0, balWeek + Number(b.dataset.d)); render(root); break;
    }
  }
  function onChange(e) {
    if (e.target.dataset.act === 'pex') { progressEx = e.target.value; progressMetric = null; render(root); }
  }

  function persist() { Store.save(); render(root); }

  function newItem(exId) {
    const ex = Exercises.byId[exId];
    const sug = Program.suggest(exId);
    const sets = Array.from({ length: ex.sets }, () => ({ weight: sug.weight || 0, reps: sug.reps, rpe: null, done: false }));
    return { exId, sug, sets };
  }

  function start(dayKey) {
    const day = Program.DAYS[dayKey];
    S().active = { id: UI.uid(), dayKey, date: UI.dateStr(), startedAt: Date.now(), items: day.items.map(newItem), rest: null };
    pickedDay = null;
    persist();
    window.scrollTo(0, 0);
  }

  function addSet(i) {
    const it = active().items[i];
    const last = it.sets[it.sets.length - 1];
    it.sets.push(last ? { ...last, rpe: null, done: false } : { weight: it.sug.weight || 0, reps: it.sug.reps, rpe: null, done: false });
    persist();
  }

  function toggleSet(i, s) {
    const it = active().items[i];
    const set = it.sets[s];
    set.done = !set.done;
    if (set.done) {
      const ex = Exercises.byId[it.exId];
      const sec = ex.rest === 0 ? 0 : ex.rest || S().settings.restSec;
      if (sec) Rest.start(sec);
      // 次の未完了セットへスクロール補助はせず、そのまま
    }
    persist();
  }

  // ---- セット編集シート ----
  function editSet(i, s) {
    const it = active().items[i];
    const ex = Exercises.byId[it.exId];
    const set = { ...it.sets[s] };
    const inc = S().settings.dbIncrementKg;
    const timeUnit = ex.unit === 'sec' || ex.unit === 'min';
    const repStep = timeUnit ? (ex.unit === 'sec' ? 5 : 1) : 1;
    const RPES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
    const stepper = (key, label, step, val, mode) => `
      <label class="field-label">${label}</label>
      <div class="stepper">
        <button class="btn step" data-k="${key}" data-d="${-step}" aria-label="減らす">−</button>
        <input id="in-${key}" type="text" inputmode="${mode}" value="${num(val)}">
        <button class="btn step" data-k="${key}" data-d="${step}" aria-label="増やす">＋</button>
      </div>`;
    const html = `
      ${UI.sheetHead(`${esc(ex.name)} — セット${s + 1}`)}
      ${timeUnit ? '' : stepper('weight', ex.unit === 'bw' ? '加重（kg、自重のみなら0）' : `重量（片手 kg）${ex.note && ex.note.includes('1個') ? ' ※ダンベル1個' : ''}`, inc, set.weight || 0, 'decimal')}
      ${stepper('reps', timeUnit ? `時間（${U[ex.unit]}）` : '回数', repStep, set.reps, 'numeric')}
      <label class="field-label">RPE（きつさ）</label>
      <div class="chips rpe">${RPES.map((r) => `<button class="chip ${set.rpe === r ? 'on' : ''}" data-rpe="${r}">${r}</button>`).join('')}</div>
      <p class="hint">7＝あと3回できる / 8＝あと2回 / 9＝あと1回 / 10＝限界</p>
      <button class="btn primary big" data-save="done">${set.done ? '保存' : '記録して休憩開始'}</button>
      ${UI.sheetFoot(`${set.done ? '<button class="btn ghost" data-save="undone">未完了に戻す</button>' : ''}<button class="btn ghost danger" data-save="delete">セットを削除</button>`)}`;
    UI.sheet(html, (sh) => {
      const read = (k) => { const v = parseFloat((sh.querySelector(`#in-${k}`)?.value || '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
      sh.addEventListener('click', (e) => {
        const st = e.target.closest('[data-k]');
        if (st) {
          const k = st.dataset.k;
          const inp = sh.querySelector(`#in-${k}`);
          const max = k === 'weight' && ex.unit === 'kg' ? S().settings.dbMaxKg : 9999;
          inp.value = num(Math.min(max, Math.max(0, read(k) + parseFloat(st.dataset.d))));
          return;
        }
        const r = e.target.closest('[data-rpe]');
        if (r) {
          const v = parseFloat(r.dataset.rpe);
          set.rpe = set.rpe === v ? null : v;
          sh.querySelectorAll('[data-rpe]').forEach((c) => c.classList.toggle('on', parseFloat(c.dataset.rpe) === set.rpe));
          return;
        }
        const sv = e.target.closest('[data-save]');
        if (!sv) return;
        if (sv.dataset.save === 'delete') { it.sets.splice(s, 1); UI.closeSheet(); persist(); return; }
        if (!timeUnit) set.weight = read('weight');
        set.reps = Math.round(read('reps'));
        const wasDone = it.sets[s].done;
        set.done = sv.dataset.save !== 'undone';
        it.sets[s] = set;
        UI.closeSheet();
        if (set.done && !wasDone) {
          const sec = ex.rest === 0 ? 0 : ex.rest || S().settings.restSec;
          if (sec) Rest.start(sec);
        }
        persist();
      });
    });
  }

  // ---- 種目情報シート（動きの図・効く部位・フォーム・YouTube）----
  function showInfo(exId, itemIndex) {
    const ex = Exercises.byId[exId];
    const inActive = itemIndex !== null && active() && view === 'today';
    const q = encodeURIComponent(`${ex.name.replace(/（.*?）/g, '')} やり方 フォーム`);
    const cap = Figures.caption(exId);
    const html = `
      ${UI.sheetHead(esc(ex.name))}
      <div class="fig-wrap">
        <div class="fig-stage" id="fig-stage"></div>
        <div class="fig-ctrl">
          <button class="chip" data-fig="0">始めの姿勢</button>
          <button class="chip" data-fig="toggle" id="fig-toggle">⏸ 一時停止</button>
          <button class="chip" data-fig="1">終わりの姿勢</button>
        </div>
        <p class="hint center">${cap ? esc(cap) + '<br>' : ''}<span class="fig-key"></span> 色の部分＝主に効く部位</p>
      </div>

      <h4>効く部位</h4>
      <div class="chips static">
        ${ex.primary.map((m) => `<span class="chip on">${esc(m)}</span>`).join('')}
        ${ex.secondary.map((m) => `<span class="chip">${esc(m)}</span>`).join('')}
      </div>
      <p class="muted small">濃い色＝メイン／白＝サブ ・ 目標 ${ex.range[0]}〜${ex.range[1]}${ex.unit === 'kg' || ex.unit === 'bw' ? '回' : U[ex.unit]} × ${ex.sets}セット${ex.rest ? ` ・ 休憩 ${ex.rest}秒` : ''}</p>

      <h4>フォームのポイント</h4>
      <ol class="tips">${ex.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      <h4>よくある間違い</h4>
      <ul class="tips warn">${ex.mistakes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      ${ex.regression ? `<h4>できないとき</h4><p>${esc(ex.regression)}</p>` : ''}
      ${ex.progression ? `<h4>慣れたら</h4><p>${esc(ex.progression)}</p>` : ''}
      ${ex.note ? `<p class="hint">※ ${esc(ex.note)}</p>` : ''}

      <a class="btn block mt yt" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener noreferrer">▶ YouTubeで見る（「${esc(ex.name.replace(/（.*?）/g, ''))}」で検索）</a>
      ${inActive ? '<button class="btn ghost danger block mt" data-rm="1">この種目を今日のメニューから外す</button>' : ''}
      ${UI.sheetFoot()}`;
    UI.sheet(html, (sh) => {
      const fig = Figures.mount(sh.querySelector('#fig-stage'), exId);
      const tg = sh.querySelector('#fig-toggle');
      const syncBtn = () => { tg.textContent = fig.paused ? '▶ 再生' : '⏸ 一時停止'; };
      syncBtn();
      sh.addEventListener('click', (e) => {
        const f = e.target.closest('[data-fig]');
        if (f) {
          if (f.dataset.fig === 'toggle') fig.toggle(); else fig.show(Number(f.dataset.fig));
          syncBtn();
          return;
        }
        if (e.target.closest('[data-rm]')) { active().items.splice(itemIndex, 1); UI.closeSheet(); persist(); }
      });
    });
  }

  // ---- 種目追加シート ----
  function pickExercise() {
    const html = `${UI.sheetHead('種目を追加')}${Exercises.PARTS.map((p) => `
      <h4>${p}</h4><ul class="list">${Exercises.list.filter((e) => e.part === p).map((e) => `<li><button class="list-btn" data-add="${e.id}"><span>${esc(e.name)}</span><span>＋</span></button></li>`).join('')}</ul>`).join('')}
      ${UI.sheetFoot()}`;
    UI.sheet(html, (sh) => sh.addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]');
      if (!b) return;
      active().items.push(newItem(b.dataset.add));
      UI.closeSheet();
      persist();
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
    }));
  }

  // ---- 完了・中止・削除 ----
  function finish() {
    const a = active();
    const items = a.items
      .map((it) => ({ exId: it.exId, sets: it.sets.filter((s) => s.done).map(({ weight, reps, rpe }) => ({ weight: weight || 0, reps, rpe: rpe || null })) }))
      .filter((it) => it.sets.length);
    if (!items.length) {
      if (confirm('完了したセットがありません。記録せずに終了しますか？')) { endActive(); }
      return;
    }
    const undone = a.items.reduce((n, it) => n + it.sets.filter((s) => !s.done).length, 0);
    if (undone && !confirm(`未完了のセットが${undone}つあります。完了したセットだけ記録して終了しますか？`)) return;
    S().workouts.push({ id: a.id, date: a.date, dayKey: a.dayKey, startedAt: a.startedAt, finishedAt: Date.now(), items });
    endActive();
    const sets = items.reduce((n, it) => n + it.sets.length, 0);
    UI.toast(`お疲れさまでした！ ${items.length}種目・${sets}セットを記録しました`);
  }

  function cancel() {
    if (!confirm('このワークアウトを中止しますか？（記録は保存されません）')) return;
    endActive();
  }

  function endActive() {
    S().active = null;
    Rest.stop(true);
    releaseWakeLock();
    persist();
  }

  function deleteWorkout(id) {
    if (!confirm('この記録を削除しますか？')) return;
    S().workouts = S().workouts.filter((w) => w.id !== id);
    persist();
  }

  // ================= 休憩タイマー =================
  // 終了時刻で管理するので、画面ロックやアプリ切替から戻っても正しい残り時間になる
  const Rest = (() => {
    const bar = () => document.getElementById('restbar');
    let finishedShownUntil = 0;

    function start(sec) {
      const a = active();
      if (!a) return;
      a.rest = { endAt: Date.now() + sec * 1000, total: sec };
      finishedShownUntil = 0;
      Store.save();
      update();
    }
    function add(d) {
      const a = active();
      if (!a || !a.rest) return;
      a.rest.endAt = Math.max(Date.now() + 1000, a.rest.endAt + d * 1000);
      a.rest.total = Math.max(a.rest.total, Math.round((a.rest.endAt - Date.now()) / 1000));
      Store.save();
      update();
    }
    function stop(silent) {
      const a = active();
      if (a) { a.rest = null; Store.save(); }
      finishedShownUntil = 0;
      const b = bar();
      if (b) b.hidden = true;
      if (!silent) update();
    }
    function update() {
      const b = bar();
      if (!b) return;
      const a = active();
      const now = Date.now();
      if (!a || !a.rest) {
        if (finishedShownUntil > now) return;
        b.hidden = true; b.classList.remove('finished');
        return;
      }
      const left = (a.rest.endAt - now) / 1000;
      if (left <= 0) {
        a.rest = null;
        Store.save();
        // 終了から10秒以上たってから戻った場合は鳴らさない
        if (left > -10) { UI.beep(3); UI.vibrate([300, 150, 300]); }
        finishedShownUntil = now + 4000;
        b.hidden = false;
        b.classList.add('finished');
        b.querySelector('.rest-time').textContent = '休憩終了！';
        b.querySelector('.rest-fill').style.width = '100%';
        setTimeout(update, 4100);
        return;
      }
      b.hidden = false;
      b.classList.remove('finished');
      b.querySelector('.rest-time').textContent = `休憩 ${UI.fmtClock(left)}`;
      b.querySelector('.rest-fill').style.width = `${(1 - left / a.rest.total) * 100}%`;
    }
    function bind() {
      const b = bar();
      b.addEventListener('click', (e) => {
        const t = e.target.closest('[data-rest]');
        if (!t) return;
        UI.unlockAudio();
        if (t.dataset.rest === 'stop') stop(); else add(+t.dataset.rest);
      });
    }
    return { start, add, stop, update, bind };
  })();

  // 毎秒の更新（経過時間・タイマー）
  function tick() {
    Rest.update();
    const el = document.getElementById('elapsed');
    if (el && active()) el.textContent = UI.fmtClock((Date.now() - active().startedAt) / 1000);
  }

  // ---- 画面を消灯させない（対応ブラウザのみ）----
  async function requestWakeLock() {
    if (wakeLock || !('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (_) { wakeLock = null; }
  }
  function releaseWakeLock() { if (wakeLock) { wakeLock.release(); wakeLock = null; } }

  function init() {
    Rest.bind();
    setInterval(tick, 500);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        tick();
        if (active()) requestWakeLock();
      }
    });
  }

  return { render, init, title: 'トレーニング' };
})();
