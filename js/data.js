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
      body: '## 今日の出来事\n\n\n## 感じたこと\n\n\n## 明日の楽しみ\n\n',
    },
    {
      id: 'gratitude', name: '感謝日記（3 Good Things）', icon: '🙏', tags: [],
      body: '## 今日よかったこと3つ\n1. \n2. \n3. \n\n## なぜそれが起きたのか\n\n',
    },
    {
      id: 'morning', name: 'モーニングページ', icon: '🌅', tags: [],
      body: '## 今朝の気分\n\n\n## 頭の中をそのまま書き出す\n\n',
    },
    {
      id: 'evening', name: '夜の振り返り', icon: '🌙', tags: [],
      body: '## 今日のハイライト\n\n\n## うまくいかなかったこと\n\n\n## 自分にかけたい言葉\n\n',
    },
    {
      id: 'selfcare', name: '自分をいたわる', icon: '🫖', tags: [],
      body: '## 最近がんばっていること\n\n\n## 疲れているところ\n\n\n## 自分にしてあげたいこと\n- \n',
    },
    {
      id: 'weekly', name: '週のメモ', icon: '🗓️', tags: [],
      body: '## 今週のいちばんの思い出\n\n\n## 気づいたこと\n- \n\n## 来週やってみたいこと\n- \n',
    },
    {
      id: 'worry', name: '不安の整理', icon: '🌀', tags: [],
      body: '## 何が不安？\n\n\n## 最悪の場合どうなる？\n\n\n## 実際に起こりそうなことは？\n\n\n## 自分にできること\n- [ ] \n',
    },
    {
      id: 'dream', name: '夢日記', icon: '💭', tags: [],
      body: '## 夢の内容\n\n\n## 印象的だった場面・感情\n\n',
    },
  ];


  /* ---------- こころのジャーナル（研究ベース） ---------- */
  const ENERGY = [
    { v: 1, l: 'ぐったり' }, { v: 2, l: '低め' }, { v: 3, l: 'ふつう' }, { v: 4, l: '高め' }, { v: 5, l: '元気' },
  ];

  // 感情の語彙（快/不快 × 高/低）。細かく名前をつけるほど気持ちを扱いやすくなる
  const EMOTIONS = [
    { g: 'hp', l: '明るい', words: ['うれしい', 'わくわく', '楽しい', '満たされた', '誇らしい', '愛おしい'] },
    { g: 'lp', l: 'おだやか', words: ['穏やか', '安心', 'ほっとした', 'ありがたい', 'リラックス', '癒された'] },
    { g: 'hn', l: 'ざわざわ', words: ['不安', '焦り', 'イライラ', '緊張', '怒り', 'もどかしい'] },
    { g: 'ln', l: 'しずむ', words: ['疲れ', 'さみしい', '悲しい', 'もやもや', 'むなしい', 'へとへと'] },
  ];

  const RESEARCH = {
    goodthings: {
      title: 'よかったことを3つ書く',
      text: '毎晩「よかったこと3つと、その理由」を1週間書いた人は、その後6か月にわたって幸福感が高く、抑うつ傾向が低い状態が続いたと報告されています。',
      ref: 'Seligman et al. (2005)',
    },
    gratitude: {
      title: '感謝を書き留める',
      text: '感謝したことを定期的に書き留めると、前向きな気分や生活への満足感が高まることが示されています。',
      ref: 'Emmons & McCullough (2003)',
    },
    kindness: {
      title: '親切を数える',
      text: '日本の大学生を対象にした研究で、自分がした親切を1週間数えて記録しただけで、幸福感が高まりました。親切に気づくこと自体に意味があります。',
      ref: 'Otake et al. (2006)',
    },
    savoring: {
      title: '楽しみを味わう（セイバリング）',
      text: '楽しみなことを思い描いたり、よかった瞬間をゆっくり味わったりすることで、ポジティブな気持ちが長く続きやすくなります。',
      ref: 'Bryant & Veroff (2007)',
    },
    intention: {
      title: '大切にしたいことを意識する',
      text: '自分にとって大切な価値を思い出して言葉にすると、ストレスの影響がやわらぎ、行動に一貫性が生まれることが報告されています。',
      ref: 'Cohen & Sherman (2014); Hayes et al. (2006)',
    },
    affect: {
      title: '気持ちに名前をつける',
      text: '感じている気持ちを言葉にすると、扁桃体の反応が弱まることが脳画像研究で示されています。言葉が細かいほど、気持ちを扱いやすくなります。',
      ref: 'Lieberman et al. (2007); Barrett (2017)',
    },
    compassion: {
      title: 'セルフ・コンパッション',
      text: 'つらいときに、親しい友人にかけるような言葉を自分にもかけること。自分を責めるより、不安や落ち込みが少なく、立ち直りやすいことが多くの研究で示されています。',
      ref: 'Neff (2003); MacBeth & Gumley (2012)',
    },
    distance: {
      title: '少し離れて眺める',
      text: '自分の状況を「友人ならどう見るか」と一歩引いて考えると、感情に飲み込まれにくくなり、冷静に考えやすくなります。',
      ref: 'Kross & Ayduk (2011)',
    },
    offload: {
      title: '気がかりを書いて置いておく',
      text: '頭に残っていることを寝る前に書き出すと、考えがぐるぐるしにくくなります。明日やることを5分書いた人は、より早く眠りにつきました。',
      ref: 'Scullin et al. (2018)',
    },
    narrative: {
      title: '出来事を物語として書く',
      text: '書くことの効果は、感情を吐き出すことより、出来事の意味や因果を言葉にして整理していく過程と関係していると報告されています。',
      ref: 'Pennebaker & Seagal (1999)',
    },
    expressive: {
      title: 'エクスプレッシブ・ライティング',
      text: '気になっている出来事について、思考と感情を15〜20分自由に書く方法。数百の研究があり、効果は小さめながら心身の健康への良い影響が報告されています。',
      ref: 'Pennebaker & Beall (1986); Frattaroli (2006)',
    },
    future: {
      title: 'ベスト・ポッシブル・セルフ',
      text: 'すべてが順調に進んだ未来の自分を具体的に描くと、楽観性や前向きな気分が高まることが複数の研究で示されています。',
      ref: 'King (2001); Peters et al. (2010)',
    },
    rumination: {
      title: '反すうに注意',
      text: '同じ不安や不満をくり返し書くだけだと、かえって気分が沈むことがあります。「何があった → どう感じた → 何に気づいた」まで進めるのがコツです。',
      ref: 'Nolen-Hoeksema et al. (2008)',
    },
    habit: {
      title: '短く、毎日',
      text: '新しい習慣が自然にできるようになるまでの中央値は約66日。朝の歯みがきの後や寝る前など、いつもの行動にひもづけると続きやすくなります。',
      ref: 'Lally et al. (2010)',
    },
  };

  // id は保存データとの互換のため以前のものを維持（morning / checkin / shutdown / reset / weekly / expressive）
  const FLOWS = {
    morning: {
      id: 'morning', name: '朝のひととき', short: '朝', icon: '🌅', minutes: 2, once: true, tags: [],
      sub: '今日をどう過ごしたいか',
      desc: '今の気持ちを確かめ、今日大切にしたいことと、ちょっとした楽しみを思い浮かべます。',
      research: ['intention', 'savoring', 'affect'],
      steps: [
        { key: 'state', type: 'state', label: '朝の気持ち', q: 'おはようございます。いまの気持ちは？', hint: '当てはまるものを選ぶだけで大丈夫です。', research: 'affect' },
        { key: 'intention', type: 'line', label: '今日大切にしたいこと', q: '今日、大切にしたいことは？', hint: 'やることリストではなく、どんなふうに過ごしたいか。ひとことで十分です。', placeholder: '例：ゆっくりごはんを味わう／自分にやさしく', research: 'intention' },
        { key: 'lookforward', type: 'line', label: '今日の楽しみ', q: '今日、ちょっと楽しみなことは？', hint: '小さなことでかまいません。思い浮かべるだけで気持ちが少し上向きます。', placeholder: '例：帰りにパン屋に寄る', research: 'savoring', optional: true },
      ],
      done: '🌅 いい一日になりますように。',
    },
    checkin: {
      id: 'checkin', name: 'ひとこと', short: 'ひとこと', icon: '✏️', minutes: 1, tags: [],
      sub: 'いまの気持ちを、ひとことだけ',
      desc: 'うれしかったこと、しんどかったこと、ふと気づいたこと。いつでも1分で残せます。',
      research: ['savoring', 'affect'],
      steps: [
        { key: 'quick', type: 'quick', label: 'ひとこと', q: 'いま、どんな気持ち？', hint: 'よかった瞬間は、書き留めることでもう一度味わえます。', research: 'savoring' },
      ],
    },
    shutdown: {
      id: 'shutdown', name: '夜のふりかえり', short: '夜', icon: '🌙', minutes: 3, once: true, tags: [],
      sub: 'よかったことを3つ',
      desc: '今日のよかったことを3つ見つけ、気がかりは書いて置いておく。おだやかに一日を閉じます。',
      research: ['goodthings', 'kindness', 'offload', 'narrative'],
      steps: [
        { key: 'good', type: 'list', slots: 3, label: '今日よかったこと', q: '今日よかったことを3つ', hint: '小さなことで大丈夫です。「なぜそうなったか」を添えると、より心に残ります。', examples: ['例：同僚が手伝ってくれた（声をかけてよかった）', '例：夕焼けがきれいだった', '例：夕飯がおいしくできた'], research: 'goodthings', suggest: 'todayGood' },
        { key: 'kindness', type: 'line', label: '親切', q: '今日、誰かにした親切・してもらった親切は？', placeholder: '例：電車で席をゆずった', research: 'kindness', optional: true },
        { key: 'story', type: 'text', label: '今日の出来事', q: '心に残っていることがあれば', hint: 'うれしかったことも、ひっかかったことも。何があって、どう感じたかを自由に。', research: 'narrative', optional: true },
        { key: 'letgo', type: 'list', label: '置いていくこと', q: '頭に残っている気がかりは？', hint: 'ここに書いたら、今夜はもう考えなくて大丈夫です。', placeholder: '例：明日、Aさんに返事をする', research: 'offload', optional: true },
        { key: 'state', type: 'state', label: '夜の気持ち', q: '最後に、いまの気持ちは？', research: 'affect' },
      ],
      done: '🌙 今日もおつかれさまでした。\nゆっくり休んでくださいね。',
    },
    reset: {
      id: 'reset', name: 'こころのケア', short: 'ケア', icon: '🫧', minutes: 3, tags: [],
      sub: 'しんどいときに',
      desc: '気持ちに名前をつけ、友人にかけるような言葉を自分にかけてあげます。',
      research: ['affect', 'compassion', 'distance'],
      steps: [
        { key: 'situation', type: 'text', label: '何があったか', q: '何がありましたか？', hint: 'うまく書けなくても大丈夫。思いつくままに。', placeholder: '例：仕事でミスをして、上司に注意された' },
        { key: 'state', type: 'state', label: '気持ち', q: 'その気持ちに名前をつけると？', hint: '「いま、自分は〇〇と感じている」と認めるだけで、気持ちは少し落ち着きます。', research: 'affect' },
        { key: 'compassion', type: 'text', label: '自分へのことば', q: '大切な友人が同じ状況だったら、どんな言葉をかけますか？', hint: 'その言葉を、そのまま自分にもかけてあげましょう。つらいのはあなただけではありません。', placeholder: '例：誰にでもミスはあるよ。気づけたんだから、次は大丈夫。', research: 'compassion' },
        { key: 'care', type: 'line', label: 'やさしい一歩', q: 'いまの自分にしてあげられる、小さなことは？', placeholder: '例：温かいお茶を飲む／早めに寝る', optional: true },
      ],
      done: '🫧 よく向き合いましたね。\n自分にやさしくする時間を、少しでもとってください。',
    },
    weekly: {
      id: 'weekly', name: '週のふりかえり', short: '週', icon: '🍃', minutes: 5, tags: [],
      sub: '1週間を味わいなおす',
      desc: 'この1週間のよかったことを読み返し、来週大切にしたいことを決めます。',
      research: ['goodthings', 'savoring', 'intention'],
      steps: [
        { key: 'good', type: 'weekGood', label: '今週のよかったこと', q: '今週のよかったこと', hint: 'この1週間に書いた「よかったこと」を集めました。読み返して、もう一度味わってみてください。', research: 'savoring' },
        { key: 'energy', type: 'text', label: '元気をくれたもの', q: '元気をくれたもの、すり減らしたものは？', hint: '下のグラフは、今週の記録から集めた気分の流れです。', optional: true, showWeekMood: true },
        { key: 'self', type: 'line', label: '自分へのひとこと', q: '今週の自分に、ひとこと声をかけるなら？', placeholder: '例：忙しいなか、よくがんばったね', research: 'compassion' },
        { key: 'next', type: 'line', label: '来週大切にしたいこと', q: '来週、大切にしたいことは？', placeholder: '例：週に2回は散歩する', research: 'intention', optional: true },
      ],
    },
    expressive: {
      id: 'expressive', name: '書き出す', short: '書き出す', icon: '📝', minutes: 15, tags: [],
      sub: 'もやもやを、時間を決めて書ききる',
      desc: '気になっていることについて、思考と感情をタイマーが終わるまで書き続けます。',
      research: ['expressive', 'rumination'],
      steps: [
        { key: 'text', type: 'timer', label: '書き出し', q: '心にあることを、そのまま書き続けてください', hint: '文法も構成も気にせず、手を止めずに。書いた内容は誰にも見られません。終わりの数分は「何に気づいたか」も書いてみましょう。', research: 'expressive' },
      ],
    },
    future: {
      id: 'future', name: '未来の自分', short: '未来', icon: '🌱', minutes: 10, tags: [],
      sub: 'なりたい自分を描く',
      desc: '物事がうまく進んだ数年後の自分を、具体的に思い描いて書きます。',
      research: ['future'],
      steps: [
        { key: 'vision', type: 'text', label: '未来の自分', q: 'すべてが順調に進んだ、数年後のある一日を描いてみましょう', hint: 'どこで、誰と、どんなふうに過ごしていますか？ 仕事、人間関係、健康、趣味。夢物語でかまいません。できるだけ具体的に。', placeholder: '例：朝はゆっくりコーヒーを淹れて…', research: 'future', tall: true },
        { key: 'step', type: 'line', label: 'いまできる一歩', q: 'その未来に近づくために、いまできる小さな一歩は？', placeholder: '例：気になっていた講座を調べてみる', optional: true },
      ],
      done: '🌱 すてきな未来ですね。\nときどき読み返してみてください。',
    },
  };

  global.JData = { MOODS, PROMPTS, TEMPLATES, ENERGY, EMOTIONS, RESEARCH, FLOWS };
})(window);
