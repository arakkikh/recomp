// 共通ヘルパー：エスケープ、日付、ボトムシート、トースト
const UI = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const pad = (n) => String(n).padStart(2, '0');
  // ローカル時刻での YYYY-MM-DD
  const dateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const fmtDate = (s) => { const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
  const fmtShort = (s) => { const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const fmtClock = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${pad(sec % 60)}`; };
  const num = (n) => (Math.round(n * 100) / 100).toString();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // 週の開始（月曜）
  const weekStart = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

  // ---- ボトムシート ----
  // 開くときに履歴を1つ積むので、ブラウザの「戻る」やiPhoneの左端スワイプでも
  // アプリを離れずにサブ画面だけが閉じる
  let sheetEl = null;
  let pushed = false;   // 履歴を積んでいるか
  let ignorePops = 0;   // 自分で history.back() した分の popstate は無視する
  function removeSheet() {
    if (!sheetEl) return;
    sheetEl.remove();
    sheetEl = null;
    document.body.classList.remove('no-scroll');
  }
  function fitViewport() {
    const vv = window.visualViewport;
    if (!sheetEl || !vv) return;
    sheetEl.style.top = `${vv.offsetTop}px`;
    sheetEl.style.height = `${vv.height}px`;
    sheetEl.style.bottom = 'auto';
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitViewport);
    window.visualViewport.addEventListener('scroll', fitViewport);
  }
  function sheet(html, onMount) {
    removeSheet();
    if (!pushed) { history.pushState({ sheet: 1 }, ''); pushed = true; }
    sheetEl = document.createElement('div');
    sheetEl.className = 'sheet-overlay';
    sheetEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div>`;
    sheetEl.addEventListener('click', (e) => {
      if (e.target === sheetEl || e.target.closest('[data-sheet-back]')) closeSheet();
    });
    document.body.appendChild(sheetEl);
    document.body.classList.add('no-scroll');
    fitViewport();
    requestAnimationFrame(() => sheetEl && sheetEl.classList.add('open'));
    if (onMount) onMount(sheetEl.querySelector('.sheet'));
    return sheetEl;
  }
  function closeSheet() {
    removeSheet();
    if (pushed) { pushed = false; ignorePops++; history.back(); }
  }
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) { ignorePops--; return; }
    if (sheetEl) { pushed = false; removeSheet(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetEl) closeSheet(); });

  // ---- トースト ----
  let toastTimer;
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---- 音（iOSは最初のタップで解錠が必要）----
  let audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (_) { /* 音が使えない環境 */ }
  }
  function beep(times = 3) {
    if (!audioCtx) return;
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      const t0 = audioCtx.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + 0.3);
    }
  }
  const vibrate = (p) => { if (navigator.vibrate) navigator.vibrate(p); };
  function fanfare() {
    if (!audioCtx) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const t0 = audioCtx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i === 3 ? 0.6 : 0.2));
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + 0.7);
    });
  }

  // ---- お祝い表示（自己ベスト更新など）。タップか4秒で閉じる ----
  function celebrate(title, lines = []) {
    document.querySelectorAll('.celebrate').forEach((n) => n.remove());
    const el = document.createElement('div');
    el.className = 'celebrate';
    el.setAttribute('role', 'alert');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const COLORS = ['#1f6fe0', '#1f8a4c', '#f0a440', '#e5484d', '#8e4ec6'];
    const confetti = reduce ? '' : Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${COLORS[i % COLORS.length]};animation-delay:${(i % 7) * 0.08}s;animation-duration:${1.6 + (i % 5) * 0.25}s"></i>`).join('');
    el.innerHTML = `<div class="confetti">${confetti}</div>
      <div class="celebrate-card">
        <div class="celebrate-icon">🏆</div>
        <b>${esc(title)}</b>
        ${lines.map((l) => `<p>${l}</p>`).join('')}
        <span class="muted small">タップで閉じる</span>
      </div>`;
    el.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    fanfare();
    vibrate([60, 40, 60]);
    setTimeout(() => el.remove(), 4000);
  }

  // サブ画面の見出し行（左上に「戻る」）と、一番下の「戻る」
  const sheetHead = (title) => `<div class="sheet-head"><button class="back-btn" data-sheet-back>‹ 戻る</button><h3>${title}</h3></div>`;
  const sheetFoot = (extra = '') => `<div class="row gap mt form-foot"><button class="btn ghost" data-sheet-back>‹ 戻る</button>${extra}</div>`;

  const audio = () => audioCtx;

  return { audio, celebrate, fanfare, sheetHead, sheetFoot, esc, dateStr, parseDate, fmtDate, fmtShort, fmtClock, num, uid, weekStart, sheet, closeSheet, toast, unlockAudio, beep, vibrate };
})();
