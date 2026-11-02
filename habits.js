// ③ 食事・習慣：Blueprintの考え方を、40代の会社員が続けられる形にしたチェックリスト
const Habits = (() => {
  const { esc } = UI;
  let root;
  let date = UI.dateStr();

  const S = () => Store.data;
  const st = () => S().settings;
  const day = (d = date) => S().habits[d] || {};
  const setDay = (patch) => { S().habits[date] = { ...day(), ...patch }; Store.save(); render(root); };

  // ---- 時刻の計算 ----
  const toMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toTime = (min) => { min = ((min % 1440) + 1440) % 1440; return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; };
  // 夜の時刻（夕方〜明け方）を比べるため、12時より前は翌日扱いにする
  const nightMin = (t) => { const m = toMin(t); return m == null ? null : m < 720 ? m + 1440 : m; };
  const circDiff = (a, b) => { const d = Math.abs(toMin(a) - toMin(b)) % 1440; return Math.min(d, 1440 - d); };
  const sleepHours = (bed, wake) => { if (!bed || !wake) return null; let d = toMin(wake) - toMin(bed); if (d <= 0) d += 1440; return Math.round((d / 60) * 10) / 10; };
  const mealDeadline = () => toTime(toMin(st().targetBed) - 180);

  // ================= 目安の計算 =================
  function latestBody() {
    const es = Body.entries();
    const pick = (k) => { for (let i = es.length - 1; i >= 0; i--) if (es[i][k] != null) return { v: es[i][k], date: es[i].date }; return null; };
    return { weight: pick('weight'), bmr: pick('bmr') };
  }

  function ageOf(p) { return p.birthYear ? new Date().getFullYear() - p.birthYear : null; }

  // 体重・基礎代謝からタンパク質とカロリーの目安を出す
  function targets() {
    const p = S().profile;
    const lb = latestBody();
    const weight = lb.weight ? lb.weight.v : null;
    if (!weight) return { ok: false, reason: '体組成タブで体重を記録すると、目安が計算されます。' };
    let bmr = lb.bmr ? lb.bmr.v : null;
    let bmrSrc = '体組成計の値';
    if (!bmr) {
      const age = ageOf(p);
      if (!p.sex || !age || !p.heightCm) return { ok: false, reason: '基礎代謝を体組成タブで記録するか、設定タブで性別・生まれ年・身長を入れてください。' };
      bmr = Math.round(10 * weight + 6.25 * p.heightCm - 5 * age + (p.sex === 'male' ? 5 : -161));
      bmrSrc = '計算値（Mifflin-St Jeor式）';
    }
    const af = p.activityFactor || 1.5;
    const tdee = bmr * af;
    const r10 = (x) => Math.round(x / 10) * 10;
    const floor = bmr * 1.15; // 基礎代謝を大きく下回らない下限
    const train = r10(Math.max(floor, tdee));
    const rest = r10(Math.max(floor, tdee * 0.85));
    const protein = Math.round(weight * st().proteinPerKg);
    return { ok: true, weight, bmr, bmrSrc, af, tdee: r10(tdee), train, rest, protein };
  }

  // その日に筋トレをしたか（実施中を含む）
  const trainedOn = (d) => S().workouts.some((w) => w.date === d) || (S().active && S().active.date === d);
  // その日のHIITの分数
  const hiitMin = (d) => Math.round(S().workouts.filter((w) => w.date === d && w.hiit).reduce((a, w) => a + w.hiit.totalSec, 0) / 60);
  // 筋トレ記録に含まれるステッパーの分数（＋HIITの分数）
  const stepperFromWorkouts = (d) => hiitMin(d) + S().workouts.filter((w) => w.date === d && !w.hiit)
    .reduce((a, w) => a + w.items.filter((it) => it.exId === 'stepper').reduce((b, it) => b + it.sets.reduce((c, s) => c + s.reps, 0), 0), 0);

  // その日のタンパク質：食事記録の合計 ＋ 習慣チェックで手で足した分
  const proteinTotal = (d) => { const h = day(d); const meal = Meals.proteinOf(d); return h.protein == null && !meal ? null : meal + (h.protein || 0); };

  // ================= チェック項目の判定 =================
  // ok: true=達成 / false=未達 / null=未入力
  function evaluate(d) {
    const h = day(d);
    const s = st();
    const t = targets();
    const sh = sleepHours(h.bed, h.wake);
    const stepperMin = (h.stepperMin || 0) + stepperFromWorkouts(d);
    const items = [
      { k: 'sleep', label: `睡眠 ${s.sleepGoalH}時間以上`, ok: sh == null ? null : sh >= s.sleepGoalH, detail: sh == null ? '' : `${sh}時間` },
      {
        k: 'regular', label: '就寝・起床が目標±30分', detail: h.bed && h.wake ? `${h.bed}就寝 / ${h.wake}起床` : '',
        ok: h.bed && h.wake ? circDiff(h.bed, s.targetBed) <= 30 && circDiff(h.wake, s.targetWake) <= 30 : null,
      },
      { k: 'meal', label: `${mealDeadline()}までに食べ終える`, ok: h.lastMeal ? nightMin(h.lastMeal) <= nightMin(mealDeadline()) : null, detail: h.lastMeal ? `最後は${h.lastMeal}` : '' },
      { k: 'veg', label: `野菜 ${s.vegGoal}皿`, ok: h.veg == null ? null : h.veg >= s.vegGoal, detail: h.veg != null ? `${h.veg}皿` : '' },
      (() => { const pt = proteinTotal(d); return { k: 'protein', label: t.ok ? `タンパク質 ${t.protein}g` : 'タンパク質', ok: pt == null || !t.ok ? null : pt >= t.protein * 0.9, detail: pt != null ? `${pt}g` : '' }; })(),
      {
        k: 'move', label: `${s.stepsGoal.toLocaleString()}歩 or ステッパー・HIIT ${s.stepperGoalMin}分`, detail: [h.steps != null ? `${h.steps.toLocaleString()}歩` : '', stepperMin ? `ステッパー・HIIT ${stepperMin}分` : ''].filter(Boolean).join(' / '),
        ok: h.steps == null && !stepperMin ? null : (h.steps || 0) >= s.stepsGoal || stepperMin >= s.stepperGoalMin,
      },
    ];
    if (s.alcoholCheck) items.push({ k: 'alcohol', label: 'お酒なし（または1杯まで）', ok: h.alcoholOk == null ? null : h.alcoholOk, detail: '' });
    return items;
  }

  // 達成率70%以上でその日を「達成」とする
  function score(d) {
    const items = evaluate(d);
    const done = items.filter((i) => i.ok === true).length;
    const need = Math.ceil(items.length * 0.7);
    return { done, total: items.length, need, achieved: done >= need, logged: !!S().habits[d] };
  }

  // ================= 画面描画 =================
  const PROTEIN_FOODS = [
    ['卵1個', 6], ['納豆', 7], ['豆腐半丁', 10], ['ヨーグルト', 4], ['牛乳200ml', 7], ['鶏むね100g', 23],
    ['魚1切れ', 18], ['豚・牛100g', 20], ['サラダチキン', 25], ['ツナ缶', 13], ['プロテイン1杯', 20],
  ];

  function render(el) {
    root = el;
    const today = UI.dateStr();
    if (date > today) date = today;
    const h = day();
    const s = st();
    const sc = score(date);
    const items = evaluate(date);
    const byK = Object.fromEntries(items.map((i) => [i.k, i]));
    const mark = (i) => (i.ok === true ? '<span class="ok-mark yes" aria-label="達成">✓</span>' : i.ok === false ? '<span class="ok-mark no" aria-label="未達">✕</span>' : '<span class="ok-mark none" aria-label="未入力">−</span>');
    const head = (k, title) => `<div class="hb-head">${mark(byK[k])}<div class="hb-title"><b>${title}</b><span class="muted small">${esc(byK[k].label)}${byK[k].detail ? ' ・ ' + esc(byK[k].detail) : ''}</span></div></div>`;
    const stepperMinW = stepperFromWorkouts(date);

    el.innerHTML = `
      <div class="date-nav">
        <button class="icon-btn" data-act="prev" aria-label="前の日">‹</button>
        <b>${date === today ? '今日 ' : ''}${UI.fmtDate(date)}</b>
        <button class="icon-btn" data-act="next" aria-label="次の日" ${date === today ? 'disabled' : ''}>›</button>
      </div>

      <div class="card">
        <div class="row between"><h3>${date === today ? '今日' : 'この日'}の達成</h3>
          <b class="${sc.achieved ? 'good-text' : ''}">${sc.done} / ${sc.total}${sc.achieved ? ' ✓ 達成' : ''}</b></div>
        <div class="meter"><div style="width:${(sc.done / sc.total) * 100}%"></div></div>
        <p class="hint">${sc.achieved ? '達成です。連続記録が伸びます。' : `${sc.need}項目以上で「達成」になります（完璧でなくてOK）。`}</p>
      </div>

      ${Meals.cardHtml(date)}
      ${Meals.trendHtml()}

      <div class="card hb">
        ${head('sleep', '😴 睡眠')}
        <div class="time-row">
          <label class="bf"><span>寝た時刻（前の晩）</span><input type="time" data-f="bed" value="${h.bed || ''}"></label>
          <label class="bf"><span>起きた時刻</span><input type="time" data-f="wake" value="${h.wake || ''}"></label>
        </div>
        <button class="btn small mt" data-act="usual">目標どおり（${s.targetBed}〜${s.targetWake}）</button>
        <div class="mt">${head('regular', '⏰ 規則正しさ')}</div>
      </div>

      <div class="card hb">
        ${head('meal', '🍽 最後に食べた時刻')}
        <label class="bf"><span>夕食・間食の最後（寝る3時間前が目標）</span><input type="time" data-f="lastMeal" value="${h.lastMeal || ''}"></label>
      </div>

      <div class="card hb">
        ${head('veg', '🥦 野菜')}
        <div class="counter">
          <button class="btn step" data-act="inc" data-f="veg" data-d="-1" aria-label="減らす">−</button>
          <span class="counter-val">${h.veg ?? 0}<small>皿</small></span>
          <button class="btn step" data-act="inc" data-f="veg" data-d="1" aria-label="増やす">＋</button>
        </div>
        <p class="hint">1皿＝小鉢1つ（約70g）。サラダ・おひたし・具だくさん味噌汁・野菜炒めなど。きのこ・海藻もOK。</p>
      </div>

      <div class="card hb">
        ${head('protein', '🍳 タンパク質')}
        ${Meals.proteinOf(date) ? `<p class="small">食事の記録から <b>${Meals.proteinOf(date)}g</b>（自動）＋ 下で足した分 ${h.protein || 0}g</p>` : ''}
        <div class="counter">
          <button class="btn step" data-act="inc" data-f="protein" data-d="-5" aria-label="5g減らす">−5</button>
          <span class="counter-val">${h.protein ?? 0}<small>g</small></span>
          <button class="btn step" data-act="inc" data-f="protein" data-d="5" aria-label="5g増やす">＋5</button>
        </div>
        <div class="chips">${PROTEIN_FOODS.map(([n, g]) => `<button class="chip" data-act="inc" data-f="protein" data-d="${g}">${n} <small class="muted">+${g}</small></button>`).join('')}</div>
        <p class="hint">食べたものをタップすると足されます（量は目安）。上の「食事の記録」に入れた分は自動で入るので、記録していない分だけ足してください。毎食「手のひら1枚分」の肉・魚・卵・大豆製品で約20〜25gです。</p>
      </div>

      <div class="card hb">
        ${head('move', '🚶 歩数・ステッパー・HIIT')}
        <div class="time-row">
          <label class="bf"><span>歩数</span><input type="text" inputmode="numeric" data-f="steps" value="${h.steps ?? ''}" placeholder="例 8000"></label>
          <label class="bf"><span>ステッパー（分）</span><input type="text" inputmode="numeric" data-f="stepperMin" value="${h.stepperMin ?? ''}" placeholder="0"></label>
        </div>
        ${stepperMinW ? `<p class="hint">筋トレ記録のステッパーとHIIT（${stepperMinW}分）も自動で加算しています。</p>` : '<p class="hint">歩数はiPhoneの「ヘルスケア」アプリで確認できます。</p>'}
      </div>

      ${s.alcoholCheck ? `
      <div class="card hb">
        ${head('alcohol', '🍺 お酒')}
        <div class="chips">
          <button class="chip ${h.alcoholOk === true ? 'on' : ''}" data-act="alc" data-v="1">飲まなかった／1杯まで</button>
          <button class="chip ${h.alcoholOk === false ? 'on' : ''}" data-act="alc" data-v="0">2杯以上</button>
        </div>
      </div>` : ''}

      ${blueprintHtml()}`;
    el.onclick = onClick;
    el.onchange = onChange;
    Meals.fillThumbs(el);
    Meals.drawTrend(el);
  }

  function blueprintHtml() {
    const rows = [
      ['睡眠が最優先', '毎日同じ時刻に寝起きし、8時間以上', `${st().sleepGoalH}時間以上・就寝起床を±30分に`],
      ['食事は早い時間に終える', '最後の食事は昼前後', '寝る3時間前まで（目標の就寝時刻から自動計算）'],
      ['野菜中心', '大量の野菜・豆・ナッツを毎日同じメニューで', `小鉢${st().vegGoal}皿（国の目標の350g相当）。メニューは自由`],
      ['十分なタンパク質', '植物性中心で体重×約1.6g', `体重×${st().proteinPerKg}g。肉・魚・卵・大豆どれでもOK`],
      ['毎日運動', '毎日約1時間、高強度も含む', `${st().stepsGoal.toLocaleString()}歩 or ステッパー${st().stepperGoalMin}分＋週${st().daysPerWeek}回の筋トレ`],
      ['規則正しい生活', '細かいルールを毎日厳守', '7割達成でOK。完璧より継続'],
    ];
    return `<details class="card bp">
      <summary><b>Blueprintをどう調整したか</b> <span class="muted small">›</span></summary>
      <table class="tbl small">
        <thead><tr><th>考え方</th><th>Blueprint本家</th><th>このアプリ</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td class="muted">${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody>
      </table>
      <p class="hint">目標の時刻や歩数などは、設定タブで変えられます。</p>
    </details>`;
  }

  // ================= 操作 =================
  function onClick(e) {
    const mb = e.target.closest('[data-m]');
    if (mb) { Meals.onClick(mb, date, () => render(root)); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const h = day();
    switch (b.dataset.act) {
      case 'prev': case 'next': {
        const d = UI.parseDate(date);
        d.setDate(d.getDate() + (b.dataset.act === 'prev' ? -1 : 1));
        date = UI.dateStr(d);
        render(root);
        break;
      }
      case 'usual': setDay({ bed: st().targetBed, wake: st().targetWake }); break;
      case 'inc': {
        const f = b.dataset.f;
        setDay({ [f]: Math.max(0, (h[f] || 0) + Number(b.dataset.d)) });
        if (f === 'protein' && Number(b.dataset.d) > 5) UI.toast(`タンパク質 +${b.dataset.d}g`);
        break;
      }
      case 'alc': setDay({ alcoholOk: b.dataset.v === '1' }); break;
    }
  }

  function onChange(e) {
    const f = e.target.dataset.f;
    if (!f) return;
    let v = e.target.value.trim();
    if (f === 'steps' || f === 'stepperMin') {
      v = v.replace(/[,，]/g, '');
      if (v === '') v = null;
      else { v = parseInt(v, 10); if (!Number.isFinite(v) || v < 0) { UI.toast('数字を入れてください'); return; } }
    } else if (v === '') v = null;
    setDay({ [f]: v });
  }

  // 日付を指定して開く（ダッシュボードから使う）
  function openDate(d) { date = d; }

  return { proteinTotal, render, title: '食事・習慣', evaluate, score, targets, trainedOn, sleepHours, openDate };
})();
