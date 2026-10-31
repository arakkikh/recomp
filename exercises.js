// 種目データ：ダンベル2個・角度調整ベンチ・懸垂/ディップススタンド・ステッパーのみ
// unit: kg=ダンベル重量(片手) / bw=自重(+加重kg) / sec=秒 / min=分
const Exercises = (() => {
  const list = [
    // ---- 胸 ----
    {
      id: 'db_bench', name: 'ダンベルベンチプレス', part: '胸',
      primary: ['大胸筋'], secondary: ['上腕三頭筋', '三角筋前部'],
      unit: 'kg', range: [8, 12], sets: 3, rest: 120, startKg: 10,
      tips: ['肩甲骨を寄せて下げ、胸を張ったままベンチに固定する', 'ダンベルは胸の横（乳首の高さ）まで下ろし、肘は体から45°程度', '足裏で床を押し、お尻はベンチから浮かせない'],
      mistakes: ['肘を真横(90°)に開いて肩を痛める', '下ろす深さが浅い'],
    },
    {
      id: 'incline_press', name: 'インクラインダンベルプレス', part: '胸',
      primary: ['大胸筋上部'], secondary: ['三角筋前部', '上腕三頭筋'],
      unit: 'kg', range: [8, 12], sets: 3, rest: 120, startKg: 8,
      tips: ['ベンチ角度は30°前後（上げすぎると肩の種目になる）', '鎖骨の下あたりへ下ろす', '肩甲骨は寄せたまま、押し切っても肩をすくめない'],
      mistakes: ['角度45°以上で肩ばかり疲れる', '腰を大きく反って角度をごまかす'],
    },
    {
      id: 'dips', name: 'ディップス', part: '胸',
      primary: ['大胸筋下部', '上腕三頭筋'], secondary: ['三角筋前部'],
      unit: 'bw', range: [5, 12], sets: 3, rest: 120,
      tips: ['やや前傾すると胸、体を立てると三頭に効く', '肩が肘より少し下がるくらいまで下ろす（痛みが出ない範囲）', '肩をすくめず、肩甲骨を下げたまま動く'],
      mistakes: ['深く下ろしすぎて肩の前側を痛める', '反動で上がる'],
      regression: '足を床やステッパーに乗せて補助する／下ろす動作だけ5秒かけて行う（ネガティブ）',
    },
    // ---- 背中 ----
    {
      id: 'one_arm_row', name: 'ワンハンドローイング', part: '背中', perSide: true,
      primary: ['広背筋'], secondary: ['菱形筋', '上腕二頭筋', '三角筋後部'],
      unit: 'kg', range: [8, 12], sets: 3, rest: 90, startKg: 12,
      tips: ['片手片膝をベンチにつき、背中はまっすぐ床と平行', '肘を腰（ズボンのポケット）に向かって引く', '下ろすときは肩甲骨が前に出るまでしっかり伸ばす'],
      mistakes: ['体をひねって反動で引く', '腕（二頭）だけで引いてしまう'],
    },
    {
      id: 'incline_row', name: 'インクラインダンベルロウ', part: '背中',
      primary: ['広背筋', '僧帽筋中部', '菱形筋'], secondary: ['三角筋後部', '上腕二頭筋'],
      unit: 'kg', range: [10, 12], sets: 3, rest: 90, startKg: 8,
      tips: ['ベンチを30〜45°にして胸をあずけ、うつ伏せになる', '肩甲骨を寄せながら肘を後ろへ引く', '胸をベンチから離さない（腰の負担がない）'],
      mistakes: ['胸がベンチから浮いて反動を使う', '首をすくめる'],
    },
    {
      id: 'pullup', name: '懸垂（順手）', part: '背中',
      primary: ['広背筋'], secondary: ['大円筋', '上腕二頭筋', '僧帽筋下部'],
      unit: 'bw', range: [3, 8], sets: 3, rest: 150,
      tips: ['手幅は肩幅より少し広め', '胸をバーに近づけるイメージで、肘を下に引く', '下ではヒジを伸ばしきり、ぶら下がる'],
      mistakes: ['脚を振って反動で上がる', '可動域が半分しかない'],
      regression: 'ジャンプで上がり、5秒かけてゆっくり下りる（ネガティブ懸垂）を3〜5回',
    },
    {
      id: 'chinup', name: 'チンアップ（逆手懸垂）', part: '背中',
      primary: ['広背筋', '上腕二頭筋'], secondary: ['大円筋', '僧帽筋下部'],
      unit: 'bw', range: [3, 8], sets: 3, rest: 150,
      tips: ['手のひらを自分に向け、肩幅で握る', '肩をすくめず、肩甲骨を下げてから引き始める', 'あごがバーを越えるまで引く'],
      mistakes: ['首だけ伸ばしてあごを越えさせる', '反動を使う'],
      regression: 'ジャンプで上がり、5秒かけてゆっくり下りる（ネガティブ）を3〜5回',
    },
    // ---- 肩 ----
    {
      id: 'seated_press', name: 'シーテッドダンベルショルダープレス', part: '肩',
      primary: ['三角筋前部・中部'], secondary: ['上腕三頭筋'],
      unit: 'kg', range: [8, 12], sets: 3, rest: 90, startKg: 8,
      tips: ['ベンチを80°前後に立てて座る', '耳の横までダンベルを下ろし、真上に押す', 'お腹に力を入れて腰を反らない'],
      mistakes: ['腰を大きく反る', '下ろしが浅い'],
    },
    {
      id: 'side_raise', name: 'サイドレイズ', part: '肩',
      primary: ['三角筋中部'], secondary: ['僧帽筋上部'],
      unit: 'kg', range: [12, 15], sets: 3, rest: 60, startKg: 4,
      tips: ['肘を軽く曲げ、小指側からやや前方へ上げる', '肩の高さまでで止める', '下ろすときもゆっくり（2秒）'],
      mistakes: ['重すぎて体の反動で振り上げる', '肩がすくんで僧帽筋に効く'],
      note: '2.5kg刻みだと重量アップの幅が大きいため、まず回数（〜18回）で伸ばしてから重量を上げる',
    },
    {
      id: 'rear_raise', name: 'リアレイズ', part: '肩',
      primary: ['三角筋後部'], secondary: ['菱形筋', '僧帽筋中部'],
      unit: 'kg', range: [12, 15], sets: 3, rest: 60, startKg: 4,
      tips: ['インクラインベンチにうつ伏せになると反動が使えない', '腕を横に広げ、肘から上げる意識', '肩甲骨は寄せすぎない（後部三角に効かせる）'],
      mistakes: ['重すぎて背中の種目になる'],
    },
    // ---- 腕 ----
    {
      id: 'db_curl', name: 'ダンベルカール', part: '腕',
      primary: ['上腕二頭筋'], secondary: ['上腕筋', '前腕'],
      unit: 'kg', range: [10, 12], sets: 2, rest: 60, startKg: 6,
      tips: ['肘を体の横に固定する', '上げながら小指側を外にひねる', '下ろすときは2〜3秒かける'],
      mistakes: ['上体を反らせて反動を使う', '肘が前に出る'],
    },
    {
      id: 'oh_triceps', name: 'オーバーヘッドトライセプスエクステンション', part: '腕',
      primary: ['上腕三頭筋（長頭）'], secondary: [],
      unit: 'kg', range: [10, 12], sets: 2, rest: 60, startKg: 8,
      tips: ['ベンチに座り、ダンベル1個を両手で頭上に持つ', '肘を前に向けたまま、頭の後ろへ深く下ろす', '肘の位置を動かさずに伸ばす'],
      mistakes: ['肘が大きく開く', '腰が反る'],
    },
    // ---- 脚・お尻 ----
    {
      id: 'goblet_squat', name: 'ゴブレットスクワット', part: '脚・お尻',
      primary: ['大腿四頭筋', '大臀筋'], secondary: ['内転筋', '体幹'],
      unit: 'kg', range: [8, 12], sets: 3, rest: 120, startKg: 12,
      tips: ['ダンベル1個を胸の前で縦に持つ', '足は肩幅、つま先はやや外。膝はつま先と同じ向き', '太ももが床と平行かそれより深くしゃがむ'],
      mistakes: ['かかとが浮く', '膝が内側に入る', '背中が丸まる'],
      note: 'ダンベル1個の重量を記録',
    },
    {
      id: 'db_rdl', name: 'ダンベルルーマニアンデッドリフト', part: '脚・お尻',
      primary: ['ハムストリング', '大臀筋'], secondary: ['脊柱起立筋'],
      unit: 'kg', range: [8, 12], sets: 3, rest: 120, startKg: 14,
      tips: ['膝を軽く曲げたまま固定し、お尻を後ろに引いて上体を倒す', 'ダンベルは太ももに沿わせて下ろす', '背中はまっすぐ。ハムストリングが伸びたところで戻る'],
      mistakes: ['背中が丸まる（腰痛の原因）', '膝を曲げすぎてスクワットになる'],
    },
    {
      id: 'bulgarian', name: 'ブルガリアンスプリットスクワット', part: '脚・お尻', perSide: true,
      primary: ['大腿四頭筋', '大臀筋'], secondary: ['ハムストリング', '内転筋'],
      unit: 'kg', range: [8, 12], sets: 3, rest: 90, startKg: 6,
      tips: ['後ろ足の甲をベンチに乗せ、前足は大きく前に出す', '真下にしゃがむ（前膝がつま先より大きく出すぎない）', '上体をやや前傾するとお尻に効く'],
      mistakes: ['前後の足幅が狭く、膝に負担がかかる', 'ふらつく（最初は自重でOK）'],
    },
    {
      id: 'step_up', name: 'ダンベルステップアップ', part: '脚・お尻', perSide: true,
      primary: ['大腿四頭筋', '大臀筋'], secondary: ['ハムストリング'],
      unit: 'kg', range: [10, 12], sets: 2, rest: 90, startKg: 6,
      tips: ['ベンチ（フラット）に片足を乗せる', '乗せた足のかかとで押して立ち上がる', '下の足で床を蹴らない'],
      mistakes: ['後ろ足で跳ねて反動を使う'],
    },
    {
      id: 'hip_thrust', name: 'ダンベルヒップスラスト', part: '脚・お尻',
      primary: ['大臀筋'], secondary: ['ハムストリング'],
      unit: 'kg', range: [10, 15], sets: 3, rest: 90, startKg: 14,
      tips: ['肩甲骨の下あたりをベンチの縁にあて、ダンベル1個を骨盤の上に置く（タオルを敷く）', 'かかとで床を押し、お尻を締めて体が一直線になるまで上げる', 'あごを引いて、目線はお腹へ'],
      mistakes: ['腰を反って上げる', '膝が開く・閉じる'],
      note: 'ダンベル1個の重量を記録',
    },
    {
      id: 'calf_raise', name: 'カーフレイズ', part: '脚・お尻',
      primary: ['下腿三頭筋'], secondary: [],
      unit: 'kg', range: [12, 20], sets: 3, rest: 60, startKg: 10,
      tips: ['段差（ステッパーの縁など）につま先を乗せる', 'かかとを深く下ろしてから、つま先立ちで1秒止める', '片手は壁などに添えてバランスを取る'],
      mistakes: ['バウンドさせて速く動く'],
    },
    // ---- 体幹 ----
    {
      id: 'plank', name: 'プランク', part: '体幹',
      primary: ['腹横筋', '腹直筋'], secondary: ['臀部', '肩周り'],
      unit: 'sec', range: [30, 60], step: 5, sets: 2, rest: 60,
      tips: ['肘は肩の真下、頭からかかとまで一直線', 'お尻を締め、おへそを背骨に近づける', '呼吸は止めない'],
      mistakes: ['お尻が下がって腰が反る', 'お尻が上がりすぎる'],
      progression: '60秒できたら、片足を浮かせる／ダンベルを背中に乗せる',
    },
    {
      id: 'hanging_knee', name: 'ハンギングニーレイズ', part: '体幹',
      primary: ['腹直筋下部'], secondary: ['腸腰筋'],
      unit: 'bw', range: [8, 15], sets: 3, rest: 60,
      tips: ['懸垂スタンドにぶら下がる（ディップス台で肘をついてもOK）', '骨盤を丸めるように膝を胸に引きつける', '下ろすときに体が振れないようゆっくり'],
      mistakes: ['脚を振り上げて反動を使う'],
      regression: '膝を90°まで上げるだけにする／ディップス台で肘をついて行う',
    },
    {
      id: 'dead_bug', name: 'デッドバグ', part: '体幹', perSide: true,
      primary: ['腹横筋'], secondary: ['腹直筋'],
      unit: 'bw', range: [8, 12], sets: 2, rest: 60,
      tips: ['仰向けで腕を天井へ、膝と股関節を90°にする', '腰を床に押しつけたまま、対角の手足を伸ばす', '息を吐きながら伸ばす'],
      mistakes: ['腰が床から浮く'],
    },
    // ---- 有酸素 ----
    {
      id: 'stepper', name: 'ステッパー（有酸素）', part: '有酸素',
      primary: ['心肺機能', '内臓脂肪の燃焼'], secondary: ['脚'],
      unit: 'min', range: [15, 30], step: 5, sets: 1, rest: 0,
      tips: ['会話ができるくらいの強さ（ゾーン2・RPE5〜6）で続ける', '手すりに体重をあずけすぎない', '筋トレの後か、休みの日に行う'],
      mistakes: ['息が切れるほど速く踏み、続かない'],
      optional: true,
    },
  ];

  // 部位ごとの週のセット数を数えるための対応表（メイン＝1セット、サブ＝0.5セットとして数える）
  const WORK = {
    db_bench: { chest: 1, shoulders: 0.5, triceps: 0.5 },
    incline_press: { chest: 1, shoulders: 0.5, triceps: 0.5 },
    dips: { chest: 1, triceps: 1, shoulders: 0.5 },
    one_arm_row: { back: 1, biceps: 0.5 },
    incline_row: { back: 1, shoulders: 0.5, biceps: 0.5 },
    pullup: { back: 1, biceps: 0.5 },
    chinup: { back: 1, biceps: 1 },
    seated_press: { shoulders: 1, triceps: 0.5 },
    side_raise: { shoulders: 1 },
    rear_raise: { shoulders: 1, back: 0.5 },
    db_curl: { biceps: 1 },
    oh_triceps: { triceps: 1 },
    goblet_squat: { quads: 1, glutes: 0.5 },
    db_rdl: { glutes: 1 },
    bulgarian: { quads: 1, glutes: 1 },
    step_up: { quads: 1, glutes: 0.5 },
    hip_thrust: { glutes: 1 },
    calf_raise: { calves: 1 },
    plank: { core: 1 },
    hanging_knee: { core: 1 },
    dead_bug: { core: 1 },
    stepper: {},
  };
  list.forEach((e) => { e.work = WORK[e.id] || {}; });

  // 部位と、40代初心者向けの週のセット数の目安
  const GROUPS = [
    { k: 'chest', label: '胸', min: 8, max: 16 },
    { k: 'back', label: '背中', min: 8, max: 16 },
    { k: 'shoulders', label: '肩', min: 6, max: 16 },
    { k: 'quads', label: '前もも', min: 8, max: 16 },
    { k: 'glutes', label: 'お尻・裏もも', min: 10, max: 20 }, // 2つの部位をまとめているので広め
    { k: 'biceps', label: '腕（力こぶ）', min: 4, max: 10 },
    { k: 'triceps', label: '腕（二の腕）', min: 4, max: 10 },
    { k: 'calves', label: 'ふくらはぎ', min: 3, max: 9 },
    { k: 'core', label: '体幹', min: 4, max: 10 },
  ];

  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  const PARTS = ['胸', '背中', '肩', '腕', '脚・お尻', '体幹', '有酸素'];
  const UNIT_LABEL = { kg: 'kg', bw: '回', sec: '秒', min: '分' };

  return { list, byId, PARTS, UNIT_LABEL, GROUPS };
})();
