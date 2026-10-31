// 画面切替（下部タブ）と設定画面
const Placeholder = (title, stage) => ({
  title,
  render(el) {
    el.innerHTML = `<div class="card"><h2>${title}</h2><p class="muted">この画面は段階${stage}で作成します。</p></div>`;
    el.onclick = null; el.onchange = null;
  },
});

const Settings = {
  title: '設定',
  render(el) {
    const st = Store.data.settings;
    const lb = st.lastBackup ? new Date(st.lastBackup).toLocaleString('ja-JP') : 'まだありません';
    const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
    el.innerHTML = `
      <div class="card">
        <h3>トレーニング</h3>
        <label class="field"><span>週のトレーニング回数</span>
          <select data-k="daysPerWeek">${opt(4, st.daysPerWeek, '週4回（上半身/下半身）')}${opt(3, st.daysPerWeek, '週3回（全身A/B）')}</select></label>
        <label class="field"><span>ダンベルの刻み幅</span>
          <select data-k="dbIncrementKg">${[1, 2, 2.5, 5].map((v) => opt(v, st.dbIncrementKg, v + ' kg')).join('')}</select></label>
        <label class="field"><span>ダンベルの最大重量（片手）</span>
          <select data-k="dbMaxKg">${[20, 24, 30, 32, 40, 50].map((v) => opt(v, st.dbMaxKg, v + ' kg')).join('')}</select></label>
        <label class="field"><span>標準の休憩時間</span>
          <select data-k="restSec">${[60, 90, 120, 150, 180].map((v) => opt(v, st.restSec, v + ' 秒')).join('')}</select></label>
        <p class="hint">種目ごとに推奨の休憩時間（大きい種目は120秒など）があるときは、そちらを優先します。</p>
      </div>
      <div class="card">
        <h3>表示</h3>
        <label class="field"><span>テーマ</span>
          <select data-k="theme">${opt('auto', st.theme, '端末の設定に合わせる')}${opt('light', st.theme, 'ライト')}${opt('dark', st.theme, 'ダーク')}</select></label>
      </div>
      <div class="card">
        <h3>バックアップ</h3>
        <p class="muted small">最終バックアップ：${lb}</p>
        <button class="btn block" data-act="export">JSONをエクスポート（保存）</button>
        <label class="btn block mt file-btn">JSONをインポート（復元）<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        <p class="hint">データはこの端末のブラウザの中にだけ保存されています。iPhoneとMacの間でデータを移すときや、機種変更の前にエクスポートしてください。</p>
      </div>
      <div class="card">
        <h3>データの削除</h3>
        <button class="btn block ghost danger" data-act="reset">すべてのデータを削除</button>
      </div>
      <p class="muted small center">Recomp v0.1（段階①）</p>`;
    el.onchange = (e) => {
      const t = e.target;
      if (t.dataset.k) {
        const v = t.value;
        st[t.dataset.k] = t.dataset.k === 'theme' ? v : Number(v);
        Store.save();
        App.applyTheme();
        UI.toast('保存しました');
      }
      if (t.dataset.act === 'import' && t.files[0]) {
        if (!confirm('今のデータをバックアップの内容で置き換えます。よろしいですか？')) { t.value = ''; return; }
        Store.importJSON(t.files[0])
          .then(() => { App.applyTheme(); UI.toast('復元しました'); App.render(); })
          .catch((err) => UI.toast('読み込めませんでした：' + err.message));
      }
    };
    el.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'export') { Store.exportJSON(); setTimeout(() => App.render(), 300); }
      if (b.dataset.act === 'reset' && confirm('すべての記録を削除します。元に戻せません。よろしいですか？') && confirm('本当に削除しますか？')) {
        Store.reset(); App.applyTheme(); App.render(); UI.toast('削除しました');
      }
    };
  },
};

const App = (() => {
  const TABS = {
    home: Placeholder('ホーム', '④'),
    workout: Workout,
    body: Placeholder('体組成', '②'),
    habits: Placeholder('食事・習慣', '③'),
    settings: Settings,
  };
  let current = 'workout';

  function applyTheme() {
    const t = Store.data.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  function render() {
    const main = document.getElementById('main');
    TABS[current].render(main);
    document.getElementById('title').textContent = TABS[current].title;
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === current));
  }

  function go(tab) {
    if (!TABS[tab]) return;
    current = tab;
    location.hash = tab;
    render();
    window.scrollTo(0, 0);
  }

  function init() {
    Store.load();
    applyTheme();
    Workout.init();
    document.querySelector('.tabbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) go(b.dataset.tab);
    });
    const h = location.hash.slice(1);
    current = TABS[h] ? h : 'workout';
    render();
  }

  return { init, render, applyTheme, go };
})();

document.addEventListener('DOMContentLoaded', App.init);
