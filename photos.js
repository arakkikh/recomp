// 体の変化の写真
// ・写真はこの端末のブラウザ内（IndexedDB）にだけ保存し、外部には送らない
// ・長い辺1280pxのJPEGに縮小して保存（一覧用に小さい画像も作る）
// ・バックアップは、JSONに「写真も含める」を選んだときだけ一緒に書き出す
const Photos = (() => {
  const { esc } = UI;
  const DB_NAME = 'recomp-photos';
  const STORE = 'photos';
  const POSES = [['front', '正面'], ['side', '横'], ['back', '後ろ']];
  const POSE_LABEL = Object.fromEntries(POSES);

  // ================= 保存（IndexedDB）=================
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => { dbp = null; reject(r.error); };
      });
    }
    return dbp;
  }
  const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const store = async (mode) => (await db()).transaction(STORE, mode).objectStore(STORE);
  async function all() {
    const list = await req((await store('readonly')).getAll());
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  }
  const put = async (p) => req((await store('readwrite')).put(p));
  const remove = async (id) => req((await store('readwrite')).delete(id));
  const clear = async () => req((await store('readwrite')).clear());

  // ================= 画像の縮小 =================
  async function loadImage(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* 下の方法で */ }
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を開けませんでした'));
      img.src = URL.createObjectURL(file);
    });
  }
  async function toJpeg(img, max, quality) {
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * s), h = Math.round(img.height * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', quality));
    return { buf: await blob.arrayBuffer(), w, h };
  }
  const blobOf = (buf) => new Blob([buf], { type: 'image/jpeg' });

  // ================= 表示 =================
  let urls = [];          // 作った表示用URL（画面を描き直すたびに解放）
  const urlOf = (buf) => { const u = URL.createObjectURL(blobOf(buf)); urls.push(u); return u; };
  const releaseUrls = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };
  let cmpPose = 'front';
  let cmpA = null, cmpB = null; // 比べる写真のid

  // 体組成タブに置くカード（写真は後から fill で読み込む）
  function cardHtml() {
    return `<div class="card" id="photo-card">
      <div class="row between"><h3>📷 体の変化の写真</h3><span class="tag">この端末だけに保存</span></div>
      <div id="photo-area"><p class="muted small">読み込み中…</p></div>
      <label class="btn block mt file-btn">＋ 写真を追加（撮影／選ぶ）<input type="file" accept="image/*" id="photo-in" hidden></label>
    </div>`;
  }

  // 測定日に近い体組成（前後3日以内）
  function bodyNear(date) {
    const t = UI.parseDate(date).getTime();
    let best = null;
    Body.entries().forEach((e) => {
      const d = Math.abs(UI.parseDate(e.date).getTime() - t) / 864e5;
      if (d <= 3 && (!best || d < best.d)) best = { d, e };
    });
    return best ? best.e : null;
  }
  const bodyText = (date) => {
    const e = bodyNear(date);
    if (!e) return '';
    return [e.weight != null ? `${e.weight}kg` : '', e.fatPct != null ? `体脂肪${e.fatPct}%` : ''].filter(Boolean).join(' / ');
  };

  async function fill(root) {
    const area = root.querySelector('#photo-area');
    const input = root.querySelector('#photo-in');
    if (!area) return;
    if (input) input.addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openAdd(f, root); });
    let list;
    try { list = await all(); } catch (err) {
      area.innerHTML = '<p class="muted small">このブラウザでは写真を保存できません（プライベートブラウズでは使えません）。</p>';
      return;
    }
    if (!area.isConnected) return;
    releaseUrls();
    if (!list.length) {
      area.innerHTML = `<p class="small">月に1〜2回、同じ条件で撮ると変化がよく分かります。体重が変わらなくても、見た目の変化が励みになります。</p>
        <ul class="tips small"><li>同じ場所・同じ明るさ・同じ時間帯（朝の起床後など）</li><li>同じ服装で、正面・横・後ろの3枚</li><li>カメラのタイマー（3秒）を使い、全身が入る距離で</li></ul>`;
      return;
    }
    // 比較：選んだ向きの最初と最新
    const poses = POSES.filter(([k]) => list.some((p) => p.pose === k));
    if (!poses.some(([k]) => k === cmpPose)) cmpPose = poses[0][0];
    const ofPose = list.filter((p) => p.pose === cmpPose);
    if (!ofPose.some((p) => p.id === cmpA)) cmpA = ofPose[0].id;
    if (!ofPose.some((p) => p.id === cmpB)) cmpB = ofPose[ofPose.length - 1].id;
    const A = ofPose.find((p) => p.id === cmpA), B = ofPose.find((p) => p.id === cmpB);
    const opt = (p, sel) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${UI.fmtDate(p.date)}</option>`;
    const days = Math.round((UI.parseDate(B.date) - UI.parseDate(A.date)) / 864e5);
    const compare = ofPose.length >= 2 ? `
      <div class="ph-compare">
        <figure><img src="${urlOf(A.data)}" alt="${UI.fmtDate(A.date)}の写真"><figcaption><select data-ph="a">${ofPose.map((p) => opt(p, cmpA)).join('')}</select><span>${esc(bodyText(A.date))}</span></figcaption></figure>
        <figure><img src="${urlOf(B.data)}" alt="${UI.fmtDate(B.date)}の写真"><figcaption><select data-ph="b">${ofPose.map((p) => opt(p, cmpB)).join('')}</select><span>${esc(bodyText(B.date))}</span></figcaption></figure>
      </div>
      <p class="hint center">${days > 0 ? `${days}日間の変化` : '日付を選んで比べられます'}</p>`
      : '<p class="hint">同じ向きの写真が2枚以上になると、並べて比べられます。</p>';
    const grid = list.slice().reverse().map((p) => `
      <button class="ph-thumb" data-ph-open="${p.id}" aria-label="${UI.fmtDate(p.date)} ${POSE_LABEL[p.pose]}">
        <img src="${urlOf(p.thumb)}" alt="" loading="lazy"><span>${UI.fmtShort(p.date)} ${POSE_LABEL[p.pose]}</span>
      </button>`).join('');
    area.innerHTML = `
      <div class="chips">${poses.map(([k, l]) => `<button class="chip ${k === cmpPose ? 'on' : ''}" data-ph-pose="${k}">${l}</button>`).join('')}</div>
      ${compare}
      <h4>すべての写真（${list.length}枚）</h4>
      <div class="ph-grid">${grid}</div>`;
    area.onclick = (e) => {
      const pz = e.target.closest('[data-ph-pose]');
      if (pz) { cmpPose = pz.dataset.phPose; cmpA = cmpB = null; fill(root); return; }
      const op = e.target.closest('[data-ph-open]');
      if (op) openView(list.find((p) => p.id === op.dataset.phOpen), root);
    };
    area.onchange = (e) => {
      const s = e.target.closest('[data-ph]');
      if (!s) return;
      if (s.dataset.ph === 'a') cmpA = s.value; else cmpB = s.value;
      fill(root);
    };
  }

  // ---- 追加 ----
  async function openAdd(file, root) {
    let img;
    try { img = await loadImage(file); } catch (err) { UI.toast(err.message); return; }
    const big = await toJpeg(img, 1280, 0.82);
    const small = await toJpeg(img, 320, 0.7);
    if (img.close) img.close();
    const preview = URL.createObjectURL(blobOf(small.buf));
    let pose = 'front';
    const html = `
      ${UI.sheetHead('写真を追加')}
      <img class="ph-preview" src="${preview}" alt="追加する写真">
      <label class="field-label">向き</label>
      <div class="chips" id="ph-pose">${POSES.map(([k, l]) => `<button class="chip ${k === pose ? 'on' : ''}" data-pose="${k}">${l}</button>`).join('')}</div>
      <label class="bf bf-date"><span>撮った日</span><input type="date" id="ph-date" value="${UI.dateStr()}" max="${UI.dateStr()}"></label>
      <label class="bf mt"><span>メモ（任意）</span><input type="text" id="ph-note" placeholder="例：朝・起床後"></label>
      <p class="hint">写真はこのiPhoneのブラウザの中にだけ保存されます。外部に送ったり、GitHubに上がったりすることはありません。</p>
      <button class="btn primary big" data-ph-save="1">保存</button>
      ${UI.sheetFoot()}`;
    UI.sheet(html, (sh) => sh.addEventListener('click', async (e) => {
      const pz = e.target.closest('[data-pose]');
      if (pz) { pose = pz.dataset.pose; sh.querySelectorAll('[data-pose]').forEach((c) => c.classList.toggle('on', c.dataset.pose === pose)); return; }
      if (!e.target.closest('[data-ph-save]')) return;
      const date = sh.querySelector('#ph-date').value || UI.dateStr();
      try {
        await put({ id: UI.uid(), date, pose, note: sh.querySelector('#ph-note').value.trim(), createdAt: Date.now(), w: big.w, h: big.h, data: big.buf, thumb: small.buf });
        // ブラウザに「消さないで」とお願いする（対応していれば）
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        URL.revokeObjectURL(preview);
        cmpPose = pose; cmpA = cmpB = null;
        UI.closeSheet();
        UI.toast('写真を保存しました');
        fill(root);
      } catch (err) {
        console.error(err);
        UI.toast('保存できませんでした（端末の空き容量を確認してください）');
      }
    }));
  }

  // ---- 1枚を見る ----
  function openView(p, root) {
    if (!p) return;
    const url = URL.createObjectURL(blobOf(p.data));
    const name = `recomp-${p.date}-${p.pose}.jpg`;
    const bt = bodyText(p.date);
    const html = `
      ${UI.sheetHead(`${UI.fmtDate(p.date)} ${POSE_LABEL[p.pose]}`)}
      <img class="ph-full" src="${url}" alt="${UI.fmtDate(p.date)}の写真">
      ${bt || p.note ? `<p class="small">${esc(bt)}${bt && p.note ? ' ・ ' : ''}${esc(p.note || '')}</p>` : ''}
      <button class="btn block mt" data-ph-share="1">共有・iPhoneの写真に保存</button>
      <button class="btn block mt ghost danger" data-ph-del="1">この写真を削除</button>
      ${UI.sheetFoot()}`;
    UI.sheet(html, (sh) => sh.addEventListener('click', async (e) => {
      if (e.target.closest('[data-ph-share]')) {
        const file = new File([blobOf(p.data)], name, { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file] }); } catch (_) { /* キャンセル */ }
        } else {
          const a = document.createElement('a');
          a.href = url; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
        }
        return;
      }
      if (e.target.closest('[data-ph-del]')) {
        if (!confirm('この写真を削除しますか？元に戻せません。')) return;
        await remove(p.id);
        URL.revokeObjectURL(url);
        UI.closeSheet();
        UI.toast('削除しました');
        fill(root);
      }
    }));
  }

  // ================= バックアップ =================
  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64ToBuf(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  }
  async function exportAll() {
    return (await all()).map((p) => ({ ...p, data: bufToB64(p.data), thumb: bufToB64(p.thumb) }));
  }
  async function importAll(arr) {
    if (!Array.isArray(arr)) return 0;
    let n = 0;
    for (const p of arr) {
      if (!p || !p.id || !p.data) continue;
      await put({ ...p, data: b64ToBuf(p.data), thumb: b64ToBuf(p.thumb || p.data) });
      n++;
    }
    return n;
  }
  // 枚数とおおよその容量（MB）
  async function stats() {
    try {
      const list = await all();
      const bytes = list.reduce((a, p) => a + p.data.byteLength + p.thumb.byteLength, 0);
      return { count: list.length, mb: bytes / 1048576 };
    } catch (_) { return { count: 0, mb: 0 }; }
  }

  return { cardHtml, fill, exportAll, importAll, stats, clear };
})();
