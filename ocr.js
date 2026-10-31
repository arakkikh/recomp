// 体組成のスクリーンショット読み取り
// ・文字認識は Tesseract.js をブラウザ内で実行する。画像は外部に送らない
//   （CDNから取得するのはプログラムと日本語の認識データだけ。APIキーは不要）
// ・予備として、iPhoneの「テキスト認識表示」でコピーした文字の貼り付けにも対応
const BodyImport = (() => {
  const { esc } = UI;
  const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  // ================= 文字列 → 値 =================
  // 見出しの候補（OCRの読み違いも少し許す）。長い見出しを優先してマッチさせる
  const LABELS = [
    ['muscleScore', ['筋肉スコア', '筋肉スコ', '肉スコア', 'スコア']],
    ['muscleQuality', ['筋質点数', '筋質点', '筋質', '質点数']],
    ['muscleKg', ['筋肉量', '筋肉重', '肉量']],
    ['fatPct', ['体脂肪率', '脂肪率', '体脂肪']],
    ['visceral', ['内臓脂肪レベル', '内臓脂肪', '内蔵脂肪', '臓脂肪', '内臓']],
    ['boneKg', ['推定骨量', '骨量', '推定骨']],
    ['waterPct', ['体水分率', '水分率', '体水分']],
    ['bmr', ['基礎代謝量', '基礎代謝', '代謝量', '基礎代']],
    ['bodyAge', ['体内年齢', '内年齢', '体内年', '年齢']],
    ['bmi', ['BMI', 'BM1', 'BMl', '8MI', 'B MI']],
    ['weight', ['体重']],
  ];
  // 妥当な範囲（範囲外は別の数字を探す）
  const RANGE = {
    weight: [20, 200], fatPct: [3, 60], muscleKg: [15, 100], muscleScore: [-4, 4], bmi: [10, 50],
    muscleQuality: [1, 120], visceral: [0.5, 30], boneKg: [0.5, 6], waterPct: [30, 75], bmr: [600, 3500], bodyAge: [12, 99],
  };
  const INT = new Set(['muscleScore', 'muscleQuality', 'bmr', 'bodyAge']);

  function normalize(t) {
    t = String(t || '').normalize('NFKC');           // 全角数字・記号 → 半角
    t = t.replace(/\r/g, '');
    t = t.replace(/[ \t　]+/g, ' ');
    // 日本語の文字の間に入った空白を詰める（「体 脂 肪 率」→「体脂肪率」）
    t = t.replace(/([぀-ヿ一-鿿])\s+(?=[぀-ヿ一-鿿])/g, '$1');
    t = t.replace(/(\d)\s*[.,・]\s*(\d)/g, '$1.$2');   // 「66 . 25」「66,25」→「66.25」
    t = t.replace(/[−–—‐ー]\s*(?=\d)/g, '-');          // マイナス記号のゆれ
    return t;
  }

  function findDate(t) {
    const now = new Date();
    let m = t.match(/(20\d{2})\s*[\/.年-]\s*(\d{1,2})\s*[\/.月-]\s*(\d{1,2})\s*日?/);
    let y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/))) {
      mo = +m[1]; d = +m[2];
    } else if ((m = t.match(/(^|[^\d.])(\d{1,2})\/(\d{1,2})(?=\s*[(（]|\s+\d{1,2}:\d{2})/))) {
      // 「10/28(火)」「10/28 07:12」の形。先頭の1文字は日付に含めない
      mo = +m[2]; d = +m[3];
      m = { index: m.index + m[1].length, 0: m[0].slice(m[1].length) };
    }
    if (m && y === undefined) {
      y = now.getFullYear();
      if (new Date(y, mo - 1, d) > now) y--; // 年がない日付が未来なら去年
    }
    if (!m || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { date: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, index: m.index, length: m[0].length };
  }

  function findTime(t) {
    const m = t.match(/(^|[^\d.])([01]?\d|2[0-3])\s*(?::|時)\s*([0-5]\d)\s*分?(?![\d.])/);
    if (!m) return null;
    return { time: `${m[2].padStart(2, '0')}:${m[3]}`, index: m.index + m[1].length, length: m[0].length - m[1].length };
  }

  // 文字数を変えずに一部を空白で消す（位置がずれないように）
  const blank = (t, i, n) => t.slice(0, i) + ' '.repeat(n) + t.slice(i + n);

  function parse(text) {
    const raw = String(text || '');
    let t = normalize(raw);
    const out = { values: {}, uncertain: [], missing: [], date: null, time: null, raw };

    const dt = findDate(t);
    if (dt) { out.date = dt.date; t = blank(t, dt.index, dt.length); }
    const tm = findTime(t);
    if (tm) { out.time = tm.time; t = blank(t, tm.index, tm.length); }

    // 見出しの位置を集める（重なったら長いほうを採用）
    let hits = [];
    LABELS.forEach(([key, words]) => words.forEach((w, rank) => {
      const re = new RegExp(w.replace(/\s/g, '\\s?'), w === 'BMI' || w.startsWith('B') || w.startsWith('8') ? 'gi' : 'g');
      let m;
      while ((m = re.exec(t))) hits.push({ key, rank, start: m.index, end: m.index + m[0].length });
    }));
    hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const kept = [];
    for (const h of hits) {
      const last = kept[kept.length - 1];
      if (last && h.start < last.end) continue;
      kept.push(h);
    }
    // 例：「体内年齢」が見つかったら、ただの「年齢」（利用者の年齢かもしれない）は使わない
    const bestRank = {};
    kept.forEach((h) => { bestRank[h.key] = Math.min(bestRank[h.key] ?? 99, h.rank); });
    hits = kept.filter((h) => h.rank === bestRank[h.key]);

    // 数字の位置を集める
    const nums = [];
    const re = /-?\d+(?:\.\d+)?/g;
    let m;
    while ((m = re.exec(t))) nums.push({ v: m[0], start: m.index, end: m.index + m[0].length, used: false });

    const inRange = (key, s) => {
      let v = parseFloat(s);
      const [lo, hi] = RANGE[key];
      if (INT.has(key) && s.includes('.') && !/\.0+$/.test(s)) return null;
      if (v >= lo && v <= hi) return { v, unsure: false };
      // 小数点の読み落とし（6625 → 66.25 など）を救う。ただし「要確認」にする
      if (!s.includes('.') && !INT.has(key)) {
        for (const div of [10, 100]) { const x = v / div; if (x >= lo && x <= hi) return { v: x, unsure: true }; }
      }
      return null;
    };
    const take = (key, n) => {
      const r = inRange(key, n.v);
      if (!r || out.values[key] != null) return false;
      out.values[key] = r.v; n.used = true;
      if (r.unsure) out.uncertain.push(key);
      return true;
    };

    // ① 表形式：見出しだけが並ぶ行の次の行に、数字が同じ順で並ぶ場合
    const lines = [];
    let pos = 0;
    t.split('\n').forEach((line) => { lines.push({ start: pos, end: pos + line.length }); pos += line.length + 1; });
    lines.forEach((ln, li) => {
      const hs = hits.filter((h) => h.start >= ln.start && h.end <= ln.end);
      const nsHere = nums.filter((n) => n.start >= ln.start && n.end <= ln.end);
      if (hs.length < 2 || nsHere.length) return;
      for (let k = li + 1; k < lines.length && k <= li + 2; k++) {
        const ns = nums.filter((n) => !n.used && n.start >= lines[k].start && n.end <= lines[k].end);
        if (ns.length === hs.length) { hs.forEach((h, i) => { if (take(h.key, ns[i])) h.done = true; }); break; }
      }
    });

    // レイアウトの向きを判定：見出しだけの行が多く、最初の見出しの前の行が数字だけなら「数字が上」
    const numsIn = (ln) => nums.some((n) => n.start >= ln.start && n.end <= ln.end);
    const hitsIn = (ln) => hits.some((h) => h.start >= ln.start && h.end <= ln.end);
    const labelLines = lines.filter(hitsIn);
    let numbersFirst = false;
    if (labelLines.length && labelLines.filter((ln) => !numsIn(ln)).length > labelLines.length / 2) {
      const li = lines.indexOf(labelLines[0]);
      for (let k = li - 1; k >= 0; k--) {
        if (!t.slice(lines[k].start, lines[k].end).trim()) continue;
        numbersFirst = numsIn(lines[k]) && !hitsIn(lines[k]);
        break;
      }
    }

    const passAfter = () => hits.forEach((h, i) => {
      if (h.done || out.values[h.key] != null) return;
      const limit = Math.min(i + 1 < hits.length ? hits[i + 1].start : t.length, h.end + 40);
      for (const n of nums) {
        if (n.used || n.start < h.end || n.start >= limit) continue;
        if (take(h.key, n)) { h.done = true; break; }
      }
    });

    // ③ 見出しの直前（数字が上、見出しが下のレイアウト）
    const passBefore = () => hits.forEach((h, i) => {
      if (h.done || out.values[h.key] != null) return;
      const from = Math.max(i > 0 ? hits[i - 1].end : 0, h.start - 25);
      const cands = nums.filter((n) => !n.used && n.end <= h.start && n.start >= from).reverse();
      for (const n of cands) if (take(h.key, n)) { h.done = true; break; }
    });

    if (numbersFirst) { passBefore(); passAfter(); } else { passAfter(); passBefore(); }

    // 整合性チェック：体重とBMIが両方あるのに大きく矛盾しない、などは確認画面で人が見る
    out.missing = Body.FIELDS.map((f) => f.k).filter((k) => out.values[k] == null);
    return out;
  }

  // ================= 画像の前処理 =================
  async function loadImage(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file); } catch (_) { /* 下の方法で読む */ }
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を開けませんでした'));
      img.src = URL.createObjectURL(file);
    });
  }

  // 白黒にしてコントラストを上げる。ダークモードの画面（暗い背景に白い文字）は反転する
  function preprocess(img) {
    const w0 = img.width, h0 = img.height;
    const scale = Math.min(1, 2400 / Math.max(w0, h0)) * (w0 < 900 ? 1.6 : 1);
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h);
    const p = id.data;
    let sum = 0;
    for (let i = 0; i < p.length; i += 4) {
      const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      p[i] = g; sum += g;
    }
    const mean = sum / (p.length / 4);
    const invert = mean < 110;
    for (let i = 0; i < p.length; i += 4) {
      let g = p[i];
      if (invert) g = 255 - g;
      g = Math.max(0, Math.min(255, (g - 128) * 1.4 + 128)); // コントラスト強め
      p[i] = p[i + 1] = p[i + 2] = g;
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  // ================= Tesseract.js =================
  let loading = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESS_URL;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error('文字認識の読み込みに失敗しました（インターネット接続を確認してください）')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  let cancelled = false;
  let worker = null;

  async function recognize(canvas, onProgress) {
    await loadTesseract();
    const STATUS = {
      'loading tesseract core': '文字認識の準備中',
      'initializing tesseract': '文字認識の準備中',
      'loading language traineddata': '日本語データを読み込み中（初回のみ数MB）',
      'initializing api': '準備中',
      'recognizing text': '文字を読み取り中',
    };
    worker = await Tesseract.createWorker('jpn', 1, {
      logger: (m) => onProgress(STATUS[m.status] || '処理中', m.progress || 0),
    });
    if (cancelled) throw new Error('cancel');
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas);
    await worker.terminate();
    worker = null;
    return data.text;
  }

  async function cancel() {
    cancelled = true;
    if (worker) { try { await worker.terminate(); } catch (_) {} worker = null; }
  }

  // ================= 画面 =================
  function open() {
    cancelled = false;
    const html = `
      <div class="sheet-head"><button class="back-btn" data-x="close">‹ 戻る</button><h3>写真から読み取り</h3></div>
      <p class="muted small">タニタの連携アプリで、測定結果が表示された画面のスクリーンショットを選んでください。</p>
      <label class="btn primary big file-btn">📷 スクリーンショットを選ぶ
        <input type="file" accept="image/*" id="ocr-file" hidden></label>
      <p class="hint">🔒 画像はこの端末の中だけで処理し、外部には送りません。初回だけ、文字認識のプログラムと日本語データ（数MB）をダウンロードします。読み取りには10〜40秒ほどかかります。</p>

      <div class="card inset">
        <h4>うまく読めないときは（文字の貼り付け）</h4>
        <ol class="small steps">
          <li>写真アプリでスクリーンショットを開く</li>
          <li>右下の「テキスト認識表示」ボタン（四角の中に線のアイコン）をタップ</li>
          <li>「すべてをコピー」をタップ（出ないときは文字を長押し→「すべてを選択」→「コピー」）</li>
          <li>下の欄に貼り付けて「読み取る」</li>
        </ol>
        <textarea id="ocr-paste" rows="5" placeholder="ここに貼り付け"></textarea>
        <button class="btn block mt" data-x="paste">貼り付けた文字を読み取る</button>
      </div>
      ${UI.sheetFoot()}`;
    UI.sheet(html, (sh) => {
      sh.querySelector('#ocr-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) runImage(f); });
      sh.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'close') UI.closeSheet();
        if (b.dataset.x === 'paste') {
          const text = sh.querySelector('#ocr-paste').value;
          if (!text.trim()) { UI.toast('文字が貼り付けられていません'); return; }
          showResult(parse(text), 'paste');
        }
      });
    });
  }

  async function runImage(file) {
    cancelled = false;
    UI.sheet(`
      <div class="sheet-head"><button class="back-btn" data-x="back">‹ 戻る</button><h3>読み取り中…</h3></div>
      <p id="ocr-status" class="muted">画像を準備中</p>
      <div class="meter"><div id="ocr-bar" style="width:0%"></div></div>
      <p class="hint">画面を閉じずにお待ちください。途中でやめるときは「戻る」を押してください。</p>`, (sh) => {
      sh.addEventListener('click', (e) => { if (e.target.closest('[data-x="back"]')) { cancel(); open(); } });
    });
    const setP = (label, p) => {
      const s = document.getElementById('ocr-status');
      const b = document.getElementById('ocr-bar');
      if (s) s.textContent = `${label}… ${Math.round(p * 100)}%`;
      if (b) b.style.width = `${Math.round(p * 100)}%`;
    };
    try {
      const img = await loadImage(file);
      const canvas = preprocess(img);
      if (img.close) img.close();
      const text = await recognize(canvas, setP);
      // 途中で「戻る」やスワイプで読み取り画面を離れていたら、結果は出さない
      if (cancelled || !document.getElementById('ocr-status')) return;
      const r = parse(text);
      if (Object.keys(r.values).length === 0) {
        failed('数値を読み取れませんでした。測定結果の数字がはっきり写った画面か確認するか、下の「文字の貼り付け」を使ってください。', text);
        return;
      }
      showResult(r, 'photo');
    } catch (err) {
      if (cancelled || err.message === 'cancel') return;
      console.error(err);
      failed(err.message || '読み取りに失敗しました', '');
    }
  }

  function failed(msg, raw) {
    UI.sheet(`
      <div class="sheet-head"><button class="back-btn" data-x="back">‹ 戻る</button><h3>読み取れませんでした</h3></div>
      <p>${esc(msg)}</p>
      ${raw ? `<details class="raw"><summary class="muted small">読み取った文字を見る</summary><pre>${esc(raw)}</pre></details>` : ''}
      <button class="btn primary big mt" data-x="back">別の方法を試す</button>
      <button class="btn block mt" data-x="manual">手入力する</button>`, (sh) => {
      sh.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'back') open();
        if (b.dataset.x === 'manual') Body.openForm(UI.dateStr(), { onBack: open });
      });
    });
  }

  function showResult(r, source) {
    const today = UI.dateStr();
    const date = r.date && r.date <= today ? r.date : today;
    Body.openForm(date, {
      prefill: r.values, time: r.time, missing: r.missing, uncertain: r.uncertain,
      raw: r.raw, source, dateFound: !!(r.date && r.date <= today), onBack: open,
    });
  }

  return { open, parse };
})();
