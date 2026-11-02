// 食事のカロリー記録
// 方法A：Claudeアプリに「写真＋質問文」を送り、返ってきた回答を貼り付けて読み取る（サーバー不要・無料）
// 方法B：設定でAPIキーを入れたときだけ、アプリから直接 Claude API に写真を送って推定（有料）
// ・APIキーはこの端末の localStorage にだけ保存し、バックアップのJSONにも入れない
// ・写真は小さなサムネイルだけをこの端末（IndexedDB）に保存
const Meals = (() => {
  const { esc } = UI;
  const SLOTS = [['breakfast', '朝食', '🌅'], ['lunch', '昼食', '☀️'], ['dinner', '夕食', '🌙'], ['snack', '間食', '🍪']];
  const SLOT = Object.fromEntries(SLOTS.map(([k, l, i]) => [k, { label: l, icon: i }]));
  const S = () => Store.data;
  const dayList = (d) => S().meals[d] || [];

  // ================= 合計 =================
  function totals(d) {
    const t = { kcal: 0, p: 0, f: 0, c: 0, n: 0 };
    dayList(d).forEach((m) => { t.kcal += m.kcal || 0; t.p += m.p || 0; t.f += m.f || 0; t.c += m.c || 0; t.n++; });
    return t;
  }
  const proteinOf = (d) => Math.round(totals(d).p);

  // 今の時刻から食事の区分を推測
  function guessSlot() {
    const h = new Date().getHours();
    return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 17 ? 'snack' : 'dinner';
  }

  // ================= 回答の読み取り =================
  // Claude にお願いする回答の形
  const ASK_TEXT = `この写真の食事について、栄養のおおよその目安を推定してください。

・写っている料理・食品ごとに分けてください
・量は見た目から推定してください（例：ご飯 茶碗1杯 約150g）
・はっきり分からなくても、もっともありそうな値で推定してください
・調理に使われていそうな油や調味料も含めてください

回答の最後に、必ず次の形のJSONを \`\`\`json と \`\`\` で囲んで出してください。数値は数字だけ（単位なし）にしてください。
\`\`\`json
{"items":[{"name":"料理名","amount":"量の目安","kcal":0,"protein":0,"fat":0,"carbs":0}],"note":"補足（なければ空）"}
\`\`\`
kcal はキロカロリー、protein（タンパク質）・fat（脂質）・carbs（炭水化物）はグラムです。`;

  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const m = String(v ?? '').normalize('NFKC').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };
  const pick = (o, keys) => { for (const k of keys) if (o[k] != null) return o[k]; return null; };
  function normItem(o) {
    const it = {
      name: String(pick(o, ['name', '料理名', 'food', 'dish']) || '').trim() || '食事',
      amount: String(pick(o, ['amount', '量', 'portion', 'quantity']) || '').trim(),
      kcal: num(pick(o, ['kcal', 'calories', 'calorie', 'カロリー', 'energy'])),
      p: num(pick(o, ['protein', 'p', 'P', 'タンパク質', 'たんぱく質'])),
      f: num(pick(o, ['fat', 'f', 'F', '脂質'])),
      c: num(pick(o, ['carbs', 'carbohydrates', 'carbohydrate', 'c', 'C', '炭水化物'])),
    };
    return it;
  }

  // 貼り付けた文章（またはAPIの回答）から品目を取り出す → { items, note }
  function parseAnswer(text) {
    const t = String(text || '').normalize('NFKC');
    // ① JSON（```json ... ``` か、{ ... "items" ... }）
    const blocks = [];
    const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
    let m;
    while ((m = fence.exec(t))) blocks.push(m[1]);
    const first = t.indexOf('{'), last = t.lastIndexOf('}');
    if (first >= 0 && last > first) blocks.push(t.slice(first, last + 1));
    for (const b of blocks.reverse()) {
      try {
        const j = JSON.parse(b.replace(/,\s*([}\]])/g, '$1'));
        const arr = Array.isArray(j) ? j : Array.isArray(j.items) ? j.items : null;
        if (arr && arr.length) return { items: arr.map(normItem).filter((x) => x.kcal != null || x.p != null), note: (j && j.note) || '' };
      } catch (_) { /* 次の候補へ */ }
    }
    // ② 文章の各行から「◯◯kcal」「タンパク質◯g」を拾う
    const items = [];
    t.split('\n').forEach((line) => {
      const k = line.match(/(\d+(?:\.\d+)?)\s*(?:kcal|キロカロリー)/i);
      if (!k || /合計|トータル|total/i.test(line)) return;
      const g = (re) => { const x = line.match(re); return x ? parseFloat(x[1]) : null; };
      const name = line.replace(/^[\s\-・*#\d.|]+/, '').split(/[:：|（(]|\d/)[0].trim() || '食事';
      items.push({
        name, amount: '',
        kcal: parseFloat(k[1]),
        p: g(/(?:タンパク質|たんぱく質|protein|\bP)\s*[:：]?\s*(\d+(?:\.\d+)?)/i),
        f: g(/(?:脂質|fat|\bF)\s*[:：]?\s*(\d+(?:\.\d+)?)/i),
        c: g(/(?:炭水化物|carbs?|\bC)\s*[:：]?\s*(\d+(?:\.\d+)?)/i),
      });
    });
    return { items, note: '' };
  }

  // ================= Claude API（方法B）=================
  const KEY_STORE = 'recomp.apiKey'; // 記録データとは別の場所。バックアップには含めない
  const getKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch (_) { return ''; } };
  const setKey = (k) => { try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (_) {} };
  const MODELS = [
    // 1MTokあたりの料金（ドル）：入力 / 出力
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5（標準・いちばん正確）', in: 4, out: 20, fallback: true },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5（約半額）', in: 2, out: 10, fallback: true },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5（とても安い・精度は下がる）', in: 0.1, out: 0.5, fallback: false },
  ];
  const YEN_PER_USD = 150;
  const API_SCHEMA = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' }, amount: { type: 'string' },
            kcal: { type: 'number' }, protein: { type: 'number' }, fat: { type: 'number' }, carbs: { type: 'number' },
          },
          required: ['name', 'amount', 'kcal', 'protein', 'fat', 'carbs'],
          additionalProperties: false,
        },
      },
      note: { type: 'string' },
    },
    required: ['items', 'note'],
    additionalProperties: false,
  };
  const API_TEXT = `この写真の食事について、栄養のおおよその目安を日本語で推定してください。
写っている料理・食品ごとに分け、量は見た目から推定してください（例：ご飯 茶碗1杯 約150g）。
はっきり分からなくても、もっともありそうな値にしてください。調理に使われていそうな油や調味料も含めます。
kcal はキロカロリー、protein・fat・carbs はグラムの数値です。食事が写っていない場合は items を空にし、note に理由を書いてください。`;

  async function estimateWithApi(jpegB64) {
    const key = getKey();
    if (!key) throw new Error('APIキーが設定されていません');
    const model = MODELS.find((x) => x.id === S().settings.aiModel) || MODELS[0];
    const headers = {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2026-10-21',
      // ブラウザから直接呼ぶための宣言（公式SDKの dangerouslyAllowBrowser と同じ）
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    const body = {
      model: model.id,
      max_tokens: 16000,
      // 形式を固定（JSONで返させる）。食事の推定は簡単な作業なので思考は少なめ
      output_config: { effort: 'low', format: { type: 'json_schema', schema: API_SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegB64 } },
          { type: 'text', text: API_TEXT },
        ],
      }],
    };
    // Opus / Sonnet は、安全上の理由で断られたときに別モデルで自動再試行する
    if (model.fallback) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }

    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (_) {
      throw new Error('通信できませんでした。インターネット接続を確認してください');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error && data.error.message) || '';
      if (res.status === 401) throw new Error('APIキーが正しくないか、無効になっています');
      if (res.status === 403) throw new Error('このAPIキーでは利用できません（権限を確認してください）');
      if (res.status === 429) throw new Error('混み合っているか、利用上限に達しています。少し待ってからもう一度');
      if (res.status === 529 || res.status >= 500) throw new Error('Claude側が混み合っています。少し待ってからもう一度');
      throw new Error(`推定できませんでした（${res.status}）${msg ? '：' + msg : ''}`);
    }
    if (data.stop_reason === 'refusal') throw new Error('この写真は推定できませんでした（安全上の理由で断られました）');
    if (data.stop_reason === 'max_tokens') throw new Error('回答が途中で切れました。もう一度試してください');
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = parseAnswer(text);
    const u = data.usage || {};
    const usd = ((u.input_tokens || 0) * model.in + (u.output_tokens || 0) * model.out) / 1e6;
    return { ...parsed, cost: { usd, yen: usd * YEN_PER_USD, inTok: u.input_tokens || 0, outTok: u.output_tokens || 0, model: data.model || model.id } };
  }

  // ================= 写真（サムネイルだけ保存）=================
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const r = indexedDB.open('recomp-meal-photos', 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('thumbs')) r.result.createObjectStore('thumbs', { keyPath: 'id' }); };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => { dbp = null; reject(r.error); };
      });
    }
    return dbp;
  }
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const thumbStore = async (mode) => (await db()).transaction('thumbs', mode).objectStore('thumbs');
  const putThumb = async (id, buf) => req((await thumbStore('readwrite')).put({ id, data: buf }));
  const getThumb = async (id) => { const r = await req((await thumbStore('readonly')).get(id)); return r ? r.data : null; };
  const delThumb = async (id) => req((await thumbStore('readwrite')).delete(id));
  const clearThumbs = async () => req((await thumbStore('readwrite')).clear());

  async function loadImage(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) {} }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を開けませんでした'));
      img.src = URL.createObjectURL(file);
    });
  }
  function toCanvas(img, max) {
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  const canvasBlob = (c, q) => new Promise((r) => c.toBlob(r, 'image/jpeg', q));
  // 写真を読み込んで、保存用サムネイル（320px）と API 送信用（長い辺1000px、約1,000トークン）を作る
  async function preparePhoto(file) {
    const img = await loadImage(file);
    const thumbBlob = await canvasBlob(toCanvas(img, 320), 0.7);
    const apiB64 = toCanvas(img, 1000).toDataURL('image/jpeg', 0.8).split(',')[1];
    if (img.close) img.close();
    return { thumb: await thumbBlob.arrayBuffer(), apiB64, previewUrl: URL.createObjectURL(thumbBlob) };
  }

  // ================= 画面（習慣タブの中のカード）=================
  function cardHtml(d) {
    const t = Habits.targets();
    const tot = totals(d);
    const trained = Habits.trainedOn(d);
    const goal = t.ok ? { kcal: trained ? t.train : t.rest, p: t.protein, f: Math.round(((trained ? t.train : t.rest) * 0.25) / 9) } : null;
    if (goal) goal.c = Math.max(0, Math.round((goal.kcal - goal.p * 4 - goal.f * 9) / 4));
    const bar = (label, v, g, unit, kind) => {
      const pct = g ? Math.min(100, (v / g) * 100) : 0;
      const over = g && v > g * 1.1;
      const state = !g ? '' : kind === 'min' ? (v >= g * 0.9 ? 'ok' : '') : over ? 'over' : '';
      return `<div class="mb-row"><span class="mb-l">${label}</span>
        <div class="mb-track"><div class="mb-fill ${state}" style="width:${pct}%"></div></div>
        <span class="mb-v"><b>${Math.round(v)}</b>${g ? `<small>/${g}${unit}</small>` : `<small>${unit}</small>`}</span></div>`;
    };
    const slots = SLOTS.map(([k, l, ic]) => {
      const list = dayList(d).filter((m) => m.slot === k);
      const kc = list.reduce((a, m) => a + (m.kcal || 0), 0);
      return `<div class="meal-slot">
        <div class="ms-head"><b>${ic} ${l}</b><span class="muted small">${list.length ? `${Math.round(kc)} kcal` : ''}</span><button class="btn small" data-m="add" data-slot="${k}">＋ 追加</button></div>
        ${list.map((m) => `<button class="meal-item" data-m="edit" data-id="${m.id}">
          ${m.photo ? `<img class="mi-thumb" data-thumb="${m.photo}" alt="">` : '<span class="mi-thumb none">🍽</span>'}
          <span class="mi-name">${esc(m.name)}${m.amount ? `<small class="muted"> ${esc(m.amount)}</small>` : ''}</span>
          <span class="mi-v">${Math.round(m.kcal || 0)}<small>kcal</small><br><small class="muted">P${Math.round(m.p || 0)}</small></span>
        </button>`).join('')}
      </div>`;
    }).join('');
    return `<div class="card meals">
      <div class="row between"><h3>🍽 食事の記録</h3>${goal ? `<span class="tag">${trained ? '筋トレの日' : '休みの日'}の目安</span>` : ''}</div>
      ${goal ? `${bar('カロリー', tot.kcal, goal.kcal, 'kcal', 'max')}${bar('タンパク質', tot.p, goal.p, 'g', 'min')}${bar('脂質', tot.f, goal.f, 'g', 'max')}${bar('炭水化物', tot.c, goal.c, 'g', 'max')}`
        : `<p class="muted small">${esc(t.reason)}</p>${bar('カロリー', tot.kcal, 0, 'kcal')}${bar('タンパク質', tot.p, 0, 'g')}`}
      <p class="hint">写真からの推定は<b>あくまで目安</b>です。量・油・調味料で大きく変わります。タンパク質の合計は、下の習慣チェックにも自動で入ります。</p>
      ${slots}
      ${S().mealFavs.length ? `<button class="btn block mt" data-m="favs">★ お気に入りから追加</button>` : ''}
      ${t.ok ? `<details class="calc"><summary class="muted small">目安の計算の根拠</summary><ul class="small">
        <li>体重 ${t.weight}kg × ${S().settings.proteinPerKg}g ＝ タンパク質 ${t.protein}g</li>
        <li>基礎代謝 ${t.bmr}kcal（${esc(t.bmrSrc)}）× 活動係数 ${t.af} ＝ 消費 約${t.tdee.toLocaleString()}kcal</li>
        <li>筋トレの日は消費とほぼ同じ（${t.train.toLocaleString()}kcal）、休みの日は約15%少なめ（${t.rest.toLocaleString()}kcal）</li>
        <li>脂質はカロリーの25%、残りを炭水化物にしています</li></ul></details>` : ''}
    </div>`;
  }

  // サムネイルを読み込んで表示
  const thumbUrls = [];
  async function fillThumbs(root) {
    thumbUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    const imgs = root.querySelectorAll('img[data-thumb]');
    for (const im of imgs) {
      try {
        const buf = await getThumb(im.dataset.thumb);
        if (buf && im.isConnected) { const u = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' })); thumbUrls.push(u); im.src = u; }
      } catch (_) { /* 写真が読めない環境 */ }
    }
  }

  // ================= 追加の流れ =================
  let ctx = null; // { date, slot, photo:{thumb, apiB64, previewUrl}|null, pasted, onDone }

  function onClick(b, date, rerender) {
    const act = b.dataset.m;
    if (act === 'add') openAdd({ date, slot: b.dataset.slot || guessSlot(), photo: null, pasted: '', onDone: rerender });
    if (act === 'edit') openEdit(date, b.dataset.id, rerender);
    if (act === 'favs') openFavs({ date, slot: guessSlot(), photo: null, pasted: '', onDone: rerender });
  }

  const slotChips = (sel) => `<div class="chips" id="m-slot">${SLOTS.map(([k, l, ic]) => `<button class="chip ${k === sel ? 'on' : ''}" data-slot="${k}">${ic} ${l}</button>`).join('')}</div>`;
  const bindSlot = (sh) => sh.querySelector('#m-slot').addEventListener('click', (e) => {
    const c = e.target.closest('[data-slot]');
    if (!c) return;
    ctx.slot = c.dataset.slot;
    sh.querySelectorAll('#m-slot [data-slot]').forEach((x) => x.classList.toggle('on', x.dataset.slot === ctx.slot));
  });

  function openAdd(c) {
    ctx = c;
    const hasKey = !!getKey();
    const html = `
      ${UI.sheetHead(`${SLOT[ctx.slot].label}を追加`)}
      ${slotChips(ctx.slot)}
      <div class="m-photo">
        ${ctx.photo ? `<img src="${ctx.photo.previewUrl}" alt="選んだ写真">` : '<span class="muted small">写真はなくても記録できます</span>'}
        <label class="btn file-btn">${ctx.photo ? '写真を変える' : '📷 写真を撮る／選ぶ'}<input type="file" accept="image/*" id="m-file" hidden></label>
      </div>

      ${hasKey ? `<button class="btn primary big" data-a="api" ${ctx.photo ? '' : 'disabled'}>🤖 写真から自動で推定（Claude API）</button>
        <p class="hint center">${ctx.photo ? 'APIの利用料がかかります（1枚あたり数円程度）' : '先に写真を選んでください'}</p>` : ''}

      <div class="card inset">
        <h4>${hasKey ? 'Claudeアプリで推定する（無料）' : 'Claudeアプリで推定する'}</h4>
        <ol class="small steps">
          <li><button class="btn small" data-a="copy">Claudeに聞く用の文章をコピー</button></li>
          <li>Claudeアプリを開き、料理の写真と、コピーした文章を貼り付けて送る</li>
          <li>返ってきた回答を<b>全部コピー</b>して、下に貼り付ける</li>
        </ol>
        <textarea id="m-paste" rows="5" placeholder="Claudeの回答をここに貼り付け">${esc(ctx.pasted)}</textarea>
        <button class="btn block mt" data-a="parse">貼り付けた回答を読み取る</button>
      </div>

      <div class="row gap mt">
        <button class="btn" data-a="manual">✏️ 手入力</button>
        ${S().mealFavs.length ? '<button class="btn" data-a="favs">★ お気に入り</button>' : ''}
      </div>
      ${UI.sheetFoot()}`;
    UI.sheet(html, (sh) => {
      bindSlot(sh);
      sh.querySelector('#m-paste').addEventListener('input', (e) => { ctx.pasted = e.target.value; });
      sh.querySelector('#m-file').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try { ctx.photo = await preparePhoto(f); openAdd(ctx); } catch (err) { UI.toast(err.message); }
      });
      sh.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        const a = b.dataset.a;
        if (a === 'copy') copyText(ASK_TEXT);
        if (a === 'parse') {
          const r = parseAnswer(ctx.pasted);
          if (!r.items.length) { UI.toast('読み取れませんでした。Claudeの回答を最後まで全部貼り付けてください'); return; }
          openConfirm(r.items, { note: r.note, source: 'claude' });
        }
        if (a === 'manual') openConfirm([{ name: '', amount: '', kcal: null, p: null, f: null, c: null }], { source: 'manual' });
        if (a === 'favs') openFavs(ctx);
        if (a === 'api') {
          b.disabled = true;
          b.textContent = '推定中…（10〜30秒）';
          try {
            const r = await estimateWithApi(ctx.photo.apiB64);
            if (!r.items.length) { UI.toast(r.note || '食事が見つかりませんでした'); openAdd(ctx); return; }
            openConfirm(r.items, { note: r.note, source: 'api', cost: r.cost });
          } catch (err) {
            UI.toast(err.message);
            b.disabled = false;
            b.textContent = '🤖 写真から自動で推定（Claude API）';
          }
        }
      });
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      UI.toast('コピーしました。Claudeアプリで写真と一緒に送ってください');
    } catch (_) {
      // 古い方法でコピー
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove();
      UI.toast(ok ? 'コピーしました' : 'コピーできませんでした');
    }
  }

  // ---- 確認画面（値を直してから保存）----
  function itemRow(it, i) {
    const v = (x) => (x == null ? '' : Math.round(x * 10) / 10);
    return `<div class="mc-item" data-i="${i}">
      <div class="row gap"><input class="mc-name" data-f="name" value="${esc(it.name)}" placeholder="料理名"><button class="chip-x" data-a="del" aria-label="この品目を削除">×</button></div>
      <input class="mc-amount" data-f="amount" value="${esc(it.amount || '')}" placeholder="量の目安（例：茶碗1杯 約150g）">
      <div class="mc-nums">
        <label><span>kcal</span><input data-f="kcal" inputmode="decimal" value="${v(it.kcal)}"></label>
        <label><span>P(g)</span><input data-f="p" inputmode="decimal" value="${v(it.p)}"></label>
        <label><span>F(g)</span><input data-f="f" inputmode="decimal" value="${v(it.f)}"></label>
        <label><span>C(g)</span><input data-f="c" inputmode="decimal" value="${v(it.c)}"></label>
      </div>
      <label class="check-row small"><input type="checkbox" data-f="fav" ${it.fav ? 'checked' : ''}> ★ お気に入りにも登録</label>
    </div>`;
  }

  function openConfirm(items, opt = {}) {
    let list = items.map((x) => ({ ...x }));
    const readForm = (sh) => {
      list = [...sh.querySelectorAll('.mc-item')].map((row) => {
        const g = (f) => row.querySelector(`[data-f="${f}"]`);
        const n = (f) => { const x = num(g(f).value); return x == null ? null : Math.max(0, x); };
        return { name: g('name').value.trim(), amount: g('amount').value.trim(), kcal: n('kcal'), p: n('p'), f: n('f'), c: n('c'), fav: g('fav').checked };
      });
    };
    const sum = () => list.reduce((a, x) => ({ kcal: a.kcal + (x.kcal || 0), p: a.p + (x.p || 0) }), { kcal: 0, p: 0 });
    const draw = () => {
      const s = sum();
      const src = { claude: 'Claudeアプリの回答', api: 'Claude APIの推定', manual: '手入力', fav: 'お気に入り' }[opt.source] || '';
      const html = `
        ${UI.sheetHead(opt.source === 'manual' ? '食事を入力' : '推定結果の確認')}
        ${slotChips(ctx.slot)}
        ${opt.source !== 'manual' ? `<p class="hint">${src}から読み取った値です。<b>推定は目安</b>なので、量や中身が違うところは直してから保存してください。</p>` : ''}
        ${opt.note ? `<p class="small muted">💬 ${esc(opt.note)}</p>` : ''}
        ${opt.cost ? `<p class="hint">今回のAPI利用料：約${opt.cost.yen < 1 ? opt.cost.yen.toFixed(2) : opt.cost.yen.toFixed(1)}円（$${opt.cost.usd.toFixed(4)}、入力${opt.cost.inTok}・出力${opt.cost.outTok}トークン、1ドル${YEN_PER_USD}円で計算）</p>` : ''}
        <div id="mc-list">${list.map(itemRow).join('')}</div>
        <button class="btn small mt" data-a="addrow">＋ 品目を追加</button>
        <p class="mc-sum">合計 <b>${Math.round(s.kcal)}</b> kcal ・ タンパク質 <b>${Math.round(s.p)}</b> g</p>
        <button class="btn primary big" data-a="save">保存</button>
        ${UI.sheetFoot()}`;
      UI.sheet(html, (sh) => {
        bindSlot(sh);
        sh.addEventListener('input', () => { readForm(sh); const t = sum(); sh.querySelector('.mc-sum').innerHTML = `合計 <b>${Math.round(t.kcal)}</b> kcal ・ タンパク質 <b>${Math.round(t.p)}</b> g`; });
        sh.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-a]');
          if (!b) return;
          readForm(sh);
          if (b.dataset.a === 'del') { list.splice(Number(b.closest('.mc-item').dataset.i), 1); if (!list.length) list.push({ name: '', amount: '' }); draw(); }
          if (b.dataset.a === 'addrow') { list.push({ name: '', amount: '', kcal: null, p: null, f: null, c: null }); draw(); }
          if (b.dataset.a === 'save') {
            const ok = list.filter((x) => x.name || x.kcal != null);
            if (!ok.length) { UI.toast('料理名かカロリーを入れてください'); return; }
            let photoId = null;
            if (ctx.photo) {
              photoId = UI.uid();
              try { await putThumb(photoId, ctx.photo.thumb); } catch (_) { photoId = null; }
            }
            const d = ctx.date;
            S().meals[d] = dayList(d).concat(ok.map((x, i) => ({
              id: UI.uid(), slot: ctx.slot, name: x.name || '食事', amount: x.amount || '',
              kcal: x.kcal || 0, p: x.p || 0, f: x.f || 0, c: x.c || 0,
              photo: i === 0 ? photoId : null, src: opt.source, at: Date.now(),
            })));
            ok.filter((x) => x.fav).forEach((x) => {
              if (!S().mealFavs.some((f) => f.name === x.name && f.kcal === (x.kcal || 0))) {
                S().mealFavs.push({ id: UI.uid(), name: x.name || '食事', amount: x.amount || '', kcal: x.kcal || 0, p: x.p || 0, f: x.f || 0, c: x.c || 0 });
              }
            });
            Store.save();
            if (ctx.photo) URL.revokeObjectURL(ctx.photo.previewUrl);
            UI.closeSheet();
            UI.toast(`${SLOT[ctx.slot].label}に${ok.length}品を記録しました`);
            ctx.onDone();
          }
        });
        // 戻る：最初の画面へ（写真や貼り付けた文章はそのまま）
        sh.querySelectorAll('[data-sheet-back]').forEach((x) => x.removeAttribute('data-sheet-back'));
        sh.querySelectorAll('.back-btn, .form-foot .btn').forEach((x) => x.addEventListener('click', () => openAdd(ctx)));
      });
    };
    draw();
  }

  // ---- お気に入り ----
  function openFavs(c) {
    ctx = c;
    const favs = S().mealFavs;
    const html = `
      ${UI.sheetHead('★ お気に入りから追加')}
      ${slotChips(ctx.slot)}
      <ul class="list">${favs.map((f) => `<li class="fav-row">
        <button class="list-btn" data-fav="${f.id}"><span>${esc(f.name)}${f.amount ? `<small class="muted"> ${esc(f.amount)}</small>` : ''}</span><span class="muted small">${Math.round(f.kcal)}kcal・P${Math.round(f.p)} ＋</span></button>
        <button class="chip-x" data-favdel="${f.id}" aria-label="${esc(f.name)}をお気に入りから外す">×</button>
      </li>`).join('')}</ul>
      <p class="hint">タップで1品追加します。×でお気に入りから外します。お気に入りは、推定結果の確認画面で「★ お気に入りにも登録」にチェックすると増えます。</p>
      ${UI.sheetFoot()}`;
    UI.sheet(html, (sh) => {
      bindSlot(sh);
      sh.addEventListener('click', (e) => {
        const add = e.target.closest('[data-fav]');
        const del = e.target.closest('[data-favdel]');
        if (del) {
          S().mealFavs = S().mealFavs.filter((f) => f.id !== del.dataset.favdel);
          Store.save();
          if (S().mealFavs.length) openFavs(ctx); else { UI.closeSheet(); ctx.onDone(); }
          return;
        }
        if (!add) return;
        const f = favs.find((x) => x.id === add.dataset.fav);
        S().meals[ctx.date] = dayList(ctx.date).concat({ id: UI.uid(), slot: ctx.slot, name: f.name, amount: f.amount, kcal: f.kcal, p: f.p, f: f.f, c: f.c, photo: null, src: 'fav', at: Date.now() });
        Store.save();
        UI.toast(`${f.name} を${SLOT[ctx.slot].label}に追加しました`);
        UI.closeSheet();
        ctx.onDone();
      });
    });
  }

  // ---- 記録した1品の修正・削除 ----
  function openEdit(date, id, rerender) {
    const m = dayList(date).find((x) => x.id === id);
    if (!m) return;
    let slot = m.slot;
    const html = `
      ${UI.sheetHead('食事の記録を修正')}
      <div class="chips" id="m-slot">${SLOTS.map(([k, l, ic]) => `<button class="chip ${k === slot ? 'on' : ''}" data-slot="${k}">${ic} ${l}</button>`).join('')}</div>
      ${m.photo ? '<img class="m-edit-photo" id="m-edit-photo" alt="">' : ''}
      ${itemRow({ ...m, fav: false }, 0)}
      <button class="btn primary big" data-a="save">保存</button>
      <button class="btn block mt ghost danger" data-a="remove">この記録を削除</button>
      ${UI.sheetFoot()}`;
    UI.sheet(html, async (sh) => {
      sh.querySelector('#m-slot').addEventListener('click', (e) => {
        const c = e.target.closest('[data-slot]');
        if (!c) return;
        slot = c.dataset.slot;
        sh.querySelectorAll('#m-slot [data-slot]').forEach((x) => x.classList.toggle('on', x.dataset.slot === slot));
      });
      sh.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        if (b.dataset.a === 'remove') {
          if (!confirm('この食事の記録を削除しますか？')) return;
          S().meals[date] = dayList(date).filter((x) => x.id !== id);
          if (m.photo) delThumb(m.photo).catch(() => {});
          Store.save(); UI.closeSheet(); rerender();
          return;
        }
        if (b.dataset.a === 'save') {
          const row = sh.querySelector('.mc-item');
          const g = (f) => row.querySelector(`[data-f="${f}"]`);
          const n = (f) => Math.max(0, num(g(f).value) || 0);
          Object.assign(m, { slot, name: g('name').value.trim() || '食事', amount: g('amount').value.trim(), kcal: n('kcal'), p: n('p'), f: n('f'), c: n('c') });
          if (g('fav').checked && !S().mealFavs.some((f) => f.name === m.name && f.kcal === m.kcal)) {
            S().mealFavs.push({ id: UI.uid(), name: m.name, amount: m.amount, kcal: m.kcal, p: m.p, f: m.f, c: m.c });
          }
          Store.save(); UI.closeSheet(); rerender(); UI.toast('保存しました');
        }
        if (b.dataset.a === 'del') UI.toast('1品だけのときは「この記録を削除」を使ってください');
      });
      if (m.photo) {
        try {
          const buf = await getThumb(m.photo);
          const im = sh.querySelector('#m-edit-photo');
          if (buf && im) im.src = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
        } catch (_) {}
      }
    });
  }

  // 週の振り返り用：期間内で食事を記録した日の平均
  function weekAverages(days) {
    const logged = days.filter((d) => dayList(d).length);
    if (!logged.length) return { kcal: null, p: null, days: 0 };
    const t = logged.map(totals);
    return { kcal: t.reduce((a, x) => a + x.kcal, 0) / t.length, p: t.reduce((a, x) => a + x.p, 0) / t.length, days: logged.length };
  }

  return { cardHtml, fillThumbs, onClick, totals, proteinOf, weekAverages, parseAnswer, getKey, setKey, MODELS, clearThumbs, ASK_TEXT };
})();
