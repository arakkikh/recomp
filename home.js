// ④ ダッシュボード：今日やること・連続達成日数・週ごとの振り返り
const Home = (() => {
  const { esc } = UI;
  let root;
  let weekOffset = 0; // 0=今週, -1=先週 ...

  const S = () => Store.data;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysBetween = (a, b) => Math.round((UI.parseDate(b) - UI.parseDate(a)) / 864e5);

  // ================= 連続達成日数 =================
  function streak() {
    const today = UI.dateStr();
    let d = new Date();
    // 今日がまだ未達成なら、昨日から数える（今日はこれから）
    if (!Habits.score(today).achieved) d = addDays(d, -1);
    let n = 0;
    while (Habits.score(UI.dateStr(d)).achieved) { n++; d = addDays(d, -1); }
    return { n, todayDone: Habits.score(today).achieved };
  }

  function bestStreak() {
    const dates = Object.keys(S().habits).sort();
    if (!dates.length) return 0;
    let best = 0, cur = 0;
    let d = UI.parseDate(dates[0]);
    const end = new Date();
    while (d <= end) {
      if (Habits.score(UI.dateStr(d)).achieved) { cur++; best = Math.max(best, cur); } else cur = 0;
      d = addDays(d, 1);
    }
    return best;
  }

  // ================= 今日やること =================
  function tasks() {
    const today = UI.dateStr();
    const out = [];
    const a = S().active;
    const ws = UI.dateStr(UI.weekStart());
    const weekDone = S().workouts.filter((w) => w.date >= ws && Program.isStrength(w)).length;
    const target = S().settings.daysPerWeek;
    const doneToday = S().workouts.some((w) => w.date === today && Program.isStrength(w));

    // 筋トレ
    if (a) out.push({ icon: '🏋️', text: `${Program.DAYS[a.dayKey]?.name || 'ワークアウト'}を実施中`, sub: '続きを記録する', tab: 'workout', state: 'doing' });
    else if (doneToday) out.push({ icon: '🏋️', text: '筋トレ完了', sub: 'お疲れさまでした', tab: 'workout', state: 'done' });
    else if (weekDone >= target) out.push({ icon: '🏋️', text: '今週の筋トレ目標は達成済み', sub: '今日は休養か、ステッパーで軽く', tab: 'workout', state: 'done' });
    else {
      const trainedYesterday = S().workouts.some((w) => w.date === UI.dateStr(addDays(new Date(), -1)) && Program.isStrength(w));
      out.push({ icon: '🏋️', text: `筋トレ：${Program.DAYS[Program.nextDay()].name}`, sub: `今週 ${weekDone}/${target}回${trainedYesterday ? '（昨日もやったので、疲れていれば休養でもOK）' : ''}`, tab: 'workout', state: 'todo' });
    }

    // 軽めの週（デロード）
    const dl = Program.deloadState();
    if (dl.current) out.push({ icon: '🌿', text: '軽めの週（デロード）中', sub: `〜${UI.fmtShort(dl.current.end)}。重量は約60%で余裕を残して`, tab: 'workout', state: 'doing' });
    else if (!a && Program.deloadCheck().suggest) out.push({ icon: '🌿', text: '疲れがたまっているサイン', sub: '軽めの週（デロード）を検討しましょう', tab: 'workout', state: 'todo' });

    // 習慣
    const sc = Habits.score(today);
    out.push({ icon: '✅', text: `習慣チェック ${sc.done}/${sc.total}`, sub: sc.achieved ? '達成！' : `あと${sc.need - sc.done}つで達成`, tab: 'habits', state: sc.achieved ? 'done' : 'todo', habitsToday: true });

    // 体組成（週1回）
    const es = Body.entries();
    const last = es[es.length - 1];
    if (!last) out.push({ icon: '📊', text: '体組成を記録する', sub: 'まずは今の値を入れておきましょう', tab: 'body', state: 'todo' });
    else {
      const ago = daysBetween(last.date, today);
      if (ago >= 7) out.push({ icon: '📊', text: '体組成を測る', sub: `前回から${ago}日（週1回が目安）`, tab: 'body', state: 'todo' });
    }

    // バックアップ（2週間ごと）
    const hasData = S().workouts.length || es.length || Object.keys(S().habits).length;
    const lb = S().settings.lastBackup;
    const lbAgo = lb ? Math.floor((Date.now() - new Date(lb)) / 864e5) : null;
    if (hasData && (lbAgo === null || lbAgo >= 14)) {
      out.push({ icon: '💾', text: 'バックアップを保存', sub: lbAgo === null ? 'まだ一度も保存していません' : `前回から${lbAgo}日`, tab: 'settings', state: 'todo' });
    }
    return out;
  }

  // ================= 週の振り返り =================
  function weekData(offset) {
    const start = addDays(UI.weekStart(), offset * 7);
    const days = Array.from({ length: 7 }, (_, i) => UI.dateStr(addDays(start, i)));
    const from = days[0], to = days[6];
    const today = UI.dateStr();
    const ws = S().workouts.filter((w) => w.date >= from && w.date <= to && Program.isStrength(w));
    const hiitN = S().workouts.filter((w) => w.date >= from && w.date <= to && w.hiit).length;
    const sets = ws.reduce((a, w) => a + w.items.reduce((b, it) => b + it.sets.length, 0), 0);

    // 習慣
    const scores = days.map((d) => ({ d, future: d > today, ...Habits.score(d) }));
    const achievedDays = scores.filter((s) => s.achieved).length;
    const logged = days.filter((d) => S().habits[d]);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const sleepAvg = avg(logged.map((d) => Habits.sleepHours(S().habits[d].bed, S().habits[d].wake)).filter((v) => v != null));
    const vegAvg = avg(logged.map((d) => S().habits[d].veg).filter((v) => v != null));
    const proteinAvg = avg(days.filter((d) => d <= today).map((d) => Habits.proteinTotal(d)).filter((v) => v != null));
    const mealAvg = Meals.weekAverages(days.filter((d) => d <= today));
    const stepsAvg = avg(logged.map((d) => S().habits[d].steps).filter((v) => v != null));

    // 項目ごとの達成率 → 一番弱いところを来週の課題に
    const rates = {};
    logged.forEach((d) => Habits.evaluate(d).forEach((it) => {
      if (it.ok === null) return;
      rates[it.k] = rates[it.k] || { label: it.label, ok: 0, n: 0 };
      rates[it.k].n++;
      if (it.ok) rates[it.k].ok++;
    }));
    const weakest = Object.values(rates).filter((r) => r.n >= 2).sort((a, b) => a.ok / a.n - b.ok / b.n)[0];

    // 体組成：週内の最新 vs それより前の最新
    const es = Body.entries();
    const inWeek = es.filter((e) => e.date >= from && e.date <= to);
    const before = es.filter((e) => e.date < from);
    const bodyCmp = inWeek.length && before.length ? { a: before[before.length - 1], b: inWeek[inWeek.length - 1] } : null;

    // 伸びた種目：週内の推定1RM（自重種目は回数）が、それまでの最高を超えたもの
    const prs = [];
    const exIds = [...new Set(ws.flatMap((w) => w.items.map((it) => it.exId)))];
    exIds.forEach((id) => {
      const ex = Exercises.byId[id];
      if (!ex || ex.unit === 'min') return;
      const ms = Program.metrics(id);
      const key = ex.unit === 'kg' ? 'e1rm' : 'maxReps';
      const prev = ms.filter((m) => m.date < from);
      const cur = ms.filter((m) => m.date >= from && m.date <= to);
      if (!prev.length || !cur.length) return;
      const pb = Math.max(...prev.map((m) => m[key]));
      const cb = Math.max(...cur.map((m) => m[key]));
      if (cb > pb) prs.push({ name: ex.name, text: ex.unit === 'kg' ? `推定1RM ${UI.num(Math.round(pb * 10) / 10)} → ${UI.num(Math.round(cb * 10) / 10)}kg` : `${pb} → ${cb}${Exercises.UNIT_LABEL[ex.unit]}` });
    });

    return { mealAvg, hiitN, from, to, days, ws, sets, scores, achievedDays, sleepAvg, vegAvg, proteinAvg, stepsAvg, weakest, bodyCmp, prs, isCurrent: offset === 0 };
  }

  function comment(w) {
    const target = S().settings.daysPerWeek;
    const parts = [];
    if (w.ws.length >= target) parts.push('筋トレは目標どおりできました。');
    else if (!w.isCurrent) parts.push(`筋トレは${w.ws.length}/${target}回。来週は予定を先にカレンダーに入れておきましょう。`);
    if (w.weakest && w.weakest.ok / w.weakest.n < 0.6) parts.push(`来週は「${w.weakest.label}」を意識しましょう（${w.weakest.n}日中${w.weakest.ok}日達成）。`);
    if (w.prs.length) parts.push(`${w.prs.length}種目で記録が伸びました。`);
    return parts.join('') || (w.isCurrent ? '今週も一つずつ積み上げていきましょう。' : '記録が少ない週でした。');
  }

  // ================= 画面描画 =================
  function render(el) {
    root = el;
    const now = new Date();
    const hour = now.getHours();
    const greet = hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'こんばんは';
    const st = streak();
    const best = bestStreak();
    const ts = tasks();
    const w = weekData(weekOffset);
    const fmt1 = (v, u) => (v == null ? '—' : `${UI.num(Math.round(v * 10) / 10)}${u}`);
    const WD = ['月', '火', '水', '木', '金', '土', '日'];

    const dots = w.scores.map((s, i) => {
      const cls = s.future ? 'future' : s.achieved ? 'hit' : s.logged ? 'part' : 'none';
      const title = s.future ? '' : s.achieved ? '達成' : s.logged ? `${s.done}/${s.total}` : '記録なし';
      const trained = S().workouts.some((x) => x.date === s.d && Program.isStrength(x));
      const hiitDay = S().workouts.some((x) => x.date === s.d && x.hiit);
      return `<div class="wd"><span class="wd-l">${WD[i]}</span><span class="dot ${cls}" title="${title}">${s.achieved ? '✓' : s.logged && !s.future ? s.done : ''}</span><span class="wd-t">${trained ? '🏋️' : ''}${hiitDay ? '⏱' : ''}</span></div>`;
    }).join('');

    let bodyRow = '';
    if (w.bodyCmp) {
      const { a, b } = w.bodyCmp;
      const fk = (e) => (e.weight != null && e.fatPct != null ? (e.weight * e.fatPct) / 100 : null);
      const d = (x, y, u, good) => {
        if (x == null || y == null) return '';
        const r = Math.round((y - x) * 10) / 10;
        const cls = r === 0 || good === 0 ? 'flat' : Math.sign(r) === good ? 'good' : 'bad';
        return `<span class="delta ${cls}">${r > 0 ? '▲ +' : r < 0 ? '▼ −' : '± '}${Math.abs(r)}${u}</span>`;
      };
      bodyRow = `<div class="rv-row"><span>体重</span>${d(a.weight, b.weight, 'kg', 0)}</div>
        ${fk(a) != null && fk(b) != null ? `<div class="rv-row"><span>体脂肪量</span>${d(fk(a), fk(b), 'kg', -1)}</div>` : ''}
        ${a.visceral != null && b.visceral != null ? `<div class="rv-row"><span>内臓脂肪</span>${d(a.visceral, b.visceral, '', -1)}</div>` : ''}
        <p class="hint">${UI.fmtShort(a.date)} → ${UI.fmtShort(b.date)} の比較</p>`;
    }

    el.innerHTML = `
      <p class="greet">${greet}。<span class="muted">${UI.fmtDate(UI.dateStr())}</span></p>

      <div class="card streak">
        <div class="streak-main">
          <span class="streak-n">${st.n}</span><span class="streak-u">日連続</span>
        </div>
        <div class="muted small">習慣チェック達成 ・ 最高 ${best}日${st.todayDone ? ' ・ 今日も達成済み' : st.n ? ' ・ 今日達成すると記録が伸びます' : ''}</div>
      </div>

      <div class="card">
        <h3>今日やること</h3>
        <ul class="tasks">${ts.map((t, i) => `
          <li><button class="task ${t.state}" data-act="go" data-i="${i}">
            <span class="task-icon">${t.state === 'done' ? '✓' : t.icon}</span>
            <span class="task-body"><b>${esc(t.text)}</b><span class="muted small">${esc(t.sub)}</span></span>
            <span class="muted">›</span>
          </button></li>`).join('')}
        </ul>
      </div>

      <div class="card">
        <div class="row between">
          <button class="icon-btn" data-act="wprev" aria-label="前の週">‹</button>
          <div class="center"><h3>${w.isCurrent ? '今週' : weekOffset === -1 ? '先週' : ''}の振り返り</h3><span class="muted small">${UI.fmtShort(w.from)}〜${UI.fmtShort(w.to)}</span></div>
          <button class="icon-btn" data-act="wnext" aria-label="次の週" ${w.isCurrent ? 'disabled' : ''}>›</button>
        </div>
        <div class="week-dots">${dots}</div>
        <p class="hint center">✓＝習慣達成 / 数字＝できた項目数 / 🏋️＝筋トレ / ⏱＝HIIT</p>

        <div class="tiles">
          <div class="tile"><div class="tile-label">筋トレ</div><div class="tile-val">${w.ws.length}<small>/${S().settings.daysPerWeek}回</small></div><div class="muted small">${w.sets}セット${w.hiitN ? ` ・ HIIT ${w.hiitN}回` : ''}</div></div>
          <div class="tile"><div class="tile-label">習慣達成</div><div class="tile-val">${w.achievedDays}<small>日</small></div></div>
          <div class="tile"><div class="tile-label">平均睡眠</div><div class="tile-val">${fmt1(w.sleepAvg, '')}<small>時間</small></div></div>
          <div class="tile"><div class="tile-label">平均 野菜</div><div class="tile-val">${fmt1(w.vegAvg, '')}<small>皿</small></div></div>
          <div class="tile"><div class="tile-label">平均 カロリー</div><div class="tile-val">${w.mealAvg.kcal == null ? '—' : Math.round(w.mealAvg.kcal).toLocaleString()}<small>kcal</small></div>${w.mealAvg.days ? `<div class="muted small">記録${w.mealAvg.days}日分</div>` : ''}</div>
          <div class="tile"><div class="tile-label">平均 タンパク質</div><div class="tile-val">${w.proteinAvg == null ? '—' : Math.round(w.proteinAvg)}<small>g</small></div>${(() => { const t = Habits.targets(); return t.ok ? `<div class="muted small">目安 ${t.protein}g</div>` : ''; })()}</div>
          <div class="tile"><div class="tile-label">平均 歩数</div><div class="tile-val">${w.stepsAvg == null ? '—' : Math.round(w.stepsAvg).toLocaleString()}</div></div>
        </div>

        ${w.prs.length ? `<h4>伸びた種目</h4><ul class="rv-list">${w.prs.map((p) => `<li><b>${esc(p.name)}</b><span class="muted small">${esc(p.text)}</span></li>`).join('')}</ul>` : ''}
        ${bodyRow ? `<h4>体組成の変化</h4>${bodyRow}` : ''}
        <p class="review-comment">💬 ${esc(comment(w))}</p>
      </div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'go') {
        const t = ts[+b.dataset.i];
        if (t.habitsToday) Habits.openDate(UI.dateStr());
        App.go(t.tab);
      }
      if (b.dataset.act === 'wprev') { weekOffset--; render(root); }
      if (b.dataset.act === 'wnext' && weekOffset < 0) { weekOffset++; render(root); }
    };
    el.onchange = null;
  }

  return { render, title: 'ホーム' };
})();
