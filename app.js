// 画面切替（下部タブ）と設定画面
const Settings = {
  title: '設定',
  render(el) {
    const st = Store.data.settings;
    const lb = st.lastBackup ? new Date(st.lastBackup).toLocaleString('ja-JP') : 'まだありません';
    const opt = (v, cur, label) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
    const pf = Store.data.profile;
    const thisYear = new Date().getFullYear();
    const years = Array.from({ length: 70 }, (_, i) => thisYear - 18 - i);
    el.innerHTML = `
      <div class="card">
        <h3>プロフィール</h3>
        <label class="field"><span>性別</span>
          <select data-p="sex">${opt('', pf.sex || '', '未設定')}${opt('male', pf.sex, '男性')}${opt('female', pf.sex, '女性')}</select></label>
        <label class="field"><span>生まれ年</span>
          <select data-p="birthYear">${opt('', pf.birthYear || '', '未設定')}${years.map((y) => opt(y, pf.birthYear, y + '年')).join('')}</select></label>
        <label class="field"><span>身長（cm）</span>
          <input class="field-in" data-p="heightCm" type="text" inputmode="decimal" value="${pf.heightCm ?? ''}" placeholder="未設定"></label>
        <label class="field"><span>ふだんの活動量</span>
          <select data-p="activityFactor">
            ${opt(1.3, pf.activityFactor, '少ない（座り仕事・運動なし）')}
            ${opt(1.4, pf.activityFactor, 'やや少ない（座り仕事・週1〜2回運動）')}
            ${opt(1.5, pf.activityFactor, '普通（座り仕事・週3〜4回筋トレ）')}
            ${opt(1.6, pf.activityFactor, 'やや多い（立ち仕事・週3〜4回筋トレ）')}
            ${opt(1.7, pf.activityFactor, '多い（体を使う仕事・毎日運動）')}
          </select></label>
        <p class="hint">基礎代謝を体組成タブで記録していれば、そちらを優先して使います。性別・生まれ年・身長は、基礎代謝の記録がないときの計算に使います。この端末の中にだけ保存されます。</p>
      </div>
      <div class="card">
        <h3>食事・習慣の目標</h3>
        <label class="field"><span>タンパク質（体重1kgあたり）</span>
          <select data-k="proteinPerKg">${[1.4, 1.6, 1.8, 2.0].map((v) => opt(v, st.proteinPerKg, v.toFixed(1) + ' g')).join('')}</select></label>
        <label class="field"><span>目標の就寝時刻</span><input class="field-in" type="time" data-k="targetBed" data-type="str" value="${st.targetBed}"></label>
        <label class="field"><span>目標の起床時刻</span><input class="field-in" type="time" data-k="targetWake" data-type="str" value="${st.targetWake}"></label>
        <label class="field"><span>睡眠時間の目標</span>
          <select data-k="sleepGoalH">${[6, 6.5, 7, 7.5, 8].map((v) => opt(v, st.sleepGoalH, v + ' 時間')).join('')}</select></label>
        <label class="field"><span>野菜（小鉢）</span>
          <select data-k="vegGoal">${[3, 4, 5, 6, 7].map((v) => opt(v, st.vegGoal, v + ' 皿')).join('')}</select></label>
        <label class="field"><span>歩数</span>
          <select data-k="stepsGoal">${[5000, 6000, 7000, 8000, 9000, 10000].map((v) => opt(v, st.stepsGoal, v.toLocaleString() + ' 歩')).join('')}</select></label>
        <label class="field"><span>ステッパー（歩数の代わり）</span>
          <select data-k="stepperGoalMin">${[10, 15, 20, 30].map((v) => opt(v, st.stepperGoalMin, v + ' 分')).join('')}</select></label>
        <label class="field"><span>お酒のチェック</span>
          <select data-k="alcoholCheck" data-type="bool">${opt('false', String(st.alcoholCheck), 'なし')}${opt('true', String(st.alcoholCheck), 'あり')}</select></label>
        <p class="hint">食べ終える時刻の目標は「就寝の3時間前」で自動的に決まります。</p>
      </div>
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
        <label class="field"><span>ウォームアップの提案</span>
          <select data-k="showWarmup" data-type="bool">${opt('true', String(st.showWarmup !== false), '表示する')}${opt('false', String(st.showWarmup !== false), '表示しない')}</select></label>
        <p class="hint">種目ごとに推奨の休憩時間（大きい種目は120秒など）があるときは、そちらを優先します。</p>
      </div>
      <div class="card">
        <h3>体組成</h3>
        <label class="field"><span>体脂肪率の目標</span>
          <select data-k="goalFatPct">${[15, 16, 17, 18, 19, 20, 21, 22, 23, 24].map((v) => opt(v, st.goalFatPct, v + ' %')).join('')}</select></label>
        <label class="field"><span>内臓脂肪レベルの目標</span>
          <select data-k="goalVisceral" data-type="numnull">${opt('', st.goalVisceral ?? '', '未設定')}${[5, 6, 7, 8, 9, 9.5].map((v) => opt(v, st.goalVisceral, v + (v === 9.5 ? '（標準の上限）' : ''))).join('')}</select></label>
        <label class="field"><span>筋肉量の目標</span>
          <select data-k="goalMuscleKg" data-type="numnull">${opt('', st.goalMuscleKg ?? '', '未設定')}${Array.from({ length: 41 }, (_, i) => 40 + i * 0.5).map((v) => opt(v, st.goalMuscleKg, v.toFixed(1) + ' kg')).join('')}</select></label>
        <label class="field"><span>体重の目標</span>
          <select data-k="goalWeight" data-type="numnull">${opt('', st.goalWeight ?? '', '未設定（今の体重を維持）')}${Array.from({ length: 81 }, (_, i) => 50 + i * 0.5).map((v) => opt(v, st.goalWeight, v.toFixed(1) + ' kg')).join('')}</select></label>
        <p class="hint">体脂肪率の目標はグラフに点線で表示します。どの目標も、体組成タブの「将来予測のガイド」で達成までの見込みを表示します。</p>
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
      <p class="muted small center">Recomp v1.0</p>`;
    el.onchange = (e) => {
      const t = e.target;
      if (t.dataset.k) {
        const v = t.value;
        if (t.dataset.type === 'str' && !v) { t.value = st[t.dataset.k]; return; }
        st[t.dataset.k] = t.dataset.k === 'theme' || t.dataset.type === 'str' ? v : t.dataset.type === 'bool' ? v === 'true' : t.dataset.type === 'numnull' && v === '' ? null : Number(v);
        Store.save();
        App.applyTheme();
        UI.toast('保存しました');
      }
      if (t.dataset.p) {
        const k = t.dataset.p;
        let v = t.value.trim();
        if (k === 'sex') v = v || null;
        else if (k === 'heightCm') {
          v = v === '' ? null : parseFloat(v.replace(',', '.'));
          if (v !== null && (!Number.isFinite(v) || v < 100 || v > 230)) { UI.toast('身長はcmで入れてください（例 170）'); return; }
        } else v = v === '' ? null : Number(v);
        Store.data.profile[k] = v;
        Store.save();
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
    home: Home,
    workout: Workout,
    body: Body,
    habits: Habits,
    settings: Settings,
  };
  let current = 'home';

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
    current = TABS[h] ? h : 'home';
    render();
  }

  return { init, render, applyTheme, go };
})();

document.addEventListener('DOMContentLoaded', App.init);
