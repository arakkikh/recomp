// 分割メニューと「次回の提案」（ダブルプログレッション）
const Program = (() => {
  const DAYS = {
    upperA: { name: '上半身A', sub: '胸・背中・肩（水平押し/引き）', items: ['db_bench', 'one_arm_row', 'pullup', 'seated_press', 'side_raise', 'db_curl', 'stepper'] },
    lowerA: { name: '下半身A', sub: '脚・お尻（スクワット系）', items: ['goblet_squat', 'db_rdl', 'bulgarian', 'step_up', 'calf_raise', 'plank', 'stepper'] },
    upperB: { name: '上半身B', sub: '胸上部・背中・腕', items: ['incline_press', 'chinup', 'dips', 'incline_row', 'rear_raise', 'oh_triceps', 'stepper'] },
    lowerB: { name: '下半身B', sub: 'お尻・裏もも（ヒンジ系）', items: ['db_rdl', 'bulgarian', 'hip_thrust', 'goblet_squat', 'hanging_knee', 'dead_bug', 'stepper'] },
    fullA: { name: '全身A', sub: '週3回メニュー', items: ['goblet_squat', 'db_bench', 'one_arm_row', 'db_rdl', 'seated_press', 'plank', 'stepper'] },
    fullB: { name: '全身B', sub: '週3回メニュー', items: ['bulgarian', 'incline_press', 'chinup', 'hip_thrust', 'incline_row', 'hanging_knee', 'stepper'] },
  };

  const rotation = () => (Store.data.settings.daysPerWeek === 3 ? ['fullA', 'fullB'] : ['upperA', 'lowerA', 'upperB', 'lowerB']);

  // 前回の続きから次のメニューを決める
  function nextDay() {
    const rot = rotation();
    const ws = Store.data.workouts;
    for (let i = ws.length - 1; i >= 0; i--) {
      const k = rot.indexOf(ws[i].dayKey);
      if (k >= 0) return rot[(k + 1) % rot.length];
    }
    return rot[0];
  }

  // 種目の過去記録（新しい順）[{date, sets}]
  function sessionsFor(exId) {
    const out = [];
    const ws = Store.data.workouts;
    for (let i = ws.length - 1; i >= 0; i--) {
      const item = ws[i].items.find((it) => it.exId === exId && it.sets.length);
      if (item) out.push({ date: ws[i].date, sets: item.sets });
    }
    return out;
  }

  const isHard = (sets, min) => sets.some((s) => s.reps < min) || sets.some((s) => s.rpe && s.rpe >= 9.5);

  // 次回の提案 → { kind: first|up|keep|down|max, weight, reps, text }
  function suggest(exId) {
    const ex = Exercises.byId[exId];
    const { dbIncrementKg: inc, dbMaxKg } = Store.data.settings;
    const [min, max] = ex.range;
    const hist = sessionsFor(exId);

    if (!hist.length) {
      const text = ex.unit === 'kg'
        ? `初回：RPE7（あと3回できる）で${min}〜${max}回できる重量を探す`
        : ex.unit === 'bw' ? `初回：できる回数を確認（目標${min}〜${max}回）${ex.regression ? '。1回もできなければ → ' + ex.regression : ''}`
        : `初回：${min}${Exercises.UNIT_LABEL[ex.unit]}を目標に`;
      return { kind: 'first', weight: ex.unit === 'kg' ? ex.startKg : 0, reps: min, text };
    }

    const last = hist[0].sets;

    // 時間で測る種目（プランク・ステッパー）
    if (ex.unit === 'sec' || ex.unit === 'min') {
      const u = Exercises.UNIT_LABEL[ex.unit];
      const best = Math.max(...last.map((s) => s.reps));
      if (best >= max) return { kind: 'max', weight: 0, reps: max, text: ex.progression || `目標の${max}${u}に到達。この長さを維持` };
      const next = Math.min(max, best + ex.step);
      return { kind: 'up', weight: 0, reps: next, text: `前回 ${best}${u} → ${next}${u}を目標に` };
    }

    const w = Math.max(...last.map((s) => s.weight || 0));
    const top = last.filter((s) => (s.weight || 0) === w);
    const minReps = Math.min(...top.map((s) => s.reps));
    const rpes = top.map((s) => s.rpe).filter(Boolean);
    const maxRpe = rpes.length ? Math.max(...rpes) : null;
    const allTop = top.every((s) => s.reps >= max);
    const wLabel = (x) => (ex.unit === 'bw' ? (x > 0 ? `+${UI.num(x)}kg` : '自重') : `${UI.num(x)}kg`);

    if (allTop && (maxRpe === null || maxRpe <= 8.5)) {
      if (ex.unit === 'kg' && w + inc > dbMaxKg) {
        return { kind: 'max', weight: w, reps: max, text: `ダンベルの最大重量に到達。下ろす動作を3秒にする・セットを1つ増やすで負荷を上げる` };
      }
      if (ex.note && ex.note.includes('回数')) {
        // 刻みが大きすぎる種目：上限を少し超えてから上げる
        if (minReps < max + 3) return { kind: 'keep', weight: w, reps: minReps + 1, text: `${ex.note}。${wLabel(w)}で${minReps + 1}回` };
      }
      const nw = w + inc;
      const how = ex.unit === 'bw' && w === 0 ? '（ダンベルを脚に挟む）' : '';
      return { kind: 'up', weight: nw, reps: min, text: `前回は全セット${max}回以上 → ${wLabel(nw)}${how}で${min}回から` };
    }
    if (allTop) {
      return { kind: 'keep', weight: w, reps: max, text: `上限回数に届いたがRPE9以上。同じ${wLabel(w)}で余裕を持って${max}回を目指す` };
    }
    if (isHard(top, min)) {
      const prev = hist[1];
      const prevW = prev ? Math.max(...prev.sets.map((s) => s.weight || 0)) : null;
      const reg = ex.regression ? `／${ex.regression}` : '';
      if (prev && prevW === w && isHard(prev.sets.filter((s) => (s.weight || 0) === w), min) && w - inc >= 0 && w > 0) {
        return { kind: 'down', weight: w - inc, reps: min, text: `2回続けて目標未達 → ${wLabel(w - inc)}に下げてフォームを立て直す` };
      }
      return { kind: 'keep', weight: w, reps: min, text: `前回はきつめ → 同じ${wLabel(w)}で全セット${min}回以上を目標${reg}` };
    }
    const target = Math.min(max, minReps + 1);
    return { kind: 'keep', weight: w, reps: target, text: `同じ${wLabel(w)}で各セット+1回（${target}回）。全セット${max}回で重量アップ` };
  }

  // 「22.5kg×10,10,9 RPE8」形式
  function fmtSets(exId, sets) {
    const ex = Exercises.byId[exId];
    const u = Exercises.UNIT_LABEL[ex.unit];
    if (ex.unit === 'sec' || ex.unit === 'min') return sets.map((s) => `${s.reps}${u}`).join(', ');
    const wl = (w) => (ex.unit === 'bw' ? (w > 0 ? `自重+${UI.num(w)}kg` : '自重') : `${UI.num(w)}kg`);
    const groups = [];
    for (const s of sets) {
      const g = groups[groups.length - 1];
      if (g && g.w === (s.weight || 0)) g.reps.push(s.reps); else groups.push({ w: s.weight || 0, reps: [s.reps] });
    }
    const rpes = sets.map((s) => s.rpe).filter(Boolean);
    const rpe = rpes.length ? ` · RPE${Math.max(...rpes)}` : '';
    return groups.map((g) => `${wl(g.w)}×${g.reps.join(',')}`).join(' / ') + rpe;
  }

  // グラフ用の指標
  const e1rm = (w, r) => w * (1 + r / 30); // Epley式
  function metrics(exId) {
    const ex = Exercises.byId[exId];
    return sessionsFor(exId).reverse().map(({ date, sets }) => {
      const maxW = Math.max(...sets.map((s) => s.weight || 0));
      return {
        date,
        maxW,
        e1rm: Math.max(...sets.map((s) => e1rm(s.weight || 0, s.reps))),
        volume: sets.reduce((a, s) => a + (s.weight || 0) * s.reps, 0),
        maxReps: Math.max(...sets.map((s) => s.reps)),
        sets,
        ex,
      };
    });
  }

  // 期間内（from〜to、YYYY-MM-DD）の部位別セット数。実施中のワークアウトの完了セットも数える
  function groupSets(from, to) {
    const out = Object.fromEntries(Exercises.GROUPS.map((g) => [g.k, 0]));
    const addItem = (exId, n) => {
      const ex = Exercises.byId[exId];
      if (!ex) return;
      for (const k in ex.work) out[k] += ex.work[k] * n;
    };
    Store.data.workouts.filter((w) => w.date >= from && w.date <= to)
      .forEach((w) => w.items.forEach((it) => addItem(it.exId, it.sets.length)));
    const a = Store.data.active;
    if (a && a.date >= from && a.date <= to) a.items.forEach((it) => addItem(it.exId, it.sets.filter((s) => s.done).length));
    return out;
  }

  // ウォームアップの提案。w=その日の1セット目の重量（片手kg）
  // 大きい種目（休憩90秒以上）は 50%×10 → 70〜75%×5 →（20kg以上なら）85%×3、
  // 小さい種目は 50%×12 を1セット。自重種目は軽い準備運動の説明だけ。
  const BW_WARMUP = {
    pullup: 'バーにぶら下がって10秒 ＋ ぶら下がったまま肩甲骨を下げる動きを5回',
    chinup: 'バーにぶら下がって10秒 ＋ ぶら下がったまま肩甲骨を下げる動きを5回',
    dips: 'バーの上で腕を伸ばして体を支える10秒 ＋ 浅めのディップスを5回',
  };
  function warmup(exId, w) {
    const ex = Exercises.byId[exId];
    if (!ex) return null;
    if (ex.unit === 'bw') return BW_WARMUP[exId] ? { note: BW_WARMUP[exId], sets: [] } : null;
    if (ex.unit !== 'kg') return null;
    const inc = Store.data.settings.dbIncrementKg;
    if (!w || w <= inc * 2) return { note: '', sets: [{ w: 0, reps: 10, text: 'ダンベルなしで10回（動きの確認）' }] };
    const compound = (ex.rest || 0) >= 90;
    const plan = compound ? (w >= 20 ? [[0.5, 10], [0.7, 5], [0.85, 3]] : [[0.5, 10], [0.75, 5]]) : [[0.5, 12]];
    const round = (x) => Math.max(inc, Math.floor(x / inc + 1e-9) * inc); // 安全のため軽い方へ切り下げ
    const sets = [];
    plan.forEach(([p, reps]) => {
      const ww = round(w * p);
      if (ww >= w || sets.some((s) => s.w === ww)) return;
      sets.push({ w: ww, reps, text: `${UI.num(ww)}kg × ${reps}回` });
    });
    return { note: '', sets };
  }

  // ---- 自己ベスト（PR）----
  // 過去の記録（＋その日にすでに終えたセット）から、種目ごとの最高記録を出す
  function bests(exId, extra = []) {
    const b = { maxW: null, e1rm: null, repsAt: {}, maxReps: null };
    const take = (s, date) => {
      const w = s.weight || 0, r = s.reps || 0;
      if (r <= 0) return;
      if (!b.maxW || w > b.maxW.v) b.maxW = { v: w, reps: r, date };
      const e = e1rm(w, r);
      if (!b.e1rm || e > b.e1rm.v) b.e1rm = { v: e, w, r, date };
      if (!b.repsAt[w] || r > b.repsAt[w].v) b.repsAt[w] = { v: r, date };
      if (!b.maxReps || r > b.maxReps.v) b.maxReps = { v: r, w, date };
    };
    sessionsFor(exId).forEach(({ date, sets }) => sets.forEach((s) => take(s, date)));
    extra.forEach((s) => take(s, UI.dateStr()));
    return b;
  }

  // 今終えたセットが自己ベストか。初めての種目はお祝いしない（比べる記録がないため）
  // 戻り値：[{ type, label, text }]
  function checkPR(exId, set, extra = []) {
    const ex = Exercises.byId[exId];
    const b = bests(exId, extra);
    if (!b.maxReps) return [];
    const w = set.weight || 0, r = set.reps || 0;
    if (r <= 0) return [];
    const out = [];
    const u = Exercises.UNIT_LABEL[ex.unit];
    if (ex.unit === 'sec' || ex.unit === 'min') {
      if (r > b.maxReps.v) out.push({ type: 'time', label: ex.unit === 'sec' ? '最長時間' : '最長時間', text: `${r}${u}（これまで ${b.maxReps.v}${u}）` });
      return out;
    }
    if (ex.unit === 'kg') {
      if (w > b.maxW.v) out.push({ type: 'weight', label: '最大重量', text: `${UI.num(w)}kg × ${r}回（これまで ${UI.num(b.maxW.v)}kg）` });
      const e = e1rm(w, r);
      if (e > b.e1rm.v + 0.05) out.push({ type: 'e1rm', label: '推定1RM', text: `${UI.num(Math.round(e * 10) / 10)}kg（これまで ${UI.num(Math.round(b.e1rm.v * 10) / 10)}kg）` });
      if (b.repsAt[w] && r > b.repsAt[w].v) out.push({ type: 'reps', label: `${UI.num(w)}kgでの最多回数`, text: `${r}回（これまで ${b.repsAt[w].v}回）` });
      return out;
    }
    // 自重（＋加重）
    if (w > b.maxW.v) out.push({ type: 'weight', label: '最大加重', text: `+${UI.num(w)}kg × ${r}回（これまで ${b.maxW.v > 0 ? '+' + UI.num(b.maxW.v) + 'kg' : '自重のみ'}）` });
    if (b.repsAt[w] && r > b.repsAt[w].v) out.push({ type: 'reps', label: w > 0 ? `+${UI.num(w)}kgでの最多回数` : '最多回数', text: `${r}回（これまで ${b.repsAt[w].v}回）` });
    return out;
  }

  // 最近の自己ベスト（記録に残した🏆）を新しい順に
  function recentPRs(limit = 10) {
    const out = [];
    const ws = Store.data.workouts;
    for (let i = ws.length - 1; i >= 0 && out.length < limit; i--) {
      ws[i].items.forEach((it) => it.sets.forEach((s) => {
        if (s.pr && s.pr.length && out.length < limit) out.push({ date: ws[i].date, exId: it.exId, set: s });
      }));
    }
    return out;
  }

  return { DAYS, rotation, nextDay, sessionsFor, suggest, fmtSets, metrics, groupSets, warmup, bests, checkPR, recentPRs, e1rm };
})();
