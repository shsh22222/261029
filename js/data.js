/* 定数データ：気分・お題・テンプレート */
(function (global) {
  'use strict';

  const MOODS = [
    { v: 1, e: '😣', l: 'つらい' },
    { v: 2, e: '😔', l: 'いまいち' },
    { v: 3, e: '😐', l: 'ふつう' },
    { v: 4, e: '🙂', l: 'よい' },
    { v: 5, e: '😄', l: '最高' },
  ];

  const PROMPTS = [
    '今日いちばん心が動いた瞬間は？',
    '今日、誰かに感謝したいことは何ですか？',
    '今のあなたを天気にたとえると？その理由は？',
    '最近うまくいったことと、その理由を書いてみましょう。',
    '今日学んだ、ささいだけど面白いことは？',
    '頭の中でぐるぐるしている考えを、全部書き出してみましょう。',
    '1年後の自分に伝えたいことは？',
    '今日の自分を褒めるとしたら、どこを褒めますか？',
    '最近「もやっ」としたことは？本当は何が気になっている？',
    '今週の小さな勝利を3つ挙げてください。',
    'もし明日が完全に自由な一日なら、何をしますか？',
    '最近読んだ・観た・聴いたもので印象に残ったものは？',
    '今、手放したいと思っているものは何ですか？',
    '子どもの頃の自分が今のあなたを見たら、何と言うと思いますか？',
    '今日エネルギーをくれたもの、奪ったものは？',
    '最近気づいた自分の「くせ」や「パターン」は？',
    '今いちばん大切にしたい人は誰？その人にどう接したい？',
    '今日の五感の記憶：見たもの、聞いた音、匂い、味、触れたもの。',
    '「本当はやりたいのに、やっていないこと」は何ですか？',
    '最近の不安を書き出して、それぞれに「自分にできること」を添えてみましょう。',
    '今日、誰かのためにできたことは？',
    '最近笑ったことを思い出して書いてみましょう。',
    '理想の一日の過ごし方を、朝から夜まで描いてみてください。',
    '今の自分に必要な言葉を、自分自身にかけてあげてください。',
    '最近の決断の中で、迷ったものは？最終的に何が決め手になった？',
    '今の暮らしで「十分足りている」と感じるものは？',
    '5年前の自分と比べて、変わったこと・変わらないことは？',
    '今日の出来事をひとつ、物語のワンシーンのように描写してみましょう。',
    '今週、もっと時間を使いたいことと、減らしたいことは？',
    '眠る前に、今日という日にひとことタイトルをつけるなら？',
  ];

  const TEMPLATES = [
    {
      id: 'daily', name: 'デイリー', icon: '☀️',
      body: '## 今日の出来事\n\n\n## 感じたこと\n\n\n## 明日やりたいこと\n- [ ] \n',
    },
    {
      id: 'gratitude', name: '感謝日記（3 Good Things）', icon: '🙏', tags: ['感謝'],
      body: '## 今日よかったこと3つ\n1. \n2. \n3. \n\n## なぜそれが起きたのか\n\n',
    },
    {
      id: 'morning', name: 'モーニングページ', icon: '🌅', tags: ['朝'],
      body: '## 今朝の気分\n\n\n## 頭の中をそのまま書き出す\n\n\n## 今日の最優先事項\n- [ ] \n',
    },
    {
      id: 'evening', name: '夜の振り返り', icon: '🌙', tags: ['夜'],
      body: '## 今日のハイライト\n\n\n## うまくいかなかったこと\n\n\n## 自分にかけたい言葉\n\n',
    },
    {
      id: 'kpt', name: '振り返り（KPT）', icon: '🔁', tags: ['振り返り'],
      body: '## Keep（続けたいこと）\n- \n\n## Problem（課題）\n- \n\n## Try（次に試すこと）\n- \n',
    },
    {
      id: 'weekly', name: '週次レビュー', icon: '🗓️', tags: ['週次'],
      body: '## 今週のハイライト\n- \n\n## 学んだこと\n- \n\n## 来週のフォーカス\n- [ ] \n\n## 自分への評価（10点満点）\n/10\n',
    },
    {
      id: 'worry', name: '不安の整理', icon: '🌀', tags: ['メンタル'],
      body: '## 何が不安？\n\n\n## 最悪の場合どうなる？\n\n\n## 実際に起こりそうなことは？\n\n\n## 自分にできること\n- [ ] \n',
    },
    {
      id: 'dream', name: '夢日記', icon: '💭', tags: ['夢'],
      body: '## 夢の内容\n\n\n## 印象的だった場面・感情\n\n',
    },
  ];


  /* ---------- ワークジャーナル（研究ベース） ---------- */
  const ENERGY = [
    { v: 1, l: 'ぐったり' }, { v: 2, l: '低め' }, { v: 3, l: 'ふつう' }, { v: 4, l: '高め' }, { v: 5, l: '絶好調' },
  ];

  // 感情の粒度を上げるための語彙（快/不快 × エネルギー高/低）
  const EMOTIONS = [
    { g: 'hp', l: '快・高', words: ['わくわく', '意欲的', '集中', '楽しい', '誇らしい', '嬉しい'] },
    { g: 'lp', l: '快・低', words: ['穏やか', '安心', '満足', '感謝', 'ほっとした', 'リラックス'] },
    { g: 'hn', l: '不快・高', words: ['焦り', '不安', 'イライラ', '緊張', 'プレッシャー', '怒り'] },
    { g: 'ln', l: '不快・低', words: ['疲れ', 'もやもや', '落ち込み', '退屈', '無気力', '孤独'] },
  ];

  const RESEARCH = {
    progress: {
      title: '進捗の法則（Progress Principle）',
      text: '238人・約12,000件の業務日誌の分析で、仕事の日々のやる気や感情を最も高めていたのは「意味のある仕事で前進できた」という実感でした。小さな前進でも効果があります。',
      ref: 'Amabile & Kramer (2011) The Progress Principle',
    },
    reflection: {
      title: '終業時の振り返り',
      text: '研修中の従業員が1日の終わりに15分「学んだこと」を書いたところ、書かなかったグループより最終テストの成績が約23%高くなりました。',
      ref: 'Di Stefano, Gino, Pisano & Staats (2014) Making Experience Count',
    },
    ifthen: {
      title: '実行意図（If-Then プランニング）',
      text: '「もし〜になったら、〜する」と状況と行動をセットで決めておくと、目標の達成率が高まることが94研究のメタ分析で示されています（効果量 d≈0.65）。',
      ref: 'Gollwitzer & Sheeran (2006)',
    },
    offload: {
      title: 'やり残しの書き出し',
      text: '未完了の目標は頭に残り続けますが、具体的な計画を書き出すとその侵入思考が減ります。寝る前に「明日やること」を5分書いた人は、より早く眠りにつきました。',
      ref: 'Masicampo & Baumeister (2011); Scullin et al. (2018)',
    },
    detach: {
      title: '仕事からの心理的な切り離し',
      text: '終業後に仕事から心理的に離れられる人ほど、疲労回復や翌日の活力が高いことが繰り返し報告されています。「シャットダウン」の儀式で区切りをつけます。',
      ref: 'Sonnentag & Fritz (2015) ほか',
    },
    affect: {
      title: '感情のラベリング',
      text: '感じている気持ちに言葉で名前をつけると、扁桃体の反応が弱まることが脳画像研究で示されています。語彙が細かいほど感情を調整しやすくなります。',
      ref: 'Lieberman et al. (2007); Barrett (2017)',
    },
    distance: {
      title: '自己距離化',
      text: '自分を「私」ではなく名前や三人称で語ったり、友人に助言するつもりで考えたりすると、感情的な反応が和らぎ、冷静に考えやすくなります。',
      ref: 'Kross & Ayduk (2011); Kross et al. (2014)',
    },
    gratitude: {
      title: '感謝・よかったこと',
      text: '感謝やその日のよかったことを書き留める習慣は、幸福感や前向きな気分を高めることが報告されています。',
      ref: 'Emmons & McCullough (2003); Seligman et al. (2005)',
    },
    expressive: {
      title: 'エクスプレッシブ・ライティング',
      text: 'ストレスになっている出来事について、思考と感情を15〜20分自由に書く方法。数百の研究があり、効果は小さめながら心身の健康への良い影響が報告されています。',
      ref: 'Pennebaker & Beall (1986); Frattaroli (2006)',
    },
    habit: {
      title: '習慣化',
      text: '新しい習慣が自動化するまでの中央値は約66日。「始業時」「終業時」など既存の行動にひもづけ、短く続けることが鍵です。',
      ref: 'Lally et al. (2010)',
    },
  };

  const FLOWS = {
    morning: {
      id: 'morning', name: '始業前チェックイン', short: '始業前', icon: '☀️', minutes: 3, once: true, tags: ['始業前'],
      desc: '状態を確かめ、今日いちばん大事な「1つ」と「もし〜なら」の作戦を決めます。',
      research: ['progress', 'ifthen', 'affect'],
      steps: [
        { key: 'state', type: 'state', label: '始業時の状態', q: 'いまの状態は？', hint: 'エネルギー・気分・感情を選ぶだけ。気持ちに名前をつけるだけで落ち着きやすくなります。', research: 'affect' },
        { key: 'mit', type: 'line', label: '今日のMIT（最重要の1つ）', q: '今日いちばん前に進めたい「1つ」は？', hint: '意味のある小さな前進が、その日のやる気を最も高めます。「〜を終える」など具体的な行動で。', placeholder: '例：提案書の構成を最後まで決める', research: 'progress', suggest: 'tomorrow' },
        { key: 'ifthen', type: 'ifthen', label: 'もし〜なら', q: '邪魔が入りそうな場面と、その対策は？', hint: '「もし〜になったら、〜する」と決めておくと、実際にその場面で行動しやすくなります。', research: 'ifthen', optional: true },
        { key: 'intention', type: 'line', label: '今日の意図', q: '今日はどんな姿勢で働きたい？', hint: 'ひとことでOK。', placeholder: '例：落ち着いて、丁寧に', optional: true },
      ],
    },
    checkin: {
      id: 'checkin', name: 'クイックチェックイン', short: 'チェックイン', icon: '⚡', minutes: 1, tags: [],
      desc: '仕事の合間に1分。状態と、いま起きた前進・つまずき・気づきを記録します。',
      research: ['progress', 'affect'],
      steps: [
        { key: 'quick', type: 'quick', label: 'チェックイン', q: 'いま、どんな感じ？', hint: '前進は小さくても記録を。あとで見返すとやる気の源になります。', research: 'progress' },
      ],
    },
    reset: {
      id: 'reset', name: 'ストレス・リセット', short: 'リセット', icon: '🌀', minutes: 3, tags: ['リセット'],
      desc: 'イライラ・不安を感じたときに。事実と感情を分け、距離を取り、次の一歩を決めます。',
      research: ['affect', 'distance'],
      steps: [
        { key: 'situation', type: 'text', label: '何が起きたか（事実）', q: '何が起きましたか？', hint: '解釈や評価は脇に置いて、カメラに映る「事実」だけを書いてみましょう。', placeholder: '例：会議で企画への反対意見が続いた' },
        { key: 'state', type: 'state', label: '感情', q: 'その気持ちに名前をつけると？', hint: '当てはまる言葉をいくつでも。「名前をつける」こと自体が感情の波を和らげます。', research: 'affect' },
        { key: 'distance', type: 'text', label: '距離をとって見ると', q: '親しい同僚が同じ状況だったら、何と声をかけますか？', hint: '自分の名前を主語にして書いても効果的です（例：「〇〇は今、焦っている。なぜなら…」）。', research: 'distance' },
        { key: 'next', type: 'line', label: '次の一歩', q: '自分でコントロールできる、次の小さな一歩は？', placeholder: '例：反対意見の要点を3つに整理して共有する' },
      ],
    },
    shutdown: {
      id: 'shutdown', name: '終業シャットダウン', short: '終業後', icon: '🌙', minutes: 5, once: true, tags: ['終業'],
      desc: '前進を確かめ、学びを言葉にし、やり残しを書き出して頭から降ろす。仕事モードを終える儀式です。',
      research: ['progress', 'reflection', 'offload', 'detach', 'gratitude'],
      steps: [
        { key: 'mit', type: 'mitReview', label: '今日のMIT', q: '朝に決めた「1つ」はどうなりましたか？', hint: '結果に良い悪いはありません。事実を確かめるだけです。' },
        { key: 'wins', type: 'list', label: '今日の前進', q: '今日の前進・小さな勝利は？', hint: '1行に1つ。「メールを返した」レベルでも十分です。前進の実感がやる気を育てます。', placeholder: '例：レビュー指摘をすべて反映した\n例：難しい相談に落ち着いて対応できた', research: 'progress', suggest: 'todayWins' },
        { key: 'setback', type: 'text', label: 'つまずき', q: 'ひっかかったこと・うまくいかなかったことは？', hint: '書き出すことで、頭の中で反すうし続けるのを防げます。', optional: true },
        { key: 'learning', type: 'text', label: '学び', q: '今日の学びと、次に変えたいことは？', hint: '「経験」は振り返ってはじめて「学び」になります。', placeholder: '例：先に結論を伝えると会議が短く済んだ。明日も最初に要点を話す。', research: 'reflection' },
        { key: 'tomorrow', type: 'list', label: '明日やること', q: 'やり残したこと、明日の最初の一手は？', hint: '書いたら、もう覚えておく必要はありません。1行目は明日の始業前に提案されます。', placeholder: '例：A社への見積もりを送る\n例：資料の3章を書く', research: 'offload' },
        { key: 'gratitude', type: 'line', label: 'ありがたかったこと', q: '今日、ありがたかった人やことは？', placeholder: '例：Bさんが急ぎのレビューを引き受けてくれた', research: 'gratitude', optional: true },
        { key: 'state', type: 'state', label: '終業時の状態', q: '最後に、いまの状態は？', research: 'affect' },
      ],
      done: '🌙 シャットダウン完了。今日の仕事はここまでです。\n明日やることは書き出したので、もう頭の中に抱えておく必要はありません。お疲れさまでした。',
    },
    weekly: {
      id: 'weekly', name: '週次レビュー', short: '週次', icon: '🗓️', minutes: 10, tags: ['週次'],
      desc: '1週間の前進とエネルギーの傾向を振り返り、来週のフォーカスを決めます。',
      research: ['progress', 'reflection', 'ifthen'],
      steps: [
        { key: 'wins', type: 'weekWins', label: '今週の前進', q: '今週の前進を振り返りましょう', hint: 'チェックインと終業時に記録した前進を集めました。付け加えたいものがあれば書いてください。', research: 'progress' },
        { key: 'energy', type: 'text', label: 'エネルギーの源と消耗', q: '何がエネルギーをくれて、何が奪いましたか？', hint: '下のグラフは今週の記録から集計したエネルギーの推移です。', optional: true, showWeekEnergy: true },
        { key: 'learning', type: 'text', label: '今週の学び', q: '今週いちばんの学びは？', research: 'reflection' },
        { key: 'focus', type: 'list', label: '来週のフォーカス', q: '来週、最も前に進めたいことは？（3つまで）', placeholder: '例：新機能の設計レビューを通す' },
        { key: 'ifthen', type: 'ifthen', label: 'もし〜なら', q: '来週の障害になりそうなことへの作戦は？', research: 'ifthen', optional: true },
      ],
    },
    expressive: {
      id: 'expressive', name: 'エクスプレッシブ・ライティング', short: '書き出し', icon: '📝', minutes: 15, tags: ['書き出し'],
      desc: '気になっている出来事について、思考と感情をタイマーが終わるまで書き続けます。',
      research: ['expressive'],
      steps: [
        { key: 'text', type: 'timer', label: '書き出し', q: '頭と心にあることを、そのまま書き続けてください', hint: '文法も構成も気にせず、手を止めずに。仕事や人間関係で気になっていること、その時の気持ち、それが自分にとって何を意味するのか。書いた内容は誰にも見られません。', research: 'expressive' },
      ],
    },
  };

  global.JData = { MOODS, PROMPTS, TEMPLATES, ENERGY, EMOTIONS, RESEARCH, FLOWS };
})(window);
