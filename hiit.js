// HIIT タイマー
// ・運動／休憩／ラウンド／セット／セット間休憩を自由に設定。プリセットと自分の設定を保存
// ・準備10秒 → （ウォームアップ）→ 運動と休憩の繰り返し → （クールダウン）
// ・時間は「終わる時刻」で管理するので、画面が一瞬止まってもずれない
const Hiit = (() => {
  const { esc } = UI;

  // ---- できる種目（持っている器具＋自重）----
  const MOVES = [
    { id: 'hiit_squat', name: '自重スクワット', equip: '自重', level: 1, tip: 'お尻を後ろに引いて、太ももが床と平行くらいまで' },
    { id: 'hiit_jack', name: 'ジャンピングジャック', equip: '自重', level: 1, tip: 'ジャンプがつらければ、片足ずつ横に出すだけでOK' },
    { id: 'hiit_highknee', name: 'もも上げ', equip: '自重', level: 1, tip: '慣れないうちは歩くペースで' },
    { id: 'hiit_lunge', name: 'リバースランジ（左右交互）', equip: '自重', level: 1, tip: '後ろの膝を床すれすれまで下ろす' },
    { id: 'hiit_pushup', name: 'ベンチ腕立て伏せ', equip: 'ベンチ', level: 1, tip: '手をベンチについて、体を一直線に' },
    { id: 'hiit_stepup', name: 'ベンチステップアップ', equip: 'ベンチ', level: 1, tip: '左右交互に。ダンベルは持たない' },
    { id: 'stepper', name: 'ステッパー（速め）', equip: 'ステッパー', level: 1, tip: 'テンポを上げて踏む' },
    { id: 'plank', name: 'プランク', equip: '自重', level: 1, tip: 'お尻を下げずに一直線をキープ' },
    { id: 'hiit_mountain', name: 'マウンテンクライマー', equip: '自重', level: 2, tip: '腕立ての姿勢で、膝を胸へ左右交互に' },
    { id: 'hiit_thruster', name: 'ダンベルスラスター（軽め）', equip: 'ダンベル', level: 2, tip: '片手5kg程度まで。しゃがんで立つ勢いで押し上げる' },
    { id: 'hanging_knee', name: 'ハンギングニーレイズ', equip: '懸垂スタンド', level: 2, tip: '反動をつけずに膝を胸へ' },
  ];
  const MOVE = Object.fromEntries(MOVES.map((m) => [m.id, m]));
  const BEGINNER_ROTATION = ['hiit_squat', 'hiit_jack', 'hiit_pushup', 'hiit_highknee', 'hiit_lunge', 'stepper'];

  const PRESETS = [
    { id: 'p_beginner', name: '初心者向け', work: 20, rest: 40, rounds: 6, sets: 1, setRest: 60, recommended: true },
    { id: 'p_tabata', name: 'タバタ', work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60 },
    { id: 'p_3030', name: '30秒/30秒×10', work: 30, rest: 30, rounds: 10, sets: 1, setRest: 60 },
  ];
  const LIMITS = { work: [5, 180, 5], rest: [0, 180, 5], rounds: [1, 20, 1], sets: [1, 5, 1], setRest: [10, 300, 10], warmup: [30, 600, 30], cooldown: [30, 600, 30] };

  const S = () => Store.data.hiit;
  const cfg = () => S().cfg;

  // 種目の並びをラウンド数に合わせる（足りない分はおまかせで埋める）
  function fitMoves(c) {
    const out = (c.moves || []).filter((id) => MOVE[id]).slice(0, c.rounds);
    while (out.length < c.rounds) out.push(BEGINNER_ROTATION[out.length % BEGINNER_ROTATION.length]);
    c.moves = out;
  }

  // ================= 時間割 =================
  function phases(c) {
    const ph = [{ t: 'prep', sec: 10 }];
    if (c.warmupOn) ph.push({ t: 'warmup', sec: c.warmup });
    for (let s = 1; s <= c.sets; s++) {
      for (let r = 1; r <= c.rounds; r++) {
        ph.push({ t: 'work', sec: c.work, round: r, set: s, move: c.moves[r - 1] });
        if (r < c.rounds) { if (c.rest > 0) ph.push({ t: 'rest', sec: c.rest, round: r, set: s }); }
        else if (s < c.sets) ph.push({ t: 'setrest', sec: c.setRest, set: s });
      }
    }
    if (c.cooldownOn) ph.push({ t: 'cooldown', sec: c.cooldown });
    return ph;
  }
  const totalSec = (c) => phases(c).reduce((a, p) => a + p.sec, 0);
  const fmtMin = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}分${sec % 60 ? `${sec % 60}秒` : ''}` : `${sec}秒`);

  const PHASE = {
    prep: { label: '準備', cls: 'prep' },
    warmup: { label: 'ウォームアップ', cls: 'prep' },
    work: { label: '運動', cls: 'work' },
    rest: { label: '休憩', cls: 'rest' },
    setrest: { label: 'セット間の休憩', cls: 'rest' },
    cooldown: { label: 'クールダウン', cls: 'rest' },
  };

  // ================= 設定画面 =================
  let host = null;
  function render(el) {
    host = el;
    const c = cfg();
    fitMoves(c);
    const step = (k, label, unit, show = true) => (show ? `
      <div class="h-row">
        <span>${label}</span>
        <div class="h-step">
          <button class="btn step" data-h="step" data-k="${k}" data-d="-1" aria-label="${label}を減らす">−</button>
          <b>${c[k]}<small>${unit}</small></b>
          <button class="btn step" data-h="step" data-k="${k}" data-d="1" aria-label="${label}を増やす">＋</button>
        </div>
      </div>` : '');
    const presetChip = (p, custom) => `<button class="chip ${c.presetId === p.id ? 'on' : ''}" data-h="preset" data-id="${p.id}">${esc(p.name)}${p.recommended ? ' ★' : ''}</button>${custom ? `<button class="chip-x" data-h="delpreset" data-id="${p.id}" aria-label="${esc(p.name)}を削除">×</button>` : ''}`;
    const moveOpts = (sel) => MOVES.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}${m.level > 1 ? '（中級）' : ''}・${m.equip}</option>`).join('');
    const rows = c.moves.map((id, i) => `
      <div class="h-move">
        <button class="fig-thumb sm" data-h="moveinfo" data-id="${id}" aria-label="動きを見る">${Figures.svg(id, 1)}</button>
        <label><span class="muted small">ラウンド${i + 1}</span><select data-h="move" data-i="${i}">${moveOpts(id)}</select></label>
      </div>`).join('');
    el.innerHTML = `
      <div class="card h-notice">
        <b>⭐ はじめは「初心者向け」（20秒運動／40秒休憩×6）から</b>
        <p class="small">運動中は全力の7〜8割で十分です。<b>息が上がりすぎたら、休憩を延ばすか、その場で足踏みに切り替えて休みましょう。</b>胸の痛み・めまい・強い息苦しさがあればすぐ中止してください。持病や血圧が気になる方は医師に相談してから。</p>
      </div>

      <div class="card">
        <h3>プリセット</h3>
        <div class="chips">${PRESETS.map((p) => presetChip(p, false)).join('')}${S().custom.map((p) => presetChip(p, true)).join('')}</div>
      </div>

      <div class="card">
        <div class="row between"><h3>設定</h3><span class="tag">合計 約${fmtMin(totalSec(c))}</span></div>
        ${step('work', '運動', '秒')}
        ${step('rest', '休憩', '秒')}
        ${step('rounds', 'ラウンド数', '回')}
        ${step('sets', 'セット数', 'セット')}
        ${step('setRest', 'セット間の休憩', '秒', c.sets > 1)}
        <label class="check-row"><input type="checkbox" data-h="toggle" data-k="warmupOn" ${c.warmupOn ? 'checked' : ''}> <span>ウォームアップ（足踏み・腕回し）</span></label>
        ${step('warmup', 'ウォームアップの時間', '秒', c.warmupOn)}
        <label class="check-row"><input type="checkbox" data-h="toggle" data-k="cooldownOn" ${c.cooldownOn ? 'checked' : ''}> <span>クールダウン（ゆっくり歩く・ストレッチ）</span></label>
        ${step('cooldown', 'クールダウンの時間', '秒', c.cooldownOn)}
        <button class="btn small ghost mt" data-h="save">この設定を保存する</button>
      </div>

      <div class="card">
        <div class="row between"><h3>各ラウンドの種目</h3><button class="btn small" data-h="auto">おまかせ</button></div>
        <p class="hint">持っている器具（ダンベル・ベンチ・懸垂スタンド・ステッパー）と自重でできる種目です。図をタップすると動きが見られます。</p>
        ${rows}
      </div>

      <div class="card">
        <h3>音と読み上げ</h3>
        <label class="check-row"><input type="checkbox" data-h="opt" data-k="sound" ${S().sound ? 'checked' : ''}> <span>音を鳴らす（開始・終了・残り3秒）</span></label>
        <label class="check-row"><input type="checkbox" data-h="opt" data-k="voice" ${S().voice ? 'checked' : ''}> <span>音声で読み上げる（種目名・「休憩」など）</span></label>
        <p class="hint">⚠️ iPhoneのマナーモード（消音）中は音が鳴りません。読み上げも小さくなったり鳴らなかったりします。音を使うときはマナーモードを解除し、音量を上げてください。タイマー中は画面が消えないようにします。</p>
      </div>

      <div class="bottom-cta"><button class="btn primary big" data-h="start">▶ スタート（約${fmtMin(totalSec(c))}）</button></div>`;
    el.onclick = onClick;
    el.onchange = onChange;
  }

  function onClick(e) {
    const b = e.target.closest('[data-h]');
    if (!b) return;
    const c = cfg();
    UI.unlockAudio();
    switch (b.dataset.h) {
      case 'step': {
        const k = b.dataset.k;
        const [lo, hi, st] = LIMITS[k];
        c[k] = Math.min(hi, Math.max(lo, c[k] + Number(b.dataset.d) * st));
        c.presetId = null;
        break;
      }
      case 'preset': {
        const p = PRESETS.concat(S().custom).find((x) => x.id === b.dataset.id);
        if (!p) return;
        Object.assign(c, { work: p.work, rest: p.rest, rounds: p.rounds, sets: p.sets, setRest: p.setRest, presetId: p.id });
        if (p.moves) c.moves = p.moves.slice();
        if (p.warmupOn != null) Object.assign(c, { warmupOn: p.warmupOn, warmup: p.warmup, cooldownOn: p.cooldownOn, cooldown: p.cooldown });
        break;
      }
      case 'delpreset':
        if (!confirm('この設定を削除しますか？')) return;
        S().custom = S().custom.filter((p) => p.id !== b.dataset.id);
        if (c.presetId === b.dataset.id) c.presetId = null;
        break;
      case 'save': {
        const name = (prompt('設定の名前（例：朝の10分）', '') || '').trim();
        if (!name) return;
        const id = 'c_' + UI.uid();
        S().custom.push({ id, name: name.slice(0, 20), work: c.work, rest: c.rest, rounds: c.rounds, sets: c.sets, setRest: c.setRest, warmupOn: c.warmupOn, warmup: c.warmup, cooldownOn: c.cooldownOn, cooldown: c.cooldown, moves: c.moves.slice() });
        c.presetId = id;
        UI.toast('設定を保存しました');
        break;
      }
      case 'auto': {
        // 初心者向けの種目を、続けて同じ部位にならない順で
        const start = Math.floor(Math.random() * BEGINNER_ROTATION.length);
        c.moves = Array.from({ length: c.rounds }, (_, i) => BEGINNER_ROTATION[(start + i) % BEGINNER_ROTATION.length]);
        break;
      }
      case 'moveinfo': showMove(b.dataset.id); return;
      case 'start': Store.save(); Runner.start(c); return;
      default: return;
    }
    Store.save();
    render(host);
  }

  function onChange(e) {
    const t = e.target;
    const c = cfg();
    if (t.dataset.h === 'move') { c.moves[Number(t.dataset.i)] = t.value; }
    else if (t.dataset.h === 'toggle') { c[t.dataset.k] = t.checked; }
    else if (t.dataset.h === 'opt') { S()[t.dataset.k] = t.checked; }
    else return;
    Store.save();
    render(host);
  }

  function showMove(id) {
    const m = MOVE[id];
    UI.sheet(`${UI.sheetHead(esc(m.name))}
      <div class="fig-wrap"><div class="fig-stage" id="hm-fig"></div></div>
      <p>${esc(m.tip)}</p>
      <p class="muted small">器具：${esc(m.equip)}${m.level > 1 ? ' ・ 中級者向け' : ' ・ 初心者OK'}</p>
      ${Figures.caption(id) ? `<p class="hint">${esc(Figures.caption(id))}</p>` : ''}
      ${UI.sheetFoot()}`, (sh) => Figures.mount(sh.querySelector('#hm-fig'), id));
  }

  // ================= 実行中の画面 =================
  const Runner = (() => {
    let el = null, ph = [], idx = 0, endAt = 0, paused = false, remainAtPause = 0;
    let startedAt = 0, activeSec = 0, phaseStart = 0, workDone = 0, workSec = 0;
    let lastShown = -1, timer = 0, wake = null, c = null;

    // ---- 音と読み上げ ----
    const tone = (freq, dur, vol = 0.35) => {
      if (!S().sound) return;
      try {
        UI.unlockAudio();
        const ctx = UI.audio();
        if (!ctx) return;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = freq;
        const t0 = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(ctx.destination);
        o.start(t0); o.stop(t0 + dur + 0.05);
      } catch (_) { /* 音が使えない */ }
    };
    const speak = (text) => {
      if (!S().voice || !window.speechSynthesis) return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP'; u.rate = 1.1;
        speechSynthesis.speak(u);
      } catch (_) { /* 読み上げが使えない */ }
    };

    async function lockScreen() {
      if (wake || !('wakeLock' in navigator)) return;
      try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch (_) { wake = null; }
    }
    const onVisible = () => { if (document.visibilityState === 'visible' && el) { lockScreen(); tick(); } };

    function start(cfgNow) {
      c = JSON.parse(JSON.stringify(cfgNow));
      ph = phases(c);
      idx = 0; paused = false; workDone = 0; workSec = 0; activeSec = 0; lastShown = -1;
      startedAt = Date.now();
      // iPhoneは「タップした直後」でないと読み上げが始まらないので、ここで一度空読みする
      if (S().voice && window.speechSynthesis) { try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (_) {} }
      el = document.createElement('div');
      el.id = 'hiit-run';
      el.innerHTML = `
        <div class="hr-top"><span class="hr-phase"></span><span class="hr-round"></span></div>
        <div class="hr-move"><div class="hr-fig"></div><div class="hr-mtext"><small class="hr-mlabel"></small><b class="hr-mname"></b><span class="hr-mtip"></span></div></div>
        <div class="hr-time" aria-live="off"></div>
        <div class="hr-next"></div>
        <div class="hr-bar"><div></div></div>
        <div class="hr-ctrl">
          <button data-r="pause" aria-label="一時停止">⏸<small>一時停止</small></button>
          <button data-r="skip" aria-label="スキップ">⏭<small>スキップ</small></button>
          <button data-r="end" aria-label="終了">✕<small>終了</small></button>
        </div>
        <p class="hr-note">マナーモード中は音が鳴りません ・ 息が上がりすぎたら休みましょう</p>`;
      el.addEventListener('click', onRunClick);
      document.body.appendChild(el);
      document.body.classList.add('hiit-on');
      lockScreen();
      document.addEventListener('visibilitychange', onVisible);
      enter(0, Date.now());
      timer = setInterval(tick, 100);
    }

    // フェーズに入る（音・読み上げ・表示の切り替え）
    function enter(i, at, quiet = false) {
      idx = i;
      const p = ph[i];
      phaseStart = at;
      endAt = at + p.sec * 1000;
      lastShown = -1;
      const P = PHASE[p.t];
      el.className = `hr-${P.cls}`;
      el.querySelector('.hr-phase').textContent = P.label;
      const totalRounds = c.rounds * c.sets;
      const doneR = (p.set ? (p.set - 1) * c.rounds : 0) + (p.round || 0);
      el.querySelector('.hr-round').textContent = p.t === 'work' || p.t === 'rest' ? `ラウンド ${doneR}/${totalRounds}${c.sets > 1 ? `・セット ${p.set}/${c.sets}` : ''}` : '';
      // 運動中はその種目、休憩中は次の種目を見せる
      const nextWork = ph.slice(i).find((x) => x.t === 'work');
      const showMove = p.t === 'work' ? p.move : (p.t === 'rest' || p.t === 'setrest' || p.t === 'prep' || p.t === 'warmup') && nextWork ? nextWork.move : null;
      const fig = el.querySelector('.hr-fig');
      if (showMove) {
        Figures.mount(fig, showMove);
        el.querySelector('.hr-mlabel').textContent = p.t === 'work' ? '' : '次の種目';
        el.querySelector('.hr-mname').textContent = MOVE[showMove].name;
        el.querySelector('.hr-mtip').textContent = MOVE[showMove].tip;
      } else {
        fig.innerHTML = '';
        el.querySelector('.hr-mlabel').textContent = '';
        el.querySelector('.hr-mname').textContent = p.t === 'cooldown' ? 'ゆっくり歩く・深呼吸・ストレッチ' : '';
        el.querySelector('.hr-mtip').textContent = '';
      }
      if (p.t === 'warmup') el.querySelector('.hr-mname').textContent = 'その場で足踏み・腕回し・軽いスクワット';
      const nx = ph[i + 1];
      el.querySelector('.hr-next').textContent = nx ? `次：${PHASE[nx.t].label}${nx.t === 'work' ? `（${MOVE[nx.move].name}）` : ''} ${nx.sec}秒` : '次：おわり';
      if (quiet) return;
      // 合図
      if (p.t === 'work') {
        tone(880, 0.45);
        const isLast = !ph.slice(i + 1).some((x) => x.t === 'work');
        speak(`${isLast ? 'ラスト、' : ''}${MOVE[p.move].name}`);
      } else if (p.t === 'rest' || p.t === 'setrest') {
        tone(523, 0.15); setTimeout(() => tone(523, 0.15), 200);
        speak(p.t === 'setrest' ? 'セット間の休憩' : '休憩');
      } else if (p.t === 'prep') speak('準備してください');
      else if (p.t === 'warmup') speak('ウォームアップ');
      else if (p.t === 'cooldown') { tone(523, 0.3); speak('クールダウン'); }
    }

    function complete(p, upto) {
      const done = Math.max(0, Math.min(p.sec, (upto - phaseStart) / 1000));
      activeSec += done;
      if (p.t === 'work') { workSec += done; if (done >= p.sec - 0.5) workDone++; }
    }

    function tick() {
      if (!el || paused) return;
      const now = Date.now();
      // 画面が止まっていた間に過ぎたフェーズは、音を鳴らさずに進める
      let skipped = 0;
      while (now >= endAt) {
        complete(ph[idx], endAt);
        if (idx + 1 >= ph.length) { finish(true); return; }
        const at = endAt;
        enter(idx + 1, at, true);
        skipped++;
      }
      if (skipped === 1) enter(idx, phaseStart); // 普通に1つ進んだときは合図を鳴らす
      const left = (endAt - now) / 1000;
      const sec = Math.ceil(left);
      const p = ph[idx];
      if (sec !== lastShown) {
        lastShown = sec;
        const t = el.querySelector('.hr-time');
        t.textContent = sec;
        const count = sec <= 3 && p.sec >= 5;
        t.classList.toggle('count', count);
        if (count) { tone(660, 0.12, 0.3); UI.vibrate(60); }
      }
      const total = ph.reduce((a, x) => a + x.sec, 0);
      const passed = ph.slice(0, idx).reduce((a, x) => a + x.sec, 0) + (p.sec - left);
      el.querySelector('.hr-bar div').style.width = `${Math.min(100, (passed / total) * 100)}%`;
    }

    function onRunClick(e) {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      UI.unlockAudio();
      const now = Date.now();
      if (b.dataset.r === 'pause') {
        if (!paused) { paused = true; remainAtPause = endAt - now; b.innerHTML = '▶<small>再開</small>'; el.classList.add('paused'); if (window.speechSynthesis) speechSynthesis.cancel(); }
        else { paused = false; endAt = now + remainAtPause; phaseStart = endAt - ph[idx].sec * 1000; b.innerHTML = '⏸<small>一時停止</small>'; el.classList.remove('paused'); }
      }
      if (b.dataset.r === 'skip') {
        if (paused) { paused = false; el.classList.remove('paused'); el.querySelector('[data-r="pause"]').innerHTML = '⏸<small>一時停止</small>'; endAt = now + remainAtPause; phaseStart = endAt - ph[idx].sec * 1000; }
        complete(ph[idx], now);
        if (idx + 1 >= ph.length) { finish(true); return; }
        enter(idx + 1, now);
      }
      if (b.dataset.r === 'end') {
        const wasPaused = paused;
        if (!paused) { paused = true; remainAtPause = endAt - now; }
        if (!confirm(workSec > 0 ? 'HIITを終了しますか？ここまでの分を記録します。' : 'HIITを終了しますか？（まだ運動していないので記録しません）')) {
          if (!wasPaused) { paused = false; endAt = Date.now() + remainAtPause; phaseStart = endAt - ph[idx].sec * 1000; }
          return;
        }
        // 一時停止中に終えた場合は、止めた時点までを数える
        complete(ph[idx], wasPaused ? phaseStart + (ph[idx].sec * 1000 - remainAtPause) : now);
        finish(false);
      }
    }

    function stop() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      if (wake) { wake.release(); wake = null; }
      if (window.speechSynthesis) speechSynthesis.cancel();
    }

    function finish(completed) {
      stop();
      const totalR = c.rounds * c.sets;
      const minutes = Math.max(1, Math.round(activeSec / 60));
      let saved = false;
      if (workSec >= 10) {
        const name = (PRESETS.concat(S().custom).find((p) => p.id === c.presetId) || {}).name || 'カスタム';
        Store.data.workouts.push({
          id: UI.uid(), date: UI.dateStr(), dayKey: 'hiit', startedAt, finishedAt: Date.now(), items: [],
          hiit: { name, work: c.work, rest: c.rest, rounds: c.rounds, sets: c.sets, doneRounds: workDone, totalRounds: totalR, workSec: Math.round(workSec), totalSec: Math.round(activeSec), completed, moves: c.moves.map((id) => MOVE[id].name) },
        });
        Store.save();
        saved = true;
      }
      if (completed) { UI.fanfare(); speak('お疲れさまでした'); }
      el.className = 'hr-done';
      el.innerHTML = `
        <div class="hr-result">
          <div class="hr-big">${completed ? '🎉' : '👍'}</div>
          <h2>${completed ? 'お疲れさまでした！' : 'ここまでお疲れさまでした'}</h2>
          <p><b>${workDone}</b> / ${totalR} ラウンド ・ 運動 <b>${fmtMin(Math.round(workSec))}</b> ・ 合計 <b>${fmtMin(Math.round(activeSec))}</b></p>
          <p class="small">${saved ? `記録に「HIIT」として保存し、今日の習慣チェックの運動時間に${minutes}分を加えました。` : '運動時間が短いため、記録はしていません。'}</p>
          <p class="small">しばらくは息を整えながら、ゆっくり歩きましょう。水分補給も忘れずに。</p>
          <button class="btn primary big" data-r="close">閉じる</button>
        </div>`;
      el.onclick = (e) => { if (e.target.closest('[data-r="close"]')) close(); };
      el.removeEventListener('click', onRunClick);
    }

    function close() {
      if (el) el.remove();
      el = null;
      document.body.classList.remove('hiit-on');
      App.render();
    }

    return { start };
  })();

  // 履歴などで使う短い説明
  const summary = (h) => `${h.name} ${h.work}秒/${h.rest}秒×${h.rounds}${h.sets > 1 ? `×${h.sets}セット` : ''} ・ ${h.doneRounds}/${h.totalRounds}ラウンド ・ ${fmtMin(h.totalSec)}`;

  return { render, summary, MOVES, phases, totalSec, PRESETS };
})();
