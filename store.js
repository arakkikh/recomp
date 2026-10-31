// データ保存：localStorage の1キーにJSONでまとめて保存
const Store = (() => {
  const KEY = 'recomp.v1';
  const VERSION = 1;

  const defaults = () => ({
    version: VERSION,
    profile: { sex: null, birthYear: null, heightCm: null, activityFactor: 1.5 },
    settings: { daysPerWeek: 4, dbIncrementKg: 2.5, dbMaxKg: 40, restSec: 90, showWarmup: true, goalFatPct: 20, goalVisceral: 9.5, goalMuscleKg: null, goalWeight: null, theme: 'auto', lastBackup: null,
      proteinPerKg: 1.8, targetBed: '23:30', targetWake: '06:30', sleepGoalH: 7, vegGoal: 5, stepsGoal: 8000, stepperGoalMin: 20, alcoholCheck: false },
    workouts: [], // 完了したワークアウト
    active: null, // 実施中のワークアウト
    body: [],     // 体組成（段階②）
    habits: {},   // 習慣（段階③）
    deload: { current: null, history: [], snoozeUntil: null }, // 軽めの週
  });

  let data = defaults();

  // 足りない項目を初期値で埋める（古いデータを読み込んだとき用）
  function normalize(d) {
    const base = defaults();
    if (!d || typeof d !== 'object') return base;
    return {
      ...base, ...d,
      profile: { ...base.profile, ...(d.profile || {}) },
      settings: { ...base.settings, ...(d.settings || {}) },
      workouts: Array.isArray(d.workouts) ? d.workouts : [],
      body: Array.isArray(d.body) ? d.body : [],
      habits: d.habits && typeof d.habits === 'object' ? d.habits : {},
      deload: { ...base.deload, ...(d.deload || {}), history: (d.deload && Array.isArray(d.deload.history)) ? d.deload.history : [] },
      version: VERSION,
      photos: undefined, // 写真は localStorage には入れない（IndexedDB に別保存）
    };
  }

  function load() {
    try { data = normalize(JSON.parse(localStorage.getItem(KEY))); }
    catch (e) { console.error(e); data = defaults(); }
    return data;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { UI.toast('保存に失敗しました（容量不足の可能性）'); console.error(e); }
  }

  // photos を渡すと、写真も一緒に書き出す（ファイルが大きくなる）
  function exportJSON(photos = null) {
    data.settings.lastBackup = new Date().toISOString();
    save();
    const out = photos && photos.length ? { ...data, photos } : data;
    const blob = new Blob([JSON.stringify(out, photos ? 0 : 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `recomp-backup-${UI.dateStr()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importJSON(file) {
    return file.text().then((text) => {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.workouts)) {
        throw new Error('このアプリのバックアップファイルではありません');
      }
      data = normalize(parsed);
      save();
      // 写真が含まれていれば、写真の保存場所へ戻す
      if (Array.isArray(parsed.photos) && parsed.photos.length && typeof Photos !== 'undefined') {
        return Photos.importAll(parsed.photos).then((n) => ({ data, photos: n }));
      }
      return { data, photos: 0 };
    });
  }

  function reset() { data = defaults(); save(); }

  return { get data() { return data; }, load, save, exportJSON, importJSON, reset };
})();
