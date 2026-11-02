/* 綴 Tsuzuri — メインアプリ */
(function () {
  'use strict';

  const { MOODS, PROMPTS, TEMPLATES, ENERGY, EMOTIONS, RESEARCH, FLOWS } = window.JData;
  const esc = MD.esc;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  const SETTINGS_KEY = 'tsuzuri.settings';

  const DEFAULT_SETTINGS = {
    theme: 'system', font: 'sans', fontSize: 17, dailyGoal: 400,
    autoLockMin: 0, weekStart: 0, editorMode: 'write', spellcheck: false,
    workStart: '09:00', workEnd: '18:00', workdays: [1, 2, 3, 4, 5], notify: false,
  };

  const state = {
    entries: new Map(),
    key: null,
    cryptoMeta: null,
    started: false,
    view: 'home',
    currentId: null,
    flow: null,
    filter: { q: '', tag: null, mood: null, fav: false, kind: null },
    calMonth: firstOfMonth(new Date()),
    calSelected: todayStr(),
    promptIdx: dayOfYear(new Date()) % PROMPTS.length,
    settings: loadSettings(),
    lastActivity: Date.now(),
  };

  /* ================= ユーティリティ ================= */
  function pad(n) { return String(n).padStart(2, '0'); }
  function toStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return toStr(new Date()); }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return toStr(d); }
  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function dayOfYear(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }
  function fmtDate(s, withYear = true) {
    const d = parseDate(s);
    return (withYear ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WEEK[d.getDay()] + '）';
  }
  function fmtTime(ts) { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtDateTime(ts) { const d = new Date(ts); return toStr(d) + ' ' + fmtTime(ts); }
  function relDays(s) {
    const diff = Math.round((parseDate(todayStr()) - parseDate(s)) / 86400000);
    if (diff === 0) return '今日';
    if (diff === 1) return '昨日';
    if (diff < 0) return Math.abs(diff) + '日後';
    if (diff < 30) return diff + '日前';
    if (diff < 365) return Math.floor(diff / 30) + 'か月前';
    return Math.floor(diff / 365) + '年前';
  }
  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function chars(text) { return String(text || '').replace(/\s/g, '').length; }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function moodOf(v) { return MOODS.find((m) => m.v === v); }
  function regexEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function highlight(text, terms) {
    const ts = terms.filter((t) => t && !t.startsWith('#'));
    if (!ts.length) return esc(text);
    const re = new RegExp('(' + ts.map(regexEscape).join('|') + ')', 'gi');
    return String(text).split(re).map((part, i) => (i % 2 ? '<mark>' + esc(part) + '</mark>' : esc(part))).join('');
  }

  function loadSettings() {
    try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) { /* noop */ }
    applySettings();
  }
  function applySettings() {
    const r = document.documentElement;
    const s = state.settings;
    if (s.theme === 'system') delete r.dataset.theme; else r.dataset.theme = s.theme;
    r.dataset.font = s.font;
    r.style.setProperty('--editor-size', s.fontSize + 'px');
  }

  function toast(msg, ms = 2400) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  /** Promise ベースのモーダル */
  function ask({ title, message = '', ok = 'OK', cancel = 'キャンセル', danger = false, input = null }) {
    return new Promise((resolve) => {
      const m = $('#modal');
      m.innerHTML =
        '<form class="modal-card" method="dialog">' +
        '<h3>' + esc(title) + '</h3>' +
        (message ? '<p>' + esc(message).replace(/\n/g, '<br>') + '</p>' : '') +
        (input ? '<input class="input" id="modalInput" type="' + (input.type || 'text') + '" placeholder="' + esc(input.placeholder || '') + '" value="' + esc(input.value || '') + '">' : '') +
        '<div class="modal-actions">' +
        (cancel ? '<button type="button" class="btn" data-act="cancel">' + esc(cancel) + '</button>' : '') +
        '<button type="submit" class="btn ' + (danger ? 'danger' : 'primary') + '">' + esc(ok) + '</button>' +
        '</div></form>';
      m.hidden = false;
      const inp = $('#modalInput', m);
      (inp || $('button[type=submit]', m)).focus();
      const close = (val) => { m.hidden = true; m.innerHTML = ''; document.removeEventListener('keydown', onKey, true); resolve(val); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
      document.addEventListener('keydown', onKey, true);
      $('form', m).addEventListener('submit', (e) => { e.preventDefault(); close(inp ? inp.value : true); });
      const c = $('[data-act=cancel]', m);
      if (c) c.addEventListener('click', () => close(null));
      m.onclick = (e) => { if (e.target === m) close(null); };
    });
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ================= データ層 ================= */
  function normalize(e) {
    return {
      id: String(e.id || uid()),
      date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : todayStr(),
      title: String(e.title || ''),
      body: String(e.body || ''),
      mood: [1, 2, 3, 4, 5].includes(e.mood) ? e.mood : null,
      tags: Array.isArray(e.tags) ? Array.from(new Set(e.tags.map((t) => String(t).trim()).filter(Boolean))) : [],
      favorite: !!e.favorite,
      kind: FLOWS[e.kind] ? e.kind : 'free',
      energy: [1, 2, 3, 4, 5].includes(e.energy) ? e.energy : null,
      emotions: Array.isArray(e.emotions) ? e.emotions.map(String).filter(Boolean) : [],
      data: e.data && typeof e.data === 'object' ? e.data : null,
      createdAt: Number(e.createdAt) || Date.now(),
      updatedAt: Number(e.updatedAt) || Date.now(),
    };
  }
  const serialize = (e) => normalize(e);
  const isEmpty = (e) => !e.title.trim() && !e.body.trim() && !e.mood && !e.tags.length;

  async function toRecord(e, key = state.key) {
    const data = serialize(e);
    return key ? { id: data.id, enc: await JCrypto.encrypt(key, data) } : data;
  }

  async function persist(e) { await DB.put(await toRecord(e)); }

  async function loadAll() {
    const recs = await DB.getAll();
    state.entries.clear();
    let failed = 0;
    for (const r of recs) {
      try {
        const e = r.enc ? await JCrypto.decrypt(state.key, r.enc) : r;
        state.entries.set(String(r.id), normalize(e));
      } catch (err) { failed++; }
    }
    if (failed) toast(failed + '件のエントリーを読み込めませんでした');
  }

  function sorted() {
    return Array.from(state.entries.values()).sort((a, b) =>
      a.date === b.date ? b.createdAt - a.createdAt : (a.date < b.date ? 1 : -1));
  }

  function allTags() {
    const map = new Map();
    for (const e of state.entries.values()) for (const t of e.tags) map.set(t, (map.get(t) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
  }

  function byDate() {
    const map = new Map();
    for (const e of state.entries.values()) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    }
    return map;
  }

  function computeStreaks() {
    const dates = new Set(Array.from(state.entries.values()).map((e) => e.date));
    let current = 0;
    let d = todayStr();
    if (!dates.has(d)) d = addDays(d, -1);
    while (dates.has(d)) { current++; d = addDays(d, -1); }
    const list = Array.from(dates).sort();
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const x of list) {
      run = prev && addDays(prev, 1) === x ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = x;
    }
    return { current, longest, days: dates.size, wroteToday: dates.has(todayStr()) };
  }

  function filteredEntries() {
    const { q, tag, mood, fav, kind } = state.filter;
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return sorted().filter((e) => {
      if (tag && !e.tags.includes(tag)) return false;
      if (mood && e.mood !== mood) return false;
      if (fav && !e.favorite) return false;
      if (kind && e.kind !== kind) return false;
      if (terms.length) {
        const hay = (e.title + '\n' + e.body + '\n' + e.date + '\n' + e.emotions.join(' ')).toLowerCase();
        const tagsLower = e.tags.map((t) => t.toLowerCase());
        return terms.every((t) => (t.startsWith('#') && t.length > 1
          ? tagsLower.some((x) => x.includes(t.slice(1))) || hay.includes(t)
          : hay.includes(t) || tagsLower.some((x) => x.includes(t))));
      }
      return true;
    });
  }

  function excerpt(e, terms, len = 120) {
    const text = MD.plain(e.body);
    const ts = terms.filter((t) => !t.startsWith('#'));
    if (ts.length) {
      const lower = text.toLowerCase();
      const idx = Math.min.apply(null, ts.map((t) => { const i = lower.indexOf(t); return i < 0 ? Infinity : i; }));
      if (isFinite(idx) && idx > 40) {
        const start = idx - 30;
        return '…' + text.slice(start, start + len) + (text.length > start + len ? '…' : '');
      }
    }
    return text.slice(0, len) + (text.length > len ? '…' : '');
  }

  function newEntry(date = todayStr(), init = {}) {
    const now = Date.now();
    const e = normalize(Object.assign({ id: uid(), date, createdAt: now, updatedAt: now }, init));
    state.entries.set(e.id, e);
    return e;
  }

  /* ================= ナビゲーション ================= */
  async function leaveEditor() {
    if (state.view !== 'editor' || !state.currentId) return;
    const e = state.entries.get(state.currentId);
    if (!e) return;
    if (isEmpty(e)) {
      state.entries.delete(e.id);
      try { await DB.remove(e.id); } catch (err) { /* noop */ }
    } else if (saveTimer) {
      await saveNow();
    }
  }

  async function go(view, opts = {}) {
    if (state.view === 'flow' && view !== 'flow' && state.flow) {
      if (state.flow.dirty && !opts.force) {
        const ok = await ask({ title: '入力中の内容を破棄しますか？', message: 'このセッションはまだ保存されていません。', ok: '破棄する', cancel: '続ける', danger: true });
        if (!ok) return;
      }
      stopFlowTimer();
      state.flow = null;
    }
    if (view === 'editor' && state.view !== 'editor') state.prevView = state.view;
    await leaveEditor();
    document.body.classList.remove('focus-mode', 'nav-open');
    state.view = view;
    if (view === 'editor') state.currentId = opts.id;
    $$('#nav button, #bottombar button[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    document.body.dataset.view = view;
    const main = $('#main');
    main.scrollTop = 0;
    window.scrollTo(0, 0);
    ({ home: renderHome, list: renderList, calendar: renderCalendar, stats: renderStats, settings: renderSettings, editor: renderEditor, flow: renderFlow, guide: renderGuide })[view]();
    renderSidebar();
    if (opts.focus !== false && view !== 'editor') main.focus({ preventScroll: true });
  }

  function openEntry(id) { go('editor', { id }); }

  function writeNew(date = todayStr(), init = {}) {
    const e = newEntry(date, init);
    go('editor', { id: e.id });
  }

  /* ================= サイドバー ================= */
  function renderSidebar() {
    const tags = allTags();
    $('#tagList').innerHTML = tags.length
      ? tags.slice(0, 40).map(([t, n]) =>
        '<button class="tag-chip' + (state.view === 'list' && state.filter.tag === t ? ' active' : '') + '" data-tag="' + esc(t) + '">#' + esc(t) + '<span>' + n + '</span></button>').join('')
      : '<p class="muted small">タグはまだありません</p>';
    const st = computeStreaks();
    $('#sideFoot').innerHTML =
      '<div class="streak-mini" title="連続記録">🔥 <b>' + st.current + '</b>日連続</div>' +
      '<div class="muted small">' + state.entries.size + ' 件の記録' + (state.key ? ' · 🔒 暗号化' : '') + '</div>';
  }

  /* ================= ホーム ================= */
  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return '夜更かしですね';
    if (h < 11) return 'おはようございます';
    if (h < 18) return 'こんにちは';
    return 'こんばんは';
  }

  function entryCard(e, terms = []) {
    const mood = moodOf(e.mood);
    const title = e.title || MD.plain(e.body).slice(0, 40) || '（無題）';
    return '<article class="entry-card" data-id="' + esc(e.id) + '" tabindex="0">' +
      '<div class="ec-side"><div class="ec-day">' + parseDate(e.date).getDate() + '</div><div class="ec-wd">' + WEEK[parseDate(e.date).getDay()] + '</div></div>' +
      '<div class="ec-body">' +
      '<div class="ec-meta">' + fmtDate(e.date) + ' · ' + fmtTime(e.createdAt) + (e.favorite ? ' · <span class="star">★</span>' : '') + '</div>' +
      '<h3>' + (e.kind !== 'free' ? '<span class="kind-badge kind-' + e.kind + '">' + KIND_LABEL(e.kind) + '</span>' : '') + highlight(title, terms) + '</h3>' +
      '<p>' + highlight(excerpt(e, terms), terms) + '</p>' +
      (e.tags.length || e.energy || e.emotions.length ? '<div class="ec-tags">' + (e.energy ? '<span class="ec-energy">⚡' + e.energy + '</span>' : '') + e.emotions.slice(0, 4).map((w) => '<span class="ec-emo emo-' + emoGroup(w) + '">' + esc(w) + '</span>').join('') + e.tags.map((t) => '<span>#' + esc(t) + '</span>').join('') + '</div>' : '') +
      '</div>' +
      (mood ? '<div class="ec-mood mood-' + mood.v + '" title="' + mood.l + '">' + mood.e + '</div>' : '') +
      '</article>';
  }

  function bindCards(root) {
    $$('.entry-card', root).forEach((c) => {
      c.addEventListener('click', () => openEntry(c.dataset.id));
      c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') openEntry(c.dataset.id); });
    });
  }

  function renderHome() {
    const today = todayStr();
    const all = sorted();
    const todays = all.filter((e) => e.date === today);
    const st = computeStreaks();
    const ws = workStats();
    const rec = recommendedFlow();
    const morning = ofKind('morning', today)[0];
    const shutdown = ofKind('shutdown', today)[0];
    const checkins = ofKind('checkin', today);
    const mit = mitText(morning);
    const md = today.slice(5);
    const onThisDay = all.filter((e) => e.date !== today && e.kind === 'free' && (e.date.slice(5) === md || e.date === addDays(today, -7) || e.date === addDays(today, -30)));
    const recentWins = winsBetween(addDays(today, -13), today).slice(0, 8);
    const lastEnergy = all.find((e) => e.energy);
    const prompt = PROMPTS[state.promptIdx % PROMPTS.length];
    const t = reminderTimes();

    const step = (id, status, sub) => {
      const f = FLOWS[id];
      return '<button class="wf-card' + (rec === id ? ' rec' : '') + (status === 'done' ? ' done' : '') + '" data-flow="' + id + '">' +
        (rec === id ? '<span class="wf-rec">いまおすすめ</span>' : '') +
        '<span class="wf-icon">' + (status === 'done' ? '✅' : f.icon) + '</span>' +
        '<span class="wf-name">' + esc(f.short) + '</span>' +
        '<span class="wf-sub">' + sub + '</span></button>';
    };

    $('#main').innerHTML =
      '<div class="view home">' +
      '<header class="view-head"><div><p class="eyebrow">' + fmtDate(today) + (isWorkday() ? '' : ' · おやすみの日') + '</p><h1>' + greeting() + '</h1></div></header>' +

      (mit ? '<label class="mit-home' + (mitDone(morning) ? ' done' : '') + '"><input type="checkbox" id="mitCheck"' + (mitDone(morning) ? ' checked' : '') + '><span><small>🎯 今日の「1つ」</small>' + esc(mit) + '</span></label>' : '') +

      '<section class="workflow"><div class="section-head"><h2>今日のワークフロー</h2><button class="btn small ghost" data-goto="guide">📖 使い方と根拠</button></div>' +
      '<div class="wf-row">' +
      step('morning', morning ? 'done' : '', morning ? fmtTime(morning.createdAt) + ' 完了' : esc(t.morning) + ' · 3分') +
      step('checkin', '', checkins.length ? checkins.length + '回 記録' : '何回でも · 1分') +
      step('shutdown', shutdown ? 'done' : '', shutdown ? fmtTime(shutdown.createdAt) + ' 完了' : esc(t.shutdown) + ' · 5分') +
      '</div>' +
      '<div class="wf-more">' +
      ['reset', 'weekly', 'expressive'].map((id) => '<button class="pill-btn' + (rec === id ? ' rec' : '') + '" data-flow="' + id + '">' + FLOWS[id].icon + ' ' + esc(FLOWS[id].short === '書き出し' ? '書き出し 15分' : FLOWS[id].name) + '</button>').join('') +
      '<button class="pill-btn" id="homeNew">✍️ 自由に書く</button></div>' +
      '</section>' +

      '<section class="tiles">' +
      tile('🔥', st.current + '<small>日</small>', '連続記録', st.wroteToday ? '今日も記録できました' : (st.current ? '今日記録すると ' + (st.current + 1) + ' 日に' : '今日から始めよう')) +
      tile('🏆', ws.weekWins + '<small>件</small>', '今週の前進', '小さな前進もカウント') +
      tile('🎯', ws.mitRate == null ? '—' : ws.mitRate + '<small>%</small>', '「1つ」の達成率', ws.mitN ? '直近30日・' + ws.mitN + '日分' : '始業前に設定しよう') +
      tile('⚡', lastEnergy ? lastEnergy.energy + '<small>/5</small>' : '—', '最新のエネルギー', lastEnergy ? relDays(lastEnergy.date) + ' ' + fmtTime(lastEnergy.createdAt) : 'チェックインで記録') +
      '</section>' +

      (recentWins.length ? '<section class="section"><div class="section-head"><h2>🏆 最近の前進</h2><span class="muted small">前進を見返すことが、次のやる気になります</span></div>' +
        '<div class="wins-wall">' + recentWins.map((w) => '<button class="win-chip" data-id="' + esc(w.id) + '"><small>' + Number(w.date.slice(5, 7)) + '/' + Number(w.date.slice(8)) + '</small>' + esc(w.text) + '</button>').join('') + '</div></section>' : '') +

      '<section class="section"><div class="section-head"><h2>今日の記録</h2></div>' +
      (todays.length ? '<div class="cards">' + todays.map((e) => entryCard(e)).join('') + '</div>'
        : '<div class="empty"><p>今日はまだ記録がありません。' + (rec ? '「' + esc(FLOWS[rec].name) + '」から始めましょう。' : '') + '</p>' +
          (rec ? '<button class="btn primary" data-flow="' + rec + '">' + FLOWS[rec].icon + ' ' + esc(FLOWS[rec].name) + '（' + FLOWS[rec].minutes + '分）</button>' : '') + '</div>') +
      '</section>' +

      '<section class="card prompt-card">' +
      '<div class="prompt-label">💡 自由記述のお題</div>' +
      '<p class="prompt-text">' + esc(prompt) + '</p>' +
      '<div class="row gap wrap"><button class="btn primary" id="usePrompt">このお題で書く</button><button class="btn ghost" id="shufflePrompt">🔀 別のお題</button>' +
      '<div class="dropdown"><button class="btn ghost" id="homeTplBtn">📋 テンプレート</button><div class="menu" id="homeTplMenu" hidden>' +
      TEMPLATES.map((x) => '<button data-tpl="' + x.id + '">' + x.icon + ' ' + esc(x.name) + '</button>').join('') + '</div></div></div>' +
      '</section>' +

      (onThisDay.length ? '<section class="section"><div class="section-head"><h2>🕰️ 振り返り</h2><span class="muted small">1週間前・1か月前・過去の今日</span></div>' +
        '<div class="cards">' + onThisDay.map((e) => '<div class="ago-label">' + relDays(e.date) + '</div>' + entryCard(e)).join('') + '</div></section>' : '') +

      (!all.length ? '<section class="card welcome"><h2>綴 Tsuzuri へようこそ 👋</h2>' +
        '<p>仕事の前・最中・後に、短い問いに答えていくだけのワークジャーナルです。</p>' +
        '<ul><li><b>☀️ 始業前（3分）</b>：今日いちばん大事な「1つ」と、つまずいた時の作戦を決める</li>' +
        '<li><b>⚡ チェックイン（1分）</b>：前進・つまずき・気づきと、そのときの状態を記録</li>' +
        '<li><b>🌙 終業後（5分）</b>：前進と学びを確かめ、やり残しを書き出して仕事を閉じる</li>' +
        '<li>データは<b>このブラウザの中だけ</b>に保存され、サーバーには送信されません。</li></ul>' +
        '<div class="row gap wrap"><button class="btn primary" data-flow="' + (rec || 'checkin') + '">はじめる</button><button class="btn" data-goto="guide">📖 なぜ効くの？</button></div></section>' : '') +
      '</div>';

    const main = $('#main');
    bindCards(main);
    $$('[data-flow]', main).forEach((b) => (b.onclick = () => startFlow(b.dataset.flow)));
    $$('[data-goto]', main).forEach((b) => (b.onclick = () => go(b.dataset.goto)));
    $$('.win-chip', main).forEach((b) => (b.onclick = () => openEntry(b.dataset.id)));
    $('#homeNew').onclick = () => writeNew();
    $('#usePrompt').onclick = () => writeNew(todayStr(), { body: '> ' + prompt + '\n\n' });
    $('#shufflePrompt').onclick = () => { state.promptIdx = (state.promptIdx + 1 + Math.floor(Math.random() * (PROMPTS.length - 1))) % PROMPTS.length; renderHome(); };
    const tm = $('#homeTplMenu');
    $('#homeTplBtn').onclick = (ev) => { ev.stopPropagation(); tm.hidden = !tm.hidden; };
    $$('[data-tpl]', tm).forEach((b) => (b.onclick = () => {
      const x = TEMPLATES.find((y) => y.id === b.dataset.tpl);
      writeNew(todayStr(), { body: x.body, tags: x.tags || [] });
    }));
    const mc = $('#mitCheck');
    if (mc) mc.onchange = async () => {
      await setMitDone(morning, mc.checked);
      if (mc.checked) toast('🎉 今日の「1つ」を達成！ これが一番のやる気の源です');
      renderHome();
    };
  }

  function tile(icon, value, label, sub) {
    return '<div class="tile"><div class="tile-label">' + icon + ' ' + label + '</div><div class="tile-value">' + value + '</div><div class="tile-sub">' + sub + '</div></div>';
  }

  /* ================= 一覧 ================= */
  function renderList() {
    const f = state.filter;
    const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = filteredEntries();
    let html = '<div class="view list">' +
      '<header class="view-head"><div><p class="eyebrow">' + (f.q ? '「' + esc(f.q) + '」の検索結果' : 'アーカイブ') + '</p><h1>すべての記録 <small class="muted">' + list.length + '件</small></h1></div></header>' +
      '<div class="filters">' +
      MOODS.map((m) => '<button class="chip' + (f.mood === m.v ? ' active' : '') + '" data-mood="' + m.v + '" title="' + m.l + '">' + m.e + '</button>').join('') +
      '<button class="chip' + (f.fav ? ' active' : '') + '" id="favFilter">★ お気に入り</button>' +
      '<span class="chip-sep"></span>' +
      ['morning', 'checkin', 'shutdown', 'reset', 'weekly', 'expressive', 'free'].map((k) => '<button class="chip' + (f.kind === k ? ' active' : '') + '" data-kind="' + k + '">' + (k === 'free' ? '✍️ 自由記述' : KIND_LABEL(k)) + '</button>').join('') +
      (f.tag ? '<button class="chip active" id="clearTag">#' + esc(f.tag) + ' ✕</button>' : '') +
      (f.q || f.tag || f.mood || f.fav || f.kind ? '<button class="chip ghost" id="clearAll">条件をクリア</button>' : '') +
      '</div>';

    if (!list.length) {
      html += '<div class="empty big"><p>' + (state.entries.size ? '条件に一致する記録はありません。' : 'まだ記録がありません。最初の1ページを書いてみましょう。') + '</p>' +
        (state.entries.size ? '' : '<button class="btn primary" id="emptyNew">＋ 書き始める</button>') + '</div>';
    } else {
      let month = '';
      html += '<div class="cards">';
      for (const e of list) {
        const m = e.date.slice(0, 7);
        if (m !== month) {
          month = m;
          html += '<h2 class="month-head">' + Number(m.slice(0, 4)) + '年' + Number(m.slice(5)) + '月</h2>';
        }
        html += entryCard(e, terms);
      }
      html += '</div>';
    }
    html += '</div>';
    const main = $('#main');
    main.innerHTML = html;
    bindCards(main);
    $$('[data-mood]', main).forEach((b) => (b.onclick = () => { const v = +b.dataset.mood; f.mood = f.mood === v ? null : v; renderList(); }));
    $('#favFilter').onclick = () => { f.fav = !f.fav; renderList(); };
    $$('[data-kind]', main).forEach((b) => (b.onclick = () => { f.kind = f.kind === b.dataset.kind ? null : b.dataset.kind; renderList(); }));
    const ct = $('#clearTag'); if (ct) ct.onclick = () => { f.tag = null; renderList(); renderSidebar(); };
    const ca = $('#clearAll'); if (ca) ca.onclick = () => { Object.assign(f, { q: '', tag: null, mood: null, fav: false, kind: null }); $('#searchInput').value = ''; renderList(); renderSidebar(); };
    const en = $('#emptyNew'); if (en) en.onclick = () => writeNew();
  }

  /* ================= カレンダー ================= */
  function renderCalendar() {
    const m = state.calMonth;
    const y = m.getFullYear();
    const mo = m.getMonth();
    const ws = state.settings.weekStart;
    const offset = (new Date(y, mo, 1).getDay() - ws + 7) % 7;
    const dim = new Date(y, mo + 1, 0).getDate();
    const map = byDate();
    const today = todayStr();
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<div class="cal-cell blank"></div>';
    let monthEntries = 0;
    let moodSum = 0;
    let moodN = 0;
    for (let d = 1; d <= dim; d++) {
      const ds = y + '-' + pad(mo + 1) + '-' + pad(d);
      const es = map.get(ds) || [];
      monthEntries += es.length;
      const moods = es.map((e) => e.mood).filter(Boolean);
      const avg = moods.length ? Math.round(moods.reduce((a, b) => a + b, 0) / moods.length) : 0;
      moodSum += moods.reduce((a, b) => a + b, 0); moodN += moods.length;
      const cls = ['cal-cell'];
      if (es.length) cls.push('has');
      if (avg) cls.push('mood-bg-' + avg);
      if (ds === today) cls.push('today');
      if (ds === state.calSelected) cls.push('selected');
      cells += '<button class="' + cls.join(' ') + '" data-date="' + ds + '">' +
        '<span class="cal-num">' + d + '</span>' +
        (avg ? '<span class="cal-mood">' + moodOf(avg).e + '</span>' : (es.length ? '<span class="cal-dot"></span>' : '')) +
        (es.length > 1 ? '<span class="cal-count">' + es.length + '</span>' : '') +
        '</button>';
    }
    const heads = Array.from({ length: 7 }, (_, i) => WEEK[(i + ws) % 7]);
    const sel = state.calSelected;
    const selEntries = (map.get(sel) || []).sort((a, b) => a.createdAt - b.createdAt);

    $('#main').innerHTML =
      '<div class="view calendar">' +
      '<header class="view-head"><div><p class="eyebrow">カレンダー</p><h1>' + y + '年' + (mo + 1) + '月</h1></div>' +
      '<div class="row gap"><button class="btn icon" id="calPrev" aria-label="前の月">‹</button><button class="btn" id="calToday">今月</button><button class="btn icon" id="calNext" aria-label="次の月">›</button></div></header>' +
      '<p class="muted small">この月の記録: ' + monthEntries + '件' + (moodN ? ' · 平均の気分 ' + moodOf(Math.round(moodSum / moodN)).e + ' ' + (moodSum / moodN).toFixed(1) : '') + '</p>' +
      '<div class="cal-grid">' + heads.map((h) => '<div class="cal-head">' + h + '</div>').join('') + cells + '</div>' +
      '<section class="section"><div class="section-head"><h2>' + fmtDate(sel) + '</h2><button class="btn small primary" id="calWrite">＋ この日に書く</button></div>' +
      (selEntries.length ? '<div class="cards">' + selEntries.map((e) => entryCard(e)).join('') + '</div>' : '<p class="muted">この日の記録はありません。</p>') +
      '</section></div>';

    const main = $('#main');
    $('#calPrev').onclick = () => { state.calMonth = new Date(y, mo - 1, 1); renderCalendar(); };
    $('#calNext').onclick = () => { state.calMonth = new Date(y, mo + 1, 1); renderCalendar(); };
    $('#calToday').onclick = () => { state.calMonth = firstOfMonth(new Date()); state.calSelected = todayStr(); renderCalendar(); };
    $$('.cal-cell[data-date]', main).forEach((c) => {
      c.onclick = () => { state.calSelected = c.dataset.date; renderCalendar(); };
      c.ondblclick = () => {
        const es = map.get(c.dataset.date) || [];
        if (es.length) openEntry(es[0].id); else writeNew(c.dataset.date);
      };
    });
    $('#calWrite').onclick = () => writeNew(sel);
    bindCards(main);
  }

  /* ================= インサイト ================= */
  function renderStats() {
    const all = sorted();
    const st = computeStreaks();
    const map = byDate();
    const today = todayStr();
    const goal = state.settings.dailyGoal || 400;
    const totalChars = all.reduce((s, e) => s + chars(e.body), 0);
    const moods = all.filter((e) => e.mood);
    const avgMood = moods.length ? moods.reduce((s, e) => s + e.mood, 0) / moods.length : 0;

    // ヒートマップ（直近53週）
    const end = parseDate(today);
    const start = new Date(end);
    start.setDate(start.getDate() - 7 * 52 - end.getDay());
    let heat = '';
    let monthsRow = '';
    let lastMonth = -1;
    let col = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = toStr(d);
      if (d.getDay() === 0) {
        col++;
        if (d.getMonth() !== lastMonth) {
          monthsRow += '<span style="grid-column:' + col + '">' + (d.getMonth() + 1) + '月</span>';
          lastMonth = d.getMonth();
        }
      }
      const es = map.get(ds) || [];
      const c = es.reduce((s, e) => s + chars(e.body), 0);
      const lv = !es.length ? 0 : c < goal * 0.25 ? 1 : c < goal * 0.6 ? 2 : c < goal ? 3 : 4;
      heat += '<i class="hm l' + lv + '" style="grid-column:' + col + ';grid-row:' + (d.getDay() + 1) + '" title="' + ds + ' · ' + es.length + '件 / ' + c + '字"></i>';
    }

    // 気分の推移（直近30日）
    const days = 30;
    const pts = [];
    for (let i = days - 1; i >= 0; i--) {
      const ds = addDays(today, -i);
      const ms = (map.get(ds) || []).map((e) => e.mood).filter(Boolean);
      pts.push({ ds, v: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null });
    }
    const W = 600, H = 180, P = 28;
    const x = (i) => P + (i * (W - P * 2)) / (days - 1);
    const yv = (v) => H - P - ((v - 1) * (H - P * 2)) / 4;
    let path = '';
    let pen = false;
    pts.forEach((p, i) => {
      if (p.v == null) { pen = false; return; }
      path += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yv(p.v).toFixed(1) + ' ';
      pen = true;
    });
    const dots = pts.map((p, i) => (p.v == null ? '' : '<circle cx="' + x(i).toFixed(1) + '" cy="' + yv(p.v).toFixed(1) + '" r="4" class="mood-dot mood-fill-' + Math.round(p.v) + '"><title>' + p.ds + ' ' + p.v.toFixed(1) + '</title></circle>')).join('');
    const grid = [1, 2, 3, 4, 5].map((v) => '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + yv(v) + '" y2="' + yv(v) + '" class="grid-line"/><text x="4" y="' + (yv(v) + 5) + '" class="axis-emoji">' + moodOf(v).e + '</text>').join('');
    const xlabels = [0, 7, 14, 21, 29].map((i) => '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle" class="axis-label">' + Number(pts[i].ds.slice(5, 7)) + '/' + Number(pts[i].ds.slice(8)) + '</text>').join('');
    const moodChart = moods.length
      ? '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="直近30日の気分の推移">' + grid + xlabels + '<path d="' + path + '" class="mood-line"/>' + dots + '</svg>'
      : '<p class="muted">気分を記録すると、ここに推移が表示されます。</p>';

    // 気分分布
    const moodCounts = MOODS.map((m) => ({ m, n: moods.filter((e) => e.mood === m.v).length }));
    const moodMax = Math.max(1, ...moodCounts.map((x) => x.n));
    const moodBars = moodCounts.map(({ m, n }) =>
      '<div class="hbar"><span class="hbar-label">' + m.e + ' ' + m.l + '</span><span class="hbar-track"><span class="hbar-fill mood-fill-bg-' + m.v + '" style="width:' + (n / moodMax) * 100 + '%"></span></span><span class="hbar-val">' + n + '</span></div>').join('');

    // 曜日別・時間帯別
    const wd = Array(7).fill(0);
    const hours = Array(24).fill(0);
    const wdMood = Array.from({ length: 7 }, () => []);
    for (const e of all) {
      const d = parseDate(e.date).getDay();
      wd[d]++;
      if (e.mood) wdMood[d].push(e.mood);
      hours[new Date(e.createdAt).getHours()]++;
    }
    const wdMax = Math.max(1, ...wd);
    const wdBars = wd.map((n, i) => {
      const ms = wdMood[i];
      const avg = ms.length ? (ms.reduce((a, b) => a + b, 0) / ms.length) : null;
      return '<div class="vbar" title="' + WEEK[i] + '曜日 ' + n + '件' + (avg ? ' / 平均気分 ' + avg.toFixed(1) : '') + '"><span class="vbar-fill" style="height:' + (n / wdMax) * 100 + '%"></span><span class="vbar-label">' + WEEK[i] + '</span><span class="vbar-mood">' + (avg ? moodOf(Math.round(avg)).e : '') + '</span></div>';
    }).join('');
    const hMax = Math.max(1, ...hours);
    const hourBars = hours.map((n, i) => '<div class="vbar thin" title="' + i + '時台 ' + n + '件"><span class="vbar-fill" style="height:' + (n / hMax) * 100 + '%"></span><span class="vbar-label">' + (i % 6 === 0 ? i : '') + '</span></div>').join('');

    // タグ × 気分
    const tagStats = allTags().slice(0, 15).map(([t, n]) => {
      const ms = all.filter((e) => e.tags.includes(t) && e.mood).map((e) => e.mood);
      return { t, n, avg: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null };
    });
    const tagMax = Math.max(1, ...tagStats.map((x) => x.n));
    const tagBars = tagStats.length ? tagStats.map(({ t, n, avg }) =>
      '<div class="hbar"><span class="hbar-label">#' + esc(t) + '</span><span class="hbar-track"><span class="hbar-fill" style="width:' + (n / tagMax) * 100 + '%"></span></span><span class="hbar-val">' + n + (avg ? ' ' + moodOf(Math.round(avg)).e : '') + '</span></div>').join('')
      : '<p class="muted">タグを付けると、ここに集計されます。</p>';

    // よく使う言葉（2文字以上のカタカナ・漢字・英単語）
    const freq = new Map();
    const stop = new Set(['こと', 'もの', 'ため', 'よう', 'それ', 'これ', 'the', 'and', 'for', 'that', 'with', 'this']);
    for (const e of all) {
      const words = (e.title + ' ' + MD.plain(e.body)).match(/[一-龯々]{2,}|[ァ-ヴー]{2,}|[A-Za-z]{3,}/g) || [];
      for (const w of words) { const k = w.toLowerCase(); if (!stop.has(k)) freq.set(k, (freq.get(k) || 0) + 1); }
    }
    const topWords = Array.from(freq.entries()).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 30);
    const wMax = topWords.length ? topWords[0][1] : 1;
    const cloud = topWords.length
      ? topWords.map(([w, n]) => '<button class="word" data-word="' + esc(w) + '" style="font-size:' + (0.85 + (n / wMax) * 1.1).toFixed(2) + 'rem">' + esc(w) + '</button>').join('')
      : '<p class="muted">記録が増えると、よく使う言葉が表示されます。</p>';

    // ワーク指標
    const wsx = workStats();
    const from30 = addDays(today, -29);
    const recent30 = all.filter((e) => e.date >= from30);
    const hourE = Array.from({ length: 24 }, () => []);
    for (const e of recent30) if (e.energy) hourE[new Date(e.createdAt).getHours()].push(e.energy);
    const hours2 = []; for (let h = 6; h <= 23; h++) hours2.push(h);
    const hasHourE = hourE.some((x) => x.length);
    const energyHours = hasHourE
      ? '<div class="vbars hours energy-hours">' + hours2.map((h) => { const a = avg(hourE[h]); return '<div class="vbar thin" title="' + h + '時台 ' + (a ? '平均 ' + a.toFixed(1) + '（' + hourE[h].length + '件）' : '記録なし') + '"><span class="vbar-fill energy-fill" style="height:' + (a ? a * 20 : 0) + '%"></span><span class="vbar-label">' + (h % 3 === 0 ? h : '') + '</span></div>'; }).join('') + '</div>'
      : '<p class="muted">チェックインでエネルギーを記録すると、1日のどの時間帯に調子が良いかが分かります。</p>';
    const emoCount = new Map();
    for (const e of recent30) for (const w of e.emotions) emoCount.set(w, (emoCount.get(w) || 0) + 1);
    const emoTop = Array.from(emoCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 14);
    const emoHtml = emoTop.length
      ? '<div class="emo-stats">' + emoTop.map(([w, n]) => '<span class="emo-chip on emo-' + emoGroup(w) + '">' + esc(w) + ' <b>' + n + '</b></span>').join('') + '</div>' +
        '<p class="muted small">快・不快の比率：' + (() => { let p = 0, q = 0; emoTop.forEach(([w, n]) => { const g = emoGroup(w); if (g === 'hp' || g === 'lp') p += n; else if (g === 'hn' || g === 'ln') q += n; }); return p + q ? Math.round((p / (p + q)) * 100) + '% が快の感情' : '—'; })() + '</p>'
      : '<p class="muted">感情を記録すると、ここに傾向が表示されます。</p>';
    const workHtml =
      '<h2 class="month-head">💼 ワーク（直近30日）</h2>' +
      '<section class="tiles">' +
      tile('🏆', wsx.weekWins + '<small>件</small>', '今週の前進', '月曜から今日まで') +
      tile('🎯', wsx.mitRate == null ? '—' : wsx.mitRate + '<small>%</small>', '「1つ」の達成率', wsx.mitN + '日分の始業前から') +
      tile('⚡', wsx.avgEnergy ? wsx.avgEnergy.toFixed(1) + '<small>/5</small>' : '—', '平均エネルギー', '記録のあった全エントリー') +
      tile('🌙', wsx.shutdownDays + '<small>日</small>', '終業シャットダウン', '始業前 ' + wsx.morningDays + ' 日') +
      '</section>' +
      '<div class="grid-2">' +
      '<section class="card"><h2>⚡ 時間帯別のエネルギー</h2>' + energyHours + '</section>' +
      '<section class="card"><h2>🎭 よく感じた感情</h2>' + emoHtml + '</section>' +
      '</div>' +
      '<h2 class="month-head">📚 記録全体</h2>';

    $('#main').innerHTML =
      '<div class="view stats">' +
      '<header class="view-head"><div><p class="eyebrow">インサイト</p><h1>あなたの記録の傾向</h1></div></header>' +
      workHtml +
      '<section class="tiles">' +
      tile('📚', all.length + '<small>件</small>', '総エントリー', st.days + ' 日分') +
      tile('🔥', st.current + '<small>日</small>', '現在の連続記録', '最長 ' + st.longest + ' 日') +
      tile('✍️', totalChars.toLocaleString() + '<small>字</small>', '総文字数', '平均 ' + (all.length ? Math.round(totalChars / all.length) : 0) + ' 字/件') +
      tile('🌤️', avgMood ? moodOf(Math.round(avgMood)).e + ' <small>' + avgMood.toFixed(1) + '</small>' : '—', '平均の気分', moods.length + ' 件の記録から') +
      '</section>' +
      '<section class="card"><h2>📆 1年間の記録</h2><div class="heatmap-wrap"><div class="heatmap-months">' + monthsRow + '</div><div class="heatmap">' + heat + '</div></div>' +
      '<div class="heat-legend">少ない <i class="hm l0"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i> 多い（目標 ' + goal + ' 字基準）</div></section>' +
      '<section class="card"><h2>🌈 直近30日の気分</h2>' + moodChart + '</section>' +
      '<div class="grid-2">' +
      '<section class="card"><h2>気分の分布</h2>' + moodBars + '</section>' +
      '<section class="card"><h2>曜日別の記録</h2><div class="vbars">' + wdBars + '</div></section>' +
      '<section class="card"><h2>書く時間帯</h2><div class="vbars hours">' + hourBars + '</div></section>' +
      '<section class="card"><h2>タグと気分</h2>' + tagBars + '</section>' +
      '</div>' +
      '<section class="card"><h2>💬 よく使う言葉</h2><div class="cloud">' + cloud + '</div></section>' +
      '</div>';

    $$('.word', $('#main')).forEach((b) => (b.onclick = () => {
      state.filter.q = b.dataset.word;
      $('#searchInput').value = b.dataset.word;
      go('list');
    }));
  }

  /* ================= 設定 ================= */
  function renderSettings() {
    const s = state.settings;
    const encrypted = !!state.key;
    const opt = (val, cur, label) => '<option value="' + val + '"' + (String(val) === String(cur) ? ' selected' : '') + '>' + label + '</option>';

    $('#main').innerHTML =
      '<div class="view settings">' +
      '<header class="view-head"><div><p class="eyebrow">設定</p><h1>設定とデータ</h1></div></header>' +

      '<section class="card"><h2>🎨 表示</h2>' +
      '<div class="form-row"><label>テーマ</label><select class="input" id="sTheme">' + opt('system', s.theme, 'システムに合わせる') + opt('light', s.theme, 'ライト') + opt('dark', s.theme, 'ダーク') + opt('sepia', s.theme, 'セピア') + '</select></div>' +
      '<div class="form-row"><label>本文フォント</label><select class="input" id="sFont">' + opt('sans', s.font, 'ゴシック') + opt('serif', s.font, '明朝') + opt('mono', s.font, '等幅') + '</select></div>' +
      '<div class="form-row"><label>文字サイズ <output id="sizeOut">' + s.fontSize + 'px</output></label><input type="range" min="14" max="24" id="sSize" value="' + s.fontSize + '"></div>' +
      '<div class="form-row"><label>週の始まり</label><select class="input" id="sWeek">' + opt(0, s.weekStart, '日曜日') + opt(1, s.weekStart, '月曜日') + '</select></div>' +
      '<div class="form-row"><label>1日の目標文字数</label><input class="input" type="number" min="0" step="50" id="sGoal" value="' + s.dailyGoal + '"></div>' +
      '<div class="form-row"><label>スペルチェック</label><input type="checkbox" id="sSpell"' + (s.spellcheck ? ' checked' : '') + '></div>' +
      '</section>' +

      '<section class="card"><h2>💼 働き方とリマインダー</h2>' +
      '<div class="form-row"><label>始業時刻</label><input class="input" type="time" id="sWorkStart" value="' + esc(s.workStart) + '"></div>' +
      '<div class="form-row"><label>終業時刻</label><input class="input" type="time" id="sWorkEnd" value="' + esc(s.workEnd) + '"></div>' +
      '<div class="form-row"><label>勤務日</label><div class="wd-pick">' + [1, 2, 3, 4, 5, 6, 0].map((d) => '<label class="wd"><input type="checkbox" data-wd="' + d + '"' + (s.workdays.includes(d) ? ' checked' : '') + '><span>' + WEEK[d] + '</span></label>').join('') + '</div></div>' +
      '<p class="muted small">時刻にあわせて、ホームに「いまおすすめ」のセッションが表示されます。</p>' +
      '<div class="reminder-box"><b>📅 カレンダーにリマインダーを登録（おすすめ）</b>' +
      '<p class="muted small">始業前・終業時・金曜の週次レビューの予定（通知つき・毎週繰り返し）を .ics ファイルで書き出します。iPhone / Android / Google カレンダー / Outlook で開くと登録でき、予定のリンクからそのセッションを直接開けます。</p>' +
      '<button class="btn" id="exportIcs">📅 カレンダー用ファイルを書き出し</button></div>' +
      '<div class="reminder-box"><b>🔔 ブラウザ通知</b>' +
      '<p class="muted small">このアプリをタブやホーム画面アプリで開いている間、始業時刻と終業15分前に通知します。</p>' +
      '<label class="row gap"><input type="checkbox" id="sNotify"' + (s.notify ? ' checked' : '') + '> 通知を使う</label></div>' +
      '</section>' +

      '<section class="card"><h2>🔒 プライバシーと暗号化</h2>' +
      (JCrypto.available()
        ? (encrypted
          ? '<p>✅ 記録はパスフレーズで <b>AES-GCM 256bit</b> 暗号化されています。鍵はメモリ上にのみ保持されます。</p>' +
            '<div class="form-row"><label>自動ロック</label><select class="input" id="sAutoLock">' + opt(0, s.autoLockMin, 'しない') + opt(5, s.autoLockMin, '5分操作なし') + opt(15, s.autoLockMin, '15分操作なし') + opt(60, s.autoLockMin, '60分操作なし') + '</select></div>' +
            '<div class="row gap wrap"><button class="btn" id="lockNow">🔒 今すぐロック</button><button class="btn" id="changePass">パスフレーズを変更</button><button class="btn danger-ghost" id="disableEnc">暗号化を解除</button></div>'
          : '<p>パスフレーズを設定すると、すべての記録を端末内で暗号化します。<b>パスフレーズを忘れると復元できません。</b></p>' +
            '<div class="form-row"><label>パスフレーズ</label><input class="input" type="password" id="encPass1" autocomplete="new-password" placeholder="8文字以上推奨"></div>' +
            '<div class="form-row"><label>確認</label><input class="input" type="password" id="encPass2" autocomplete="new-password"></div>' +
            '<button class="btn primary" id="enableEnc">暗号化を有効にする</button>')
        : '<p class="muted">このブラウザ環境では Web Crypto が利用できないため暗号化は使えません（HTTPS または localhost で開いてください）。</p>') +
      '</section>' +

      '<section class="card"><h2>💾 バックアップ</h2>' +
      '<p class="muted small">データはこのブラウザ内（IndexedDB）にのみ保存されています。定期的なバックアップをおすすめします。</p>' +
      '<div class="row gap wrap">' +
      '<button class="btn" id="exportJson">JSON で書き出し</button>' +
      '<button class="btn" id="exportMd">Markdown で書き出し</button>' +
      (encrypted ? '<button class="btn" id="exportEnc">暗号化バックアップ</button>' : '') +
      '<label class="btn">読み込み…<input type="file" id="importFile" accept=".json,application/json" hidden></label>' +
      '</div></section>' +

      '<section class="card"><h2>⌨️ キーボードショートカット</h2><table class="shortcuts">' +
      [['Ctrl/⌘ + J', 'クイックチェックイン'], ['Ctrl/⌘ + Shift + N', '記録の種類を選ぶ'], ['Ctrl/⌘ + N', '自由に書く'], ['Ctrl/⌘ + K', '検索'], ['Ctrl/⌘ + S', '今すぐ保存'], ['Ctrl/⌘ + E', 'プレビュー切替'], ['Ctrl/⌘ + B / I', '太字 / 斜体'],
        ['Ctrl/⌘ + Shift + F', '集中モード'], ['Ctrl/⌘ + Shift + L', 'ロック（暗号化時）'], ['Esc', '集中モード終了 / 閉じる']]
        .map(([k, v]) => '<tr><td><kbd>' + k + '</kbd></td><td>' + v + '</td></tr>').join('') +
      '</table></section>' +

      '<section class="card danger-zone"><h2>⚠️ 危険な操作</h2>' +
      '<p class="muted small">すべての記録を削除します。元に戻せません。</p>' +
      '<button class="btn danger" id="wipeAll">すべての記録を削除</button></section>' +
      '<p class="muted small center">綴 Tsuzuri · データは外部に送信されません</p>' +
      '</div>';

    const set = (k, v) => { s[k] = v; saveSettings(); };
    $('#sTheme').onchange = (e) => set('theme', e.target.value);
    $('#sFont').onchange = (e) => set('font', e.target.value);
    $('#sSize').oninput = (e) => { $('#sizeOut').textContent = e.target.value + 'px'; set('fontSize', +e.target.value); };
    $('#sWeek').onchange = (e) => set('weekStart', +e.target.value);
    $('#sGoal').onchange = (e) => set('dailyGoal', Math.max(0, +e.target.value || 0));
    $('#sSpell').onchange = (e) => set('spellcheck', e.target.checked);
    $('#sWorkStart').onchange = (e) => { if (e.target.value) set('workStart', e.target.value); };
    $('#sWorkEnd').onchange = (e) => { if (e.target.value) set('workEnd', e.target.value); };
    $$('[data-wd]').forEach((c) => (c.onchange = () => set('workdays', $$('[data-wd]').filter((x) => x.checked).map((x) => +x.dataset.wd))));
    $('#exportIcs').onclick = () => { download('tsuzuri-reminders.ics', buildIcs(), 'text/calendar'); toast('カレンダーアプリで開いて登録してください'); };
    $('#sNotify').onchange = async (e) => {
      if (e.target.checked) {
        if (!('Notification' in window)) { e.target.checked = false; return toast('このブラウザは通知に対応していません'); }
        const p = await Notification.requestPermission();
        if (p !== 'granted') { e.target.checked = false; return toast('通知が許可されませんでした'); }
        toast('🔔 通知をオンにしました');
      }
      set('notify', e.target.checked);
    };
    const al = $('#sAutoLock'); if (al) al.onchange = (e) => set('autoLockMin', +e.target.value);

    const en = $('#enableEnc');
    if (en) en.onclick = async () => {
      const p1 = $('#encPass1').value;
      const p2 = $('#encPass2').value;
      if (!p1) return toast('パスフレーズを入力してください');
      if (p1 !== p2) return toast('確認用のパスフレーズが一致しません');
      if (p1.length < 8 && !(await ask({ title: '短いパスフレーズ', message: '8文字未満のパスフレーズは推測されやすくなります。このまま設定しますか？', ok: '設定する' }))) return;
      en.disabled = true; en.textContent = '暗号化しています…';
      try { await setEncryption(p1); toast('🔒 暗号化を有効にしました'); } catch (err) { console.error(err); toast('暗号化に失敗しました'); }
      renderSettings(); renderSidebar();
    };
    const ln = $('#lockNow'); if (ln) ln.onclick = () => lock();
    const cp = $('#changePass');
    if (cp) cp.onclick = async () => {
      const cur = await ask({ title: '現在のパスフレーズ', input: { type: 'password' }, ok: '次へ' });
      if (cur == null) return;
      if (!(await verifyPass(cur))) return toast('パスフレーズが違います');
      const p1 = await ask({ title: '新しいパスフレーズ', input: { type: 'password' }, ok: '次へ' });
      if (!p1) return;
      const p2 = await ask({ title: '新しいパスフレーズ（確認）', input: { type: 'password' }, ok: '変更する' });
      if (p1 !== p2) return toast('確認用のパスフレーズが一致しません');
      await setEncryption(p1);
      toast('パスフレーズを変更しました');
    };
    const de = $('#disableEnc');
    if (de) de.onclick = async () => {
      const cur = await ask({ title: '暗号化を解除', message: '記録は暗号化されていない状態で保存されます。現在のパスフレーズを入力してください。', input: { type: 'password' }, ok: '解除する', danger: true });
      if (cur == null) return;
      if (!(await verifyPass(cur))) return toast('パスフレーズが違います');
      await setEncryption(null);
      toast('暗号化を解除しました');
      renderSettings(); renderSidebar();
    };

    $('#exportJson').onclick = async () => {
      if (state.key && !(await ask({ title: '平文で書き出します', message: 'JSON ファイルは暗号化されていません。保存場所に注意してください。', ok: '書き出す' }))) return;
      const data = { app: 'tsuzuri', version: 1, exportedAt: new Date().toISOString(), entries: sorted().map(serialize) };
      download('tsuzuri-' + todayStr() + '.json', JSON.stringify(data, null, 2), 'application/json');
    };
    $('#exportMd').onclick = () => download('tsuzuri-' + todayStr() + '.md', toMarkdown(), 'text/markdown');
    const ee = $('#exportEnc');
    if (ee) ee.onclick = async () => {
      const recs = await DB.getAll();
      const data = { app: 'tsuzuri', version: 1, encrypted: true, exportedAt: new Date().toISOString(), crypto: state.cryptoMeta, records: recs };
      download('tsuzuri-encrypted-' + todayStr() + '.json', JSON.stringify(data), 'application/json');
    };
    $('#importFile').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) await importFile(file);
    };
    $('#wipeAll').onclick = async () => {
      const v = await ask({ title: 'すべての記録を削除', message: state.entries.size + '件の記録を完全に削除します。確認のため「削除」と入力してください。', input: { placeholder: '削除' }, ok: '完全に削除', danger: true });
      if (v !== '削除') { if (v != null) toast('入力が一致しないため中止しました'); return; }
      await DB.bulk({ clear: true });
      state.entries.clear();
      toast('すべての記録を削除しました');
      renderSettings(); renderSidebar();
    };
  }

  function toMarkdown() {
    return sorted().reverse().map((e) => {
      const mood = moodOf(e.mood);
      const meta = [mood ? '気分: ' + mood.e + ' ' + mood.l : '', e.tags.length ? 'タグ: ' + e.tags.map((t) => '#' + t).join(' ') : '', e.favorite ? '★' : ''].filter(Boolean).join(' / ');
      return '# ' + fmtDate(e.date) + (e.title ? ' ' + e.title : '') + '\n\n' + (meta ? '_' + meta + '_\n\n' : '') + e.body.trim() + '\n';
    }).join('\n---\n\n');
  }

  async function importFile(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (err) { return toast('JSON を読み込めませんでした'); }
    let list = [];
    if (data && data.encrypted && Array.isArray(data.records) && data.crypto) {
      const pass = await ask({ title: '暗号化バックアップ', message: 'バックアップ作成時のパスフレーズを入力してください。', input: { type: 'password' }, ok: '復号して読み込む' });
      if (pass == null) return;
      try {
        const key = await JCrypto.deriveKey(pass, data.crypto.salt, data.crypto.iterations);
        await JCrypto.decrypt(key, data.crypto.verifier);
        for (const r of data.records) list.push(r.enc ? await JCrypto.decrypt(key, r.enc) : r);
      } catch (err) { return toast('パスフレーズが違うか、ファイルが壊れています'); }
    } else if (data && Array.isArray(data.entries)) {
      list = data.entries;
    } else if (Array.isArray(data)) {
      list = data;
    } else {
      return toast('対応していない形式です');
    }
    let added = 0;
    let updated = 0;
    const recs = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const e = normalize(raw);
      const cur = state.entries.get(e.id);
      if (cur && cur.updatedAt >= e.updatedAt) continue;
      cur ? updated++ : added++;
      state.entries.set(e.id, e);
      recs.push(await toRecord(e));
    }
    await DB.bulk({ put: recs });
    toast('読み込み完了：追加 ' + added + '件・更新 ' + updated + '件');
    renderSidebar();
  }

  /* ================= 暗号化 ================= */
  async function verifyPass(pass) {
    const m = state.cryptoMeta;
    if (!m) return false;
    try {
      const key = await JCrypto.deriveKey(pass, m.salt, m.iterations);
      await JCrypto.decrypt(key, m.verifier);
      return key;
    } catch (err) { return false; }
  }

  /** pass=null で暗号化を解除。全エントリーを1トランザクションで書き換える */
  async function setEncryption(pass) {
    let key = null;
    let meta = null;
    if (pass) {
      const salt = JCrypto.randomSalt();
      key = await JCrypto.deriveKey(pass, salt);
      meta = { v: 1, salt, iterations: JCrypto.ITERATIONS, verifier: await JCrypto.encrypt(key, { check: 'tsuzuri' }) };
    }
    const recs = [];
    for (const e of state.entries.values()) if (!isEmpty(e)) recs.push(await toRecord(e, key));
    await DB.bulk({ clear: true, put: recs, meta: { crypto: meta } });
    state.key = key;
    state.cryptoMeta = meta;
  }

  async function lock() {
    if (!state.cryptoMeta) return;
    await leaveEditor();
    stopFlowTimer();
    state.flow = null;
    state.key = null;
    state.entries.clear();
    state.currentId = null;
    $('#main').innerHTML = '';
    document.body.classList.remove('focus-mode');
    showLock();
  }

  function showLock() {
    const l = $('#lock');
    l.hidden = false;
    document.body.classList.add('locked');
    $('#lockError').hidden = true;
    $('#lockPass').value = '';
    setTimeout(() => $('#lockPass').focus(), 50);
  }

  async function onUnlock(ev) {
    ev.preventDefault();
    const btn = $('#lockSubmit');
    btn.disabled = true;
    btn.textContent = '確認中…';
    const key = await verifyPass($('#lockPass').value);
    btn.disabled = false;
    btn.textContent = 'ロック解除';
    if (!key) {
      $('#lockError').hidden = false;
      $('.lock-card').classList.remove('shake');
      void $('.lock-card').offsetWidth;
      $('.lock-card').classList.add('shake');
      $('#lockPass').select();
      return;
    }
    state.key = key;
    await loadAll();
    $('#lock').hidden = true;
    document.body.classList.remove('locked');
    state.lastActivity = Date.now();
    startApp();
  }

  /* ================= エディタ ================= */
  let saveTimer = null;

  function current() { return state.entries.get(state.currentId); }

  function setStatus(text, cls = '') {
    const el = $('#edStatus');
    if (el) { el.textContent = text; el.className = 'ed-status ' + cls; }
  }

  function scheduleSave() {
    setStatus('編集中…', 'dirty');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 600);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const e = current();
    if (!e) return;
    if (isEmpty(e)) { setStatus(''); return; }
    e.updatedAt = Date.now();
    try {
      await persist(e);
      setStatus('保存しました ✓', 'saved');
      renderSidebar();
    } catch (err) {
      console.error(err);
      setStatus('⚠️ 保存に失敗しました', 'error');
    }
  }

  function renderEditor() {
    const e = current();
    if (!e) return go('home');
    const s = state.settings;
    const mode = s.editorMode;
    const existingTags = allTags().map(([t]) => t);

    $('#main').innerHTML =
      '<div class="view editor">' +
      '<div class="ed-top">' +
      '<button class="btn ghost small" id="edBack">← 戻る</button>' +
      '<input type="date" class="input date-input" id="edDate" value="' + e.date + '" aria-label="日付">' +
      '<span class="ed-status" id="edStatus"></span>' +
      '<span class="spacer"></span>' +
      '<button class="icon-btn' + (e.favorite ? ' on' : '') + '" id="edFav" title="お気に入り">' + (e.favorite ? '★' : '☆') + '</button>' +
      '<button class="icon-btn" id="edFocus" title="集中モード (Ctrl+Shift+F)">⛶</button>' +
      '<button class="icon-btn" id="edMore" title="その他">⋯</button>' +
      '<div class="menu" id="edMenu" hidden>' +
      '<button data-act="duplicate">📄 複製</button>' +
      '<button data-act="copy">📋 Markdown をコピー</button>' +
      '<button data-act="export">⬇️ この記録を書き出し</button>' +
      '<button data-act="print">🖨️ 印刷</button>' +
      '<button data-act="delete" class="danger-text">🗑️ 削除</button>' +
      '</div>' +
      '</div>' +
      '<input class="title-input" id="edTitle" placeholder="タイトル（任意）" value="' + esc(e.title) + '" maxlength="200">' +
      (e.kind !== 'free' || e.energy || e.emotions.length ? '<div class="ed-kind">' + [e.kind !== 'free' ? '<span class="kind-badge kind-' + e.kind + '">' + FLOWS[e.kind].icon + ' ' + esc(FLOWS[e.kind].name) + '</span>' : '', e.energy ? '⚡ エネルギー ' + e.energy + '/5' : '', e.emotions.length ? esc(e.emotions.join('、')) : ''].filter(Boolean).join(' · ') + '</div>' : '') +
      '<div class="ed-meta">' +
      '<div class="mood-picker" role="radiogroup" aria-label="気分">' +
      MOODS.map((m) => '<button class="mood-btn mood-' + m.v + (e.mood === m.v ? ' on' : '') + '" data-mood="' + m.v + '" role="radio" aria-checked="' + (e.mood === m.v) + '" title="' + m.l + '">' + m.e + '</button>').join('') +
      '<span class="mood-label" id="moodLabel">' + (e.mood ? moodOf(e.mood).l : '今の気分は？') + '</span>' +
      '</div>' +
      '<div class="tag-editor" id="tagEditor"><span id="tagChips"></span><input id="tagInput" list="tagSuggest" placeholder="＋ タグ" aria-label="タグを追加"><datalist id="tagSuggest">' +
      existingTags.map((t) => '<option value="' + esc(t) + '">').join('') + '</datalist></div>' +
      '</div>' +
      '<div class="toolbar" id="toolbar">' +
      '<button data-fmt="bold" title="太字 (Ctrl+B)"><b>B</b></button>' +
      '<button data-fmt="italic" title="斜体 (Ctrl+I)"><i>I</i></button>' +
      '<button data-fmt="strike" title="取り消し線"><s>S</s></button>' +
      '<button data-fmt="mark" title="マーカー">🖍</button>' +
      '<span class="sep"></span>' +
      '<button data-fmt="h2" title="見出し">H</button>' +
      '<button data-fmt="ul" title="箇条書き">•</button>' +
      '<button data-fmt="ol" title="番号付きリスト">1.</button>' +
      '<button data-fmt="task" title="チェックリスト">☑</button>' +
      '<button data-fmt="quote" title="引用">❝</button>' +
      '<button data-fmt="code" title="コード">&lt;/&gt;</button>' +
      '<button data-fmt="link" title="リンク">🔗</button>' +
      '<button data-fmt="time" title="現在時刻を挿入">🕒</button>' +
      '<span class="sep"></span>' +
      '<div class="dropdown"><button id="tplBtn" title="テンプレート">📋 テンプレート</button><div class="menu" id="tplMenu" hidden>' +
      TEMPLATES.map((t) => '<button data-tpl="' + t.id + '">' + t.icon + ' ' + esc(t.name) + '</button>').join('') + '</div></div>' +
      '<button id="promptBtn" title="お題を挿入">💡 お題</button>' +
      '<span class="spacer"></span>' +
      '<div class="seg" id="modeSeg">' +
      ['write:書く', 'split:分割', 'preview:プレビュー'].map((x) => { const [k, l] = x.split(':'); return '<button data-mode="' + k + '"' + (mode === k ? ' class="on"' : '') + '>' + l + '</button>'; }).join('') +
      '</div>' +
      '</div>' +
      '<div class="ed-body mode-' + mode + '" id="edBody">' +
      '<textarea id="edText" class="ed-text" placeholder="ここに自由に書いてください…&#10;&#10;Markdown が使えます（# 見出し、- リスト、- [ ] チェック、**太字** など）" spellcheck="' + (s.spellcheck ? 'true' : 'false') + '"></textarea>' +
      '<div id="edPreview" class="ed-preview prose"></div>' +
      '</div>' +
      '<div class="ed-foot">' +
      '<span id="edCount"></span>' +
      '<span class="goal-bar" title="今日の目標"><span id="goalFill"></span></span>' +
      '<span class="muted" id="edTimes"></span>' +
      '</div>' +
      '</div>';

    const ta = $('#edText');
    ta.value = e.body;
    renderTags();
    updatePreview();
    updateCounts();
    if (!isEmpty(e)) setStatus('保存済み', 'saved');

    $('#edBack').onclick = () => go(state.prevView || 'home');
    $('#edDate').onchange = (ev) => { if (ev.target.value) { e.date = ev.target.value; scheduleSave(); } };
    $('#edTitle').oninput = (ev) => { e.title = ev.target.value; scheduleSave(); };
    $('#edTitle').onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); ta.focus(); } };
    $('#edFav').onclick = (ev) => {
      e.favorite = !e.favorite;
      ev.currentTarget.textContent = e.favorite ? '★' : '☆';
      ev.currentTarget.classList.toggle('on', e.favorite);
      scheduleSave();
    };
    $('#edFocus').onclick = toggleFocus;

    $$('.mood-btn').forEach((b) => (b.onclick = () => {
      const v = +b.dataset.mood;
      e.mood = e.mood === v ? null : v;
      $$('.mood-btn').forEach((x) => { const on = +x.dataset.mood === e.mood; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
      $('#moodLabel').textContent = e.mood ? moodOf(e.mood).l : '今の気分は？';
      scheduleSave();
    }));

    // タグ
    const ti = $('#tagInput');
    const addTag = (raw) => {
      const parts = raw.split(/[,、，\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean);
      let changed = false;
      for (const t of parts) if (!e.tags.includes(t)) { e.tags.push(t); changed = true; }
      ti.value = '';
      if (changed) { renderTags(); scheduleSave(); }
    };
    ti.onkeydown = (ev) => {
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); addTag(ti.value); }
      else if (ev.key === 'Backspace' && !ti.value && e.tags.length) { e.tags.pop(); renderTags(); scheduleSave(); }
    };
    ti.oninput = () => { if (/[,、，]$/.test(ti.value) || existingTags.includes(ti.value)) addTag(ti.value); };
    ti.onblur = () => { if (ti.value.trim()) addTag(ti.value); };
    $('#tagEditor').onclick = (ev) => { if (ev.target.id === 'tagEditor') ti.focus(); };

    // 本文
    ta.addEventListener('input', onBodyInput);
    ta.addEventListener('keydown', onEditorKey);
    ta.addEventListener('paste', onPaste);

    // ツールバー
    $$('[data-fmt]').forEach((b) => (b.onclick = () => format(b.dataset.fmt)));
    const tplMenu = $('#tplMenu');
    $('#tplBtn').onclick = (ev) => { ev.stopPropagation(); tplMenu.hidden = !tplMenu.hidden; $('#edMenu').hidden = true; };
    $$('[data-tpl]', tplMenu).forEach((b) => (b.onclick = () => {
      const t = TEMPLATES.find((x) => x.id === b.dataset.tpl);
      tplMenu.hidden = true;
      insertBlock(t.body);
      if (t.tags) { for (const tg of t.tags) if (!e.tags.includes(tg)) e.tags.push(tg); renderTags(); scheduleSave(); }
    }));
    $('#promptBtn').onclick = () => {
      const p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
      insertBlock('> ' + p + '\n\n');
    };
    $$('#modeSeg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

    // その他メニュー
    const menu = $('#edMenu');
    $('#edMore').onclick = (ev) => { ev.stopPropagation(); menu.hidden = !menu.hidden; tplMenu.hidden = true; };
    $$('button', menu).forEach((b) => (b.onclick = () => { menu.hidden = true; entryAction(b.dataset.act); }));

    // プレビュー内のチェックボックス
    $('#edPreview').addEventListener('click', (ev) => {
      const cb = ev.target.closest('input[type=checkbox][data-line]');
      if (!cb) return;
      const lines = ta.value.split('\n');
      const n = +cb.dataset.line;
      if (lines[n] == null) return;
      lines[n] = lines[n].replace(/\[( |x|X)\]/, (m, c) => (c === ' ' ? '[x]' : '[ ]'));
      ta.value = lines.join('\n');
      onBodyInput();
    });

    if (mode !== 'preview') {
      if (!e.body && !e.title) $('#edTitle').focus();
      else { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
  }

  function renderTags() {
    const e = current();
    $('#tagChips').innerHTML = e.tags.map((t, i) => '<span class="tag-pill">#' + esc(t) + '<button data-i="' + i + '" aria-label="' + esc(t) + ' を削除">×</button></span>').join('');
    $$('#tagChips button').forEach((b) => (b.onclick = () => { e.tags.splice(+b.dataset.i, 1); renderTags(); scheduleSave(); }));
  }

  function setMode(mode) {
    state.settings.editorMode = mode;
    saveSettings();
    $('#edBody').className = 'ed-body mode-' + mode;
    $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    updatePreview();
    if (mode !== 'preview') $('#edText').focus();
  }

  const updatePreviewDebounced = debounce(() => updatePreview(), 120);

  function updatePreview() {
    const p = $('#edPreview');
    if (!p) return;
    if (state.settings.editorMode === 'write') return;
    const body = $('#edText').value;
    p.innerHTML = body.trim() ? MD.render(body) : '<p class="muted">プレビューする内容がありません</p>';
  }

  function updateCounts() {
    const e = current();
    if (!e) return;
    const c = chars(e.body);
    const today = todayStr();
    const todayTotal = Array.from(state.entries.values()).filter((x) => x.date === today).reduce((s, x) => s + chars(x.body), 0);
    const goal = state.settings.dailyGoal;
    const mins = Math.max(1, Math.round(c / 500));
    $('#edCount').textContent = c.toLocaleString() + ' 字 · 約' + mins + '分で読めます';
    $('#goalFill').style.width = (goal ? Math.min(100, (todayTotal / goal) * 100) : 0) + '%';
    $('.goal-bar').title = '今日の目標 ' + todayTotal + ' / ' + goal + ' 字';
    $('.goal-bar').classList.toggle('done', goal > 0 && todayTotal >= goal);
    $('#edTimes').textContent = '作成 ' + fmtDateTime(e.createdAt) + (e.updatedAt - e.createdAt > 60000 ? ' · 更新 ' + fmtDateTime(e.updatedAt) : '');
  }

  function onBodyInput() {
    const e = current();
    if (!e) return;
    e.body = $('#edText').value;
    updatePreviewDebounced();
    updateCounts();
    scheduleSave();
  }

  /** undo 履歴を保てるように execCommand を優先 */
  function replaceRange(ta, start, end, text, selStart, selEnd) {
    ta.focus();
    ta.setSelectionRange(start, end);
    let ok = false;
    try { ok = text ? document.execCommand('insertText', false, text) : (start === end ? true : document.execCommand('delete')); } catch (err) { ok = false; }
    if (!ok) {
      ta.setRangeText(text, start, end, 'end');
      ta.dispatchEvent(new Event('input'));
    }
    if (selStart != null) ta.setSelectionRange(selStart, selEnd == null ? selStart : selEnd);
  }

  function wrap(before, after, placeholder) {
    const ta = $('#edText');
    const s = ta.selectionStart;
    const en = ta.selectionEnd;
    const sel = ta.value.slice(s, en) || placeholder;
    replaceRange(ta, s, en, before + sel + after, s + before.length, s + before.length + sel.length);
  }

  function prefixLines(prefixFn, testRe) {
    const ta = $('#edText');
    const v = ta.value;
    const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let en = v.indexOf('\n', ta.selectionEnd);
    if (en < 0) en = v.length;
    const lines = v.slice(s, en).split('\n');
    const allHave = lines.every((l) => testRe.test(l));
    const out = lines.map((l, i) => (allHave ? l.replace(testRe, '') : prefixFn(i) + l.replace(testRe, ''))).join('\n');
    replaceRange(ta, s, en, out, s + out.length);
  }

  function insertBlock(text) {
    const ta = $('#edText');
    if (state.settings.editorMode === 'preview') setMode('split');
    const v = ta.value;
    const pos = ta.selectionStart;
    const needNl = pos > 0 && v[pos - 1] !== '\n' ? '\n\n' : '';
    replaceRange(ta, pos, ta.selectionEnd, needNl + text);
  }

  function format(kind) {
    if (state.settings.editorMode === 'preview') setMode('split');
    switch (kind) {
      case 'bold': return wrap('**', '**', '太字');
      case 'italic': return wrap('*', '*', '斜体');
      case 'strike': return wrap('~~', '~~', '取り消し');
      case 'mark': return wrap('==', '==', '強調');
      case 'code': {
        const ta = $('#edText');
        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        return sel.includes('\n') ? wrap('```\n', '\n```', '') : wrap('`', '`', 'code');
      }
      case 'link': return wrap('[', '](https://)', 'リンク');
      case 'h2': return prefixLines(() => '## ', /^#{1,6}\s/);
      case 'ul': return prefixLines(() => '- ', /^\s*[-*+]\s(?!\[)/);
      case 'ol': return prefixLines((i) => (i + 1) + '. ', /^\s*\d+[.)]\s/);
      case 'task': return prefixLines(() => '- [ ] ', /^\s*[-*+]\s\[[ xX]\]\s/);
      case 'quote': return prefixLines(() => '> ', /^>\s?/);
      case 'time': {
        const ta = $('#edText');
        return replaceRange(ta, ta.selectionStart, ta.selectionEnd, '**' + fmtTime(Date.now()) + '** ');
      }
    }
  }

  function onEditorKey(ev) {
    const ta = ev.target;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && !ev.shiftKey && ev.key.toLowerCase() === 'b') { ev.preventDefault(); return format('bold'); }
    if (mod && !ev.shiftKey && ev.key.toLowerCase() === 'i') { ev.preventDefault(); return format('italic'); }
    if (ev.isComposing || ev.keyCode === 229) return;

    if (ev.key === 'Enter' && !ev.shiftKey && !mod && ta.selectionStart === ta.selectionEnd) {
      const v = ta.value;
      const pos = ta.selectionStart;
      const ls = v.lastIndexOf('\n', pos - 1) + 1;
      const line = v.slice(ls, pos);
      const m = line.match(/^(\s*)([-*+]|(\d+)([.)]))\s+(\[[ xX]\]\s+)?/);
      if (!m) return;
      ev.preventDefault();
      if (line.slice(m[0].length).trim() === '') {
        replaceRange(ta, ls, pos, '');
      } else {
        const marker = m[3] ? (parseInt(m[3], 10) + 1) + m[4] : m[2];
        replaceRange(ta, pos, pos, '\n' + m[1] + marker + ' ' + (m[5] ? '[ ] ' : ''));
      }
    } else if (ev.key === 'Tab') {
      const v = ta.value;
      const ls = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
      const le = v.indexOf('\n', ls);
      const line = v.slice(ls, le < 0 ? v.length : le);
      if (!/^\s*([-*+]|\d+[.)])\s/.test(line)) return;
      ev.preventDefault();
      const pos = ta.selectionStart;
      if (ev.shiftKey) {
        const n = line.match(/^ {1,2}/);
        if (n) replaceRange(ta, ls, ls + n[0].length, '', Math.max(ls, pos - n[0].length));
      } else {
        replaceRange(ta, ls, ls, '  ', pos + 2);
      }
    }
  }

  function onPaste(ev) {
    // URL を選択範囲に貼り付けたらリンク化
    const text = (ev.clipboardData || window.clipboardData).getData('text');
    const ta = ev.target;
    if (/^https?:\/\/\S+$/.test(text.trim()) && ta.selectionStart !== ta.selectionEnd) {
      ev.preventDefault();
      const s = ta.selectionStart;
      const sel = ta.value.slice(s, ta.selectionEnd);
      replaceRange(ta, s, ta.selectionEnd, '[' + sel + '](' + text.trim() + ')');
    }
  }

  function toggleFocus() {
    if (state.view !== 'editor') return;
    document.body.classList.toggle('focus-mode');
    if (document.body.classList.contains('focus-mode')) toast('集中モード（Esc で終了）', 1600);
    $('#edText').focus();
  }

  async function entryAction(act) {
    const e = current();
    if (!e) return;
    if (act === 'delete') {
      const ok = await ask({ title: 'この記録を削除しますか？', message: fmtDate(e.date) + (e.title ? '「' + e.title + '」' : '') + '\nこの操作は元に戻せません。', ok: '削除', danger: true });
      if (!ok) return;
      clearTimeout(saveTimer); saveTimer = null;
      state.entries.delete(e.id);
      await DB.remove(e.id);
      state.currentId = null;
      toast('削除しました');
      go(state.prevView || 'home');
    } else if (act === 'duplicate') {
      await saveNow();
      const copy = newEntry(todayStr(), { title: e.title ? e.title + '（コピー）' : '', body: e.body, tags: e.tags.slice(), mood: e.mood });
      await persist(copy);
      openEntry(copy.id);
      toast('複製しました');
    } else if (act === 'copy') {
      try { await navigator.clipboard.writeText((e.title ? '# ' + e.title + '\n\n' : '') + e.body); toast('コピーしました'); }
      catch (err) { toast('コピーできませんでした'); }
    } else if (act === 'export') {
      download(e.date + (e.title ? '-' + e.title.replace(/[\\/:*?"<>|]/g, '_') : '') + '.md', '# ' + fmtDate(e.date) + (e.title ? ' ' + e.title : '') + '\n\n' + e.body, 'text/markdown');
    } else if (act === 'print') {
      const prev = state.settings.editorMode;
      if (prev === 'write') { $('#edPreview').innerHTML = MD.render(e.body); }
      document.body.classList.add('printing');
      window.print();
      document.body.classList.remove('printing');
    }
  }

  /* ================= ワークジャーナル ================= */
  const QUICK_TYPES = [
    { v: 'win', e: '🏆', l: '前進' },
    { v: 'setback', e: '🧱', l: 'つまずき' },
    { v: 'insight', e: '💡', l: '気づき' },
    { v: 'note', e: '📝', l: 'メモ' },
  ];
  const MIT_STATUS = { done: '✅ 達成', partial: '🔸 一部', notyet: '⏳ 未達' };
  const KIND_LABEL = (k) => (FLOWS[k] ? FLOWS[k].icon + ' ' + FLOWS[k].short : '');

  function hm(str) { const [h, m] = String(str || '0:0').split(':').map(Number); return h * 60 + (m || 0); }
  function fromMin(n) { n = (n + 1440) % 1440; return pad(Math.floor(n / 60)) + ':' + pad(n % 60); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function weekStartStr(date = todayStr()) { const d = parseDate(date); return addDays(date, -((d.getDay() + 6) % 7)); }
  function ofKind(kind, from, to = from) { return sorted().filter((e) => e.kind === kind && e.date >= from && e.date <= to); }
  function emoGroup(word) { const g = EMOTIONS.find((x) => x.words.includes(word)); return g ? g.g : 'other'; }
  function energyOf(v) { return ENERGY.find((x) => x.v === v); }
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

  function mitText(e) { return e && e.data && typeof e.data.mit === 'string' ? e.data.mit : ''; }
  function mitRe(m) { return new RegExp('^- \\[([ xX])\\] (' + regexEscape(m) + ')\\s*$', 'm'); }
  function mitDone(e) {
    const m = mitText(e);
    if (!m) return null;
    const r = e.body.match(mitRe(m));
    return r ? r[1] !== ' ' : false;
  }
  async function setMitDone(e, done) {
    const m = mitText(e);
    if (!m) return;
    e.body = e.body.replace(mitRe(m), (all, c, t) => '- [' + (done ? 'x' : ' ') + '] ' + t);
    e.updatedAt = Date.now();
    await persist(e);
  }

  function winsBetween(from, to) {
    const out = [];
    for (const e of sorted()) {
      if (e.date < from || e.date > to || !e.data) continue;
      if (e.kind === 'shutdown' && Array.isArray(e.data.wins)) e.data.wins.forEach((w) => out.push({ text: w, date: e.date, id: e.id }));
      if (e.kind === 'checkin' && e.data.quick && e.data.quick.type === 'win' && e.data.quick.note) out.push({ text: e.data.quick.note, date: e.date, id: e.id });
    }
    return out;
  }

  function workStats(days = 30) {
    const today = todayStr();
    const from = addDays(today, -(days - 1));
    const mornings = ofKind('morning', from, today).filter((e) => mitText(e));
    const doneN = mornings.filter((e) => mitDone(e)).length;
    const energies = sorted().filter((e) => e.date >= from && e.energy).map((e) => e.energy);
    return {
      weekWins: winsBetween(weekStartStr(), today).length,
      mitRate: mornings.length ? Math.round((doneN / mornings.length) * 100) : null,
      mitN: mornings.length,
      avgEnergy: avg(energies),
      shutdownDays: new Set(ofKind('shutdown', from, today).map((e) => e.date)).size,
      morningDays: new Set(ofKind('morning', from, today).map((e) => e.date)).size,
    };
  }

  function isWorkday(d = new Date()) { return state.settings.workdays.includes(d.getDay()); }

  function recommendedFlow() {
    const s = state.settings;
    const n = nowMin();
    const today = todayStr();
    const weeklyDone = ofKind('weekly', weekStartStr(), today).length > 0;
    const shutdownDone = ofKind('shutdown', today).length > 0;
    if (!isWorkday()) return weeklyDone ? null : 'weekly';
    if (n >= hm(s.workEnd) - 45) {
      if (!shutdownDone) return 'shutdown';
      return new Date().getDay() === 5 && !weeklyDone ? 'weekly' : null;
    }
    if (!ofKind('morning', today).length && n < hm(s.workStart) + 150) return 'morning';
    return 'checkin';
  }

  /* ---------- フロー（ガイド付きセッション） ---------- */
  function startFlow(id) {
    const f = FLOWS[id];
    if (!f) return;
    if (f.once) {
      const ex = ofKind(id, todayStr())[0];
      if (ex) { toast('今日の' + f.short + 'は記録済みです'); return openEntry(ex.id); }
    }
    state.flow = { id, step: 0, answers: {}, startedAt: Date.now(), dirty: false };
    go('flow');
  }

  function stopFlowTimer() {
    if (state.flow && state.flow.timer) { clearInterval(state.flow.timer.int); state.flow.timer.int = null; }
  }

  function whyHtml(key) {
    const r = RESEARCH[key];
    if (!r) return '';
    return '<details class="why"><summary>🔬 なぜ効くの？</summary><b>' + esc(r.title) + '</b><p>' + esc(r.text) + '</p><cite>' + esc(r.ref) + '</cite></details>';
  }

  function stateWidget(v) {
    return '<div class="fw-block"><div class="fw-label">エネルギー</div><div class="energy-row">' +
      ENERGY.map((x) => '<button type="button" class="energy-btn' + (v.energy === x.v ? ' on' : '') + '" data-energy="' + x.v + '"><span class="eb-bar" style="--h:' + x.v * 20 + '%"></span><span class="eb-l">' + x.l + '</span></button>').join('') +
      '</div></div>' +
      '<div class="fw-block"><div class="fw-label">気分</div><div class="mood-row">' +
      MOODS.map((m) => '<button type="button" class="mood-btn mood-' + m.v + (v.mood === m.v ? ' on' : '') + '" data-fmood="' + m.v + '" title="' + m.l + '">' + m.e + '</button>').join('') +
      '</div></div>' +
      '<div class="fw-block"><div class="fw-label">感情に名前をつける <span class="muted">（いくつでも）</span></div>' +
      EMOTIONS.map((g) => '<div class="emo-group emo-' + g.g + '">' + g.words.map((w) => '<button type="button" class="emo-chip' + ((v.emotions || []).includes(w) ? ' on' : '') + '" data-emo="' + esc(w) + '">' + esc(w) + '</button>').join('') + '</div>').join('') +
      '</div>';
  }

  function bindStateWidget(root, v, onChange) {
    $$('[data-energy]', root).forEach((b) => (b.onclick = () => {
      const x = +b.dataset.energy; v.energy = v.energy === x ? null : x;
      $$('[data-energy]', root).forEach((y) => y.classList.toggle('on', +y.dataset.energy === v.energy)); onChange();
    }));
    $$('[data-fmood]', root).forEach((b) => (b.onclick = () => {
      const x = +b.dataset.fmood; v.mood = v.mood === x ? null : x;
      $$('[data-fmood]', root).forEach((y) => y.classList.toggle('on', +y.dataset.fmood === v.mood)); onChange();
    }));
    $$('[data-emo]', root).forEach((b) => (b.onclick = () => {
      v.emotions = v.emotions || [];
      const w = b.dataset.emo; const i = v.emotions.indexOf(w);
      if (i >= 0) v.emotions.splice(i, 1); else v.emotions.push(w);
      b.classList.toggle('on', i < 0); onChange();
    }));
  }

  function lastTomorrow() {
    const sd = sorted().find((e) => e.kind === 'shutdown' && e.date < todayStr() && e.data && Array.isArray(e.data.tomorrow) && e.data.tomorrow.length);
    return sd ? sd.data.tomorrow[0] : '';
  }

  function weekEnergyChart() {
    const ws = weekStartStr();
    const map = byDate();
    let html = '<div class="vbars week-energy">';
    for (let i = 0; i < 7; i++) {
      const ds = addDays(ws, i);
      const a = avg((map.get(ds) || []).map((e) => e.energy).filter(Boolean));
      html += '<div class="vbar" title="' + ds + (a ? ' 平均 ' + a.toFixed(1) : ' 記録なし') + '"><span class="vbar-fill energy-fill" style="height:' + (a ? a * 20 : 0) + '%"></span><span class="vbar-label">' + WEEK[parseDate(ds).getDay()] + '</span><span class="vbar-mood">' + (a ? a.toFixed(1) : '–') + '</span></div>';
    }
    return html + '</div>';
  }

  function renderFlow() {
    const fl = state.flow;
    if (!fl) return go('home');
    const f = FLOWS[fl.id];
    if (fl.step >= f.steps.length) return renderFlowDone();
    const st = f.steps[fl.step];
    const a = fl.answers;
    const total = f.steps.length;
    const last = fl.step === total - 1;
    let w = '';
    let suggestion = '';

    if (st.type === 'state') {
      a[st.key] = a[st.key] || { energy: null, mood: null, emotions: [] };
      w = stateWidget(a[st.key]);
    } else if (st.type === 'quick') {
      a[st.key] = a[st.key] || { energy: null, mood: null, emotions: [], type: 'win', note: '' };
      const v = a[st.key];
      w = '<div class="fw-block"><div class="fw-label">何を記録する？</div><div class="seg big" id="qType">' +
        QUICK_TYPES.map((t) => '<button type="button" data-qtype="' + t.v + '"' + (v.type === t.v ? ' class="on"' : '') + '>' + t.e + ' ' + t.l + '</button>').join('') + '</div>' +
        '<input class="input fw-input" id="fwInput" placeholder="ひとことで（例：APIの不具合の原因を特定した）" value="' + esc(v.note) + '" enterkeyhint="done"></div>' +
        stateWidget(v);
    } else if (st.type === 'line') {
      w = '<input class="input fw-input" id="fwInput" placeholder="' + esc(st.placeholder || '') + '" value="' + esc(a[st.key] || '') + '" enterkeyhint="next">';
    } else if (st.type === 'text' || st.type === 'list') {
      w = '<textarea class="input fw-text" id="fwInput" rows="' + (st.type === 'list' ? 5 : 6) + '" placeholder="' + esc(st.placeholder || '') + '">' + esc(a[st.key] || '') + '</textarea>' +
        (st.type === 'list' ? '<p class="muted small">1行に1つずつ書いてください</p>' : '');
      if (st.showWeekEnergy) w = weekEnergyChart() + w;
    } else if (st.type === 'ifthen') {
      const v = a[st.key] = a[st.key] || { if: '', then: '' };
      w = '<div class="ifthen"><label>もし<input class="input" id="fwIf" value="' + esc(v.if) + '" placeholder="例：14時以降に集中が切れたら"></label>' +
        '<label>なら<input class="input" id="fwThen" value="' + esc(v.then) + '" placeholder="例：5分歩いてから一番小さいタスクに着手する"></label></div>';
    } else if (st.type === 'mitReview') {
      const morning = ofKind('morning', todayStr())[0];
      const mit = mitText(morning);
      const v = a[st.key] = a[st.key] || { text: mit, status: null, morningId: morning ? morning.id : null };
      w = (mit ? '<div class="mit-banner">🎯 ' + esc(mit) + '</div>'
        : '<p class="muted">今朝の始業前チェックインはありません。今日の主な仕事を書いてください。</p><input class="input fw-input" id="fwInput" value="' + esc(v.text) + '" placeholder="例：週次レポートの作成">') +
        '<div class="seg big" id="mitSeg">' + Object.entries(MIT_STATUS).map(([k, l]) => '<button type="button" data-mit="' + k + '"' + (v.status === k ? ' class="on"' : '') + '>' + l + '</button>').join('') + '</div>';
    } else if (st.type === 'weekWins') {
      const wins = winsBetween(weekStartStr(), todayStr());
      w = (wins.length
        ? '<ul class="win-list">' + wins.map((x) => '<li><span class="muted small">' + Number(x.date.slice(5, 7)) + '/' + Number(x.date.slice(8)) + '</span> ' + esc(x.text) + '</li>').join('') + '</ul><p class="win-count">🏆 今週の前進：<b>' + wins.length + '</b> 件</p>'
        : '<p class="muted">今週はまだ前進の記録がありません。思い出して書いてみましょう。</p>') +
        '<textarea class="input fw-text" id="fwInput" rows="4" placeholder="付け加えたい前進（1行に1つ）">' + esc(a[st.key] || '') + '</textarea>';
    } else if (st.type === 'timer') {
      const t = fl.timer = fl.timer || { total: 15 * 60, left: 15 * 60, int: null };
      w = '<div class="timer-row"><div class="seg" id="tmLen">' + [5, 10, 15, 20].map((m) => '<button type="button" data-min="' + m + '"' + (t.total === m * 60 ? ' class="on"' : '') + '>' + m + '分</button>').join('') + '</div>' +
        '<span class="timer" id="tmDisp">' + fmtSec(t.left) + '</span><button type="button" class="btn small" id="tmToggle">' + (t.int ? '⏸ 一時停止' : '▶ スタート') + '</button></div>' +
        '<textarea class="input fw-text tall" id="fwInput" placeholder="ここに書き続けてください…">' + esc(a[st.key] || '') + '</textarea>';
    }

    if (st.suggest === 'tomorrow' && !a[st.key]) {
      const t = lastTomorrow();
      if (t) suggestion = '<button type="button" class="suggest" data-fill="' + esc(t) + '">↩︎ 前回の「明日の最初の一手」：<b>' + esc(t) + '</b> を使う</button>';
    }
    if (st.suggest === 'todayWins') {
      const ws = winsBetween(todayStr(), todayStr()).filter((x) => !String(a[st.key] || '').includes(x.text)).map((x) => x.text);
      if (ws.length) suggestion = '<button type="button" class="suggest" data-append="' + esc(ws.join('\n')) + '">＋ 今日のチェックインで記録した前進（' + ws.length + '件）を追加</button>';
    }

    $('#main').innerHTML =
      '<div class="view flow flow-' + f.id + '">' +
      '<div class="flow-top"><button class="icon-btn" id="flowClose" aria-label="閉じる">✕</button>' +
      '<div class="flow-title">' + f.icon + ' ' + esc(f.name) + '</div><span class="muted small">' + (fl.step + 1) + ' / ' + total + '</span></div>' +
      '<div class="flow-progress"><span style="width:' + ((fl.step + 1) / total) * 100 + '%"></span></div>' +
      '<div class="flow-step">' +
      '<h1 class="flow-q">' + esc(st.q) + (st.optional ? ' <span class="opt">任意</span>' : '') + '</h1>' +
      (st.hint ? '<p class="flow-hint">' + esc(st.hint) + '</p>' : '') +
      suggestion + '<div class="flow-widget">' + w + '</div>' +
      whyHtml(st.research) +
      '</div>' +
      '<div class="flow-nav">' +
      (fl.step > 0 ? '<button class="btn" id="flowBack">← 戻る</button>' : '<span></span>') +
      '<button class="btn primary" id="flowNext">' + (last ? '✓ 完了して保存' : (st.optional && isBlank(a[st.key]) ? 'スキップ →' : '次へ →')) + '</button>' +
      '</div></div>';

    const main = $('#main');
    const markDirty = () => {
      fl.dirty = true;
      const nb = $('#flowNext');
      if (nb && !last) nb.textContent = st.optional && isBlank(a[st.key]) ? 'スキップ →' : '次へ →';
    };
    const next = () => { fl.step++; renderFlowStep(); };
    $('#flowClose').onclick = () => go('home');
    const back = $('#flowBack'); if (back) back.onclick = () => { stopFlowTimer(); fl.step--; renderFlowStep(); };
    $('#flowNext').onclick = () => (last ? finishFlow() : (stopFlowTimer(), next()));

    const inp = $('#fwInput');
    if (st.type === 'state') bindStateWidget(main, a[st.key], markDirty);
    if (st.type === 'quick') {
      const v = a[st.key];
      bindStateWidget(main, v, markDirty);
      $$('[data-qtype]', main).forEach((b) => (b.onclick = () => { v.type = b.dataset.qtype; $$('[data-qtype]', main).forEach((y) => y.classList.toggle('on', y === b)); markDirty(); }));
      inp.oninput = () => { v.note = inp.value; markDirty(); };
      inp.onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.isComposing && ev.keyCode !== 229) { ev.preventDefault(); finishFlow(); } };
    } else if (st.type === 'ifthen') {
      const v = a[st.key];
      $('#fwIf').oninput = (ev) => { v.if = ev.target.value; markDirty(); };
      $('#fwThen').oninput = (ev) => { v.then = ev.target.value; markDirty(); };
      $('#fwIf').onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.isComposing && ev.keyCode !== 229) { ev.preventDefault(); $('#fwThen').focus(); } };
      $('#fwThen').onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.isComposing && ev.keyCode !== 229) { ev.preventDefault(); $('#flowNext').click(); } };
    } else if (st.type === 'mitReview') {
      const v = a[st.key];
      if (inp) inp.oninput = () => { v.text = inp.value; markDirty(); };
      $$('[data-mit]', main).forEach((b) => (b.onclick = () => { v.status = b.dataset.mit; $$('[data-mit]', main).forEach((y) => y.classList.toggle('on', y === b)); markDirty(); }));
    } else if (inp) {
      inp.oninput = () => { a[st.key] = inp.value; markDirty(); };
      inp.onkeydown = (ev) => {
        if (ev.isComposing || ev.keyCode === 229) return;
        if ((ev.key === 'Enter' && inp.tagName === 'INPUT') || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); $('#flowNext').click(); }
      };
    }
    if (st.type === 'timer') bindTimer(fl.timer);

    const sg = $('.suggest', main);
    if (sg) sg.onclick = () => {
      if (sg.dataset.fill) a[st.key] = sg.dataset.fill;
      else a[st.key] = (String(a[st.key] || '').trim() + '\n' + sg.dataset.append).trim();
      fl.dirty = true;
      renderFlowStep();
    };

    if (inp && st.type !== 'quick' && st.type !== 'mitReview' && window.matchMedia('(min-width: 761px)').matches) {
      inp.focus();
      if (inp.setSelectionRange) inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }

  function renderFlowStep() { window.scrollTo(0, 0); renderFlow(); }
  function isBlank(v) {
    if (v == null) return true;
    if (typeof v === 'string') return !v.trim();
    if (typeof v === 'object') return Object.values(v).every((x) => isBlank(x) || (Array.isArray(x) && !x.length));
    return false;
  }
  function fmtSec(s) { return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }

  function bindTimer(t) {
    const disp = $('#tmDisp');
    const btn = $('#tmToggle');
    const tick = () => {
      t.left = Math.max(0, t.left - 1);
      if (disp) disp.textContent = fmtSec(t.left);
      if (t.left === 0) {
        clearInterval(t.int); t.int = null;
        if (btn) btn.textContent = '▶ スタート';
        disp && disp.classList.add('over');
        toast('⏰ 時間です。書き終えたら「完了して保存」を押してください', 4000);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    };
    if (t.int) { clearInterval(t.int); t.int = setInterval(tick, 1000); }
    btn.onclick = () => {
      if (t.int) { clearInterval(t.int); t.int = null; btn.textContent = '▶ 再開'; }
      else {
        if (t.left === 0) t.left = t.total;
        t.int = setInterval(tick, 1000); btn.textContent = '⏸ 一時停止'; $('#fwInput').focus();
      }
    };
    $$('[data-min]').forEach((b) => (b.onclick = () => {
      if (t.int) return toast('タイマー作動中は変更できません');
      t.total = t.left = +b.dataset.min * 60;
      disp.textContent = fmtSec(t.left);
      $$('[data-min]').forEach((y) => y.classList.toggle('on', y === b));
    }));
  }

  function stateLine(v) {
    if (!v) return '';
    const parts = [];
    if (v.energy) parts.push('⚡ エネルギー ' + v.energy + '/5（' + energyOf(v.energy).l + '）');
    if (v.mood) parts.push(moodOf(v.mood).e + ' ' + moodOf(v.mood).l);
    if (v.emotions && v.emotions.length) parts.push('感情：' + v.emotions.join('、'));
    return parts.join(' · ');
  }

  function buildFlowBody(f, d) {
    const out = [];
    for (const st of f.steps) {
      const v = d[st.key];
      if (isBlank(v) || (Array.isArray(v) && !v.length)) continue;
      let c = '';
      switch (st.type) {
        case 'state': c = stateLine(v); break;
        case 'quick': {
          const qt = QUICK_TYPES.find((x) => x.v === v.type) || QUICK_TYPES[3];
          c = [v.note ? qt.e + ' **' + qt.l + '**：' + v.note : '', stateLine(v)].filter(Boolean).join('\n\n');
          out.push(c);
          continue;
        }
        case 'line': c = f.id === 'morning' && st.key === 'mit' ? '- [ ] ' + v.trim() : v.trim(); break;
        case 'text': case 'timer': c = v.trim(); break;
        case 'list': case 'weekWins': c = v.map((x) => '- ' + x).join('\n'); break;
        case 'ifthen': if (!v.if && !v.then) continue; c = 'もし **' + (v.if || '…') + '** になったら、**' + (v.then || '…') + '** する'; break;
        case 'mitReview': c = '- [' + (v.status === 'done' ? 'x' : ' ') + '] ' + (v.text || '（未設定）') + (v.status ? ' — ' + MIT_STATUS[v.status] : ''); break;
      }
      if (c) out.push('### ' + st.label + '\n' + c);
    }
    return out.join('\n\n') + '\n';
  }

  function flowTitle(f, d) {
    switch (f.id) {
      case 'morning': return d.mit ? '始業前：' + d.mit : '始業前チェックイン';
      case 'checkin': { const qt = QUICK_TYPES.find((x) => x.v === (d.quick || {}).type); return (qt ? qt.l : 'チェックイン') + ((d.quick || {}).note ? '：' + d.quick.note.slice(0, 40) : ''); }
      case 'reset': return 'リセット' + (d.situation ? '：' + d.situation.split('\n')[0].slice(0, 30) : '');
      case 'shutdown': return '終業シャットダウン';
      case 'weekly': return '週次レビュー（' + Number(weekStartStr().slice(5, 7)) + '/' + Number(weekStartStr().slice(8)) + '〜）';
      default: return f.name;
    }
  }

  async function finishFlow() {
    const fl = state.flow;
    if (!fl || fl.saving) return;
    const f = FLOWS[fl.id];
    const a = fl.answers;
    stopFlowTimer();
    if (Object.values(a).every(isBlank)) return toast('まだ何も入力されていません');
    fl.saving = true;
    const data = {};
    for (const st of f.steps) {
      let v = a[st.key];
      if (isBlank(v)) continue;
      if (st.type === 'list' || st.type === 'weekWins') v = String(v).split('\n').map((x) => x.replace(/^\s*([-・*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
      if (st.type === 'weekWins') v = winsBetween(weekStartStr(), todayStr()).map((x) => x.text).concat(v);
      if (typeof v === 'string') v = v.trim();
      data[st.key] = typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    }
    const s = data.quick || data.state || {};
    const e = newEntry(todayStr(), {
      kind: f.id, title: flowTitle(f, data), body: buildFlowBody(f, data),
      mood: s.mood || null, energy: s.energy || null, emotions: s.emotions || [],
      tags: f.tags.slice(), data,
    });
    try {
      await persist(e);
      if (f.id === 'shutdown' && data.mit && data.mit.morningId) {
        const m = state.entries.get(data.mit.morningId);
        if (m) await setMitDone(m, data.mit.status === 'done');
      }
    } catch (err) {
      fl.saving = false;
      console.error(err);
      return toast('⚠️ 保存に失敗しました');
    }
    fl.dirty = false;
    fl.saving = false;
    fl.savedId = e.id;
    if (f.id === 'checkin') {
      state.flow = null;
      toast('⚡ チェックインを記録しました');
      return go('home');
    }
    fl.step = f.steps.length;
    renderFlowStep();
    renderSidebar();
  }

  function renderFlowDone() {
    const fl = state.flow;
    const f = FLOWS[fl.id];
    const e = state.entries.get(fl.savedId);
    const msg = f.done || f.icon + ' ' + f.name + 'を記録しました。';
    const st = computeStreaks();
    $('#main').innerHTML =
      '<div class="view flow flow-done flow-' + f.id + '">' +
      '<div class="done-hero"><div class="done-icon">' + f.icon + '</div>' +
      '<p class="done-msg">' + esc(msg).replace(/\n/g, '<br>') + '</p>' +
      '<p class="muted small">🔥 ' + st.current + '日連続で記録中</p></div>' +
      (e ? '<div class="card prose done-summary">' + MD.render(e.body) + '</div>' : '') +
      '<div class="flow-nav"><button class="btn" id="doneOpen">記録を開いて編集</button><button class="btn primary" id="doneHome">ホームへ</button></div>' +
      '</div>';
    $('#doneHome').onclick = () => { state.flow = null; go('home'); };
    $('#doneOpen').onclick = () => { const id = fl.savedId; state.flow = null; openEntry(id); };
  }

  /* ---------- 記録の選択シート ---------- */
  function openSheet() {
    const m = $('#modal');
    const rec = recommendedFlow();
    const order = ['checkin', 'morning', 'shutdown', 'reset', 'weekly', 'expressive'];
    m.innerHTML = '<div class="sheet" role="dialog" aria-label="記録する"><div class="sheet-handle"></div><h3>何を記録しますか？</h3>' +
      order.map((id) => {
        const f = FLOWS[id];
        const done = f.once && ofKind(id, todayStr()).length;
        return '<button class="sheet-item' + (rec === id ? ' rec' : '') + '" data-flow="' + id + '"><span class="si-icon">' + f.icon + '</span><span class="si-text"><b>' + esc(f.name) + '</b><small>' + esc(f.desc) + '</small></span><span class="si-meta">' + (done ? '✓ 済' : rec === id ? 'おすすめ' : f.minutes + '分') + '</span></button>';
      }).join('') +
      '<button class="sheet-item" data-free="1"><span class="si-icon">✍️</span><span class="si-text"><b>自由に書く</b><small>Markdown エディタで自由に記録します</small></span><span class="si-meta"></span></button>' +
      '<button class="btn block" data-close="1">キャンセル</button></div>';
    m.hidden = false;
    m.classList.add('sheet-mode');
    const close = () => { m.hidden = true; m.classList.remove('sheet-mode'); m.innerHTML = ''; document.removeEventListener('keydown', onKey, true); };
    const onKey = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    m.onclick = (ev) => {
      if (ev.target === m || ev.target.closest('[data-close]')) return close();
      const b = ev.target.closest('[data-flow],[data-free]');
      if (!b) return;
      close();
      if (b.dataset.free) writeNew(); else startFlow(b.dataset.flow);
    };
    const first = $('.sheet-item.rec', m) || $('.sheet-item', m);
    first.focus();
  }

  /* ---------- ガイド ---------- */
  function renderGuide() {
    const s = state.settings;
    const flowCard = (id) => {
      const f = FLOWS[id];
      return '<div class="card guide-flow"><div class="gf-head"><span class="gf-icon">' + f.icon + '</span><div><h2>' + esc(f.name) + '</h2><p class="muted small">約' + f.minutes + '分</p></div>' +
        '<button class="btn small primary" data-flow="' + id + '">はじめる</button></div><p>' + esc(f.desc) + '</p>' +
        '<div class="gf-research">' + f.research.map((r) => '<span>🔬 ' + esc(RESEARCH[r].title) + '</span>').join('') + '</div></div>';
    };
    $('#main').innerHTML =
      '<div class="view guide">' +
      '<header class="view-head"><div><p class="eyebrow">ガイド</p><h1>研究にもとづく「働く人のジャーナリング」</h1></div></header>' +
      '<section class="card routine"><h2>🗓️ おすすめの1日の流れ</h2><ol class="timeline">' +
      '<li><b>' + esc(s.workStart) + ' 始業前（3分）</b> — 状態を確認し、今日の「1つ」と「もし〜なら」を決める</li>' +
      '<li><b>仕事中（1分×何回でも）</b> — 前進・つまずき・気づきをチェックイン。イライラしたら「リセット」</li>' +
      '<li><b>' + esc(fromMin(hm(s.workEnd) - 15)) + ' 終業時（5分）</b> — 前進と学びを確認し、明日やることを書き出して仕事を閉じる</li>' +
      '<li><b>金曜（10分）</b> — 週次レビューで1週間の前進とエネルギーの傾向を振り返る</li></ol>' +
      '<p class="muted small">ポイントは「短く・毎日・同じタイミングで」。完璧より継続です。設定からカレンダーにリマインダーを登録できます。</p></section>' +
      '<h2 class="month-head">セッション</h2>' +
      ['morning', 'checkin', 'shutdown', 'reset', 'weekly', 'expressive'].map(flowCard).join('') +
      '<h2 class="month-head">科学的な背景</h2>' +
      Object.values(RESEARCH).map((r) => '<section class="card research"><h3>' + esc(r.title) + '</h3><p>' + esc(r.text) + '</p><cite>' + esc(r.ref) + '</cite></section>').join('') +
      '<p class="muted small">※ 効果には個人差があり、研究結果はすべての人に同じ効果を保証するものではありません。強い不調が続く場合は、医療機関や専門家に相談してください。</p>' +
      '</div>';
    $$('[data-flow]', $('#main')).forEach((b) => (b.onclick = () => startFlow(b.dataset.flow)));
  }

  /* ---------- リマインダー ---------- */
  function reminderTimes() {
    const s = state.settings;
    return { morning: s.workStart, shutdown: fromMin(hm(s.workEnd) - 15) };
  }

  function appUrl(params = '') {
    return location.origin + location.pathname.replace(/index\.html$/, '') + params;
  }

  function buildIcs() {
    const s = state.settings;
    const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const byday = s.workdays.slice().sort().map((d) => days[d]).join(',') || 'MO,TU,WE,TH,FR';
    const t = reminderTimes();
    const start = addDays(todayStr(), 1).replace(/-/g, '');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ev = (uidKey, time, mins, summary, flow) => [
      'BEGIN:VEVENT',
      'UID:tsuzuri-' + uidKey + '@tsuzuri.app',
      'DTSTAMP:' + stamp,
      'DTSTART:' + start + 'T' + time.replace(':', '') + '00',
      'DURATION:PT' + mins + 'M',
      'RRULE:FREQ=WEEKLY;BYDAY=' + (flow === 'weekly' ? 'FR' : byday),
      'SUMMARY:' + summary,
      'DESCRIPTION:' + appUrl('?flow=' + flow),
      'URL:' + appUrl('?flow=' + flow),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:' + summary, 'END:VALARM',
      'END:VEVENT',
    ];
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tsuzuri//Work Journal//JA', 'CALSCALE:GREGORIAN']
      .concat(ev('morning', t.morning, 3, '☀️ 始業前チェックイン（3分）', 'morning'))
      .concat(ev('shutdown', t.shutdown, 5, '🌙 終業シャットダウン（5分）', 'shutdown'))
      .concat(ev('weekly', fromMin(hm(s.workEnd) - 30), 10, '🗓️ 週次レビュー（10分）', 'weekly'))
      .concat(['END:VCALENDAR']);
    return lines.join('\r\n') + '\r\n';
  }

  const notified = new Set();
  async function notify(title, body, flow) {
    const url = appUrl('?flow=' + flow);
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) return reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'tsuzuri-' + flow, data: { url } });
      const n = new Notification(title, { body, icon: 'icons/icon-192.png' });
      n.onclick = () => { window.focus(); startFlow(flow); };
    } catch (err) { toast(title); }
  }
  function checkReminders() {
    const s = state.settings;
    if (!s.notify || !state.started || !isWorkday()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const t = reminderTimes();
    const n = nowMin();
    const today = todayStr();
    const due = (time) => n >= hm(time) && n < hm(time) + 10;
    if (due(t.morning) && !ofKind('morning', today).length && !notified.has(today + 'm')) {
      notified.add(today + 'm');
      notify('☀️ 始業前チェックイン', '3分で今日の「1つ」を決めましょう', 'morning');
    }
    if (due(t.shutdown) && !ofKind('shutdown', today).length && !notified.has(today + 's')) {
      notified.add(today + 's');
      notify('🌙 終業シャットダウン', '5分で今日を振り返って、仕事を閉じましょう', 'shutdown');
    }
  }

  /* ================= 起動・グローバルイベント ================= */
  function bindGlobal() {
    $$('#nav button, #bottombar button[data-view]').forEach((b) => (b.onclick = () => {
      if (b.dataset.view === 'list') Object.assign(state.filter, { tag: null, mood: null, fav: false, kind: null });
      go(b.dataset.view);
    }));
    $('#newEntryBtn').onclick = () => openSheet();
    $('#bbAdd').onclick = () => openSheet();
    $('#topSearchBtn').onclick = () => { document.body.classList.add('nav-open'); setTimeout(() => $('#searchInput').focus(), 50); };
    $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
    $('#scrim').onclick = () => document.body.classList.remove('nav-open');
    $('#tagList').onclick = (ev) => {
      const b = ev.target.closest('[data-tag]');
      if (!b) return;
      const t = b.dataset.tag;
      state.filter.tag = state.view === 'list' && state.filter.tag === t ? null : t;
      go('list');
    };
    const onSearch = debounce(() => {
      state.filter.q = $('#searchInput').value;
      if (state.view !== 'list') go('list', { focus: false }); else renderList();
    }, 160);
    $('#searchInput').addEventListener('input', onSearch);
    $('#searchInput').addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.target.value = ''; onSearch(); ev.target.blur(); }
      if (ev.key === 'Enter') { const c = $('.entry-card'); if (c) c.focus(); }
    });

    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('.menu') && !ev.target.closest('#edMore') && !ev.target.closest('#tplBtn')) $$('.menu').forEach((m) => (m.hidden = true));
    });

    document.addEventListener('keydown', (ev) => {
      if (document.body.classList.contains('locked') || !$('#modal').hidden) return;
      const mod = ev.ctrlKey || ev.metaKey;
      const k = ev.key.toLowerCase();
      if (mod && !ev.shiftKey && k === 'n') { ev.preventDefault(); writeNew(); }
      else if (mod && !ev.shiftKey && k === 'j') { ev.preventDefault(); startFlow('checkin'); }
      else if (mod && ev.shiftKey && k === 'n') { ev.preventDefault(); openSheet(); }
      else if (mod && !ev.shiftKey && k === 'k') { ev.preventDefault(); document.body.classList.add('nav-open'); $('#searchInput').focus(); $('#searchInput').select(); }
      else if (mod && !ev.shiftKey && k === 's') { ev.preventDefault(); if (state.view === 'editor') saveNow(); }
      else if (mod && !ev.shiftKey && k === 'e') {
        if (state.view !== 'editor') return;
        ev.preventDefault();
        setMode(state.settings.editorMode === 'preview' ? 'write' : 'preview');
      }
      else if (mod && ev.shiftKey && k === 'f') { ev.preventDefault(); toggleFocus(); }
      else if (mod && ev.shiftKey && k === 'l') { ev.preventDefault(); lock(); }
      else if (ev.key === 'Escape') {
        if (document.body.classList.contains('focus-mode')) document.body.classList.remove('focus-mode');
        else if (document.body.classList.contains('nav-open')) document.body.classList.remove('nav-open');
        $$('.menu').forEach((m) => (m.hidden = true));
      }
    });

    ['pointerdown', 'keydown', 'scroll'].forEach((t) => document.addEventListener(t, () => (state.lastActivity = Date.now()), { passive: true, capture: true }));
    setInterval(() => {
      const m = state.settings.autoLockMin;
      if (state.key && m && Date.now() - state.lastActivity > m * 60000) lock();
    }, 20000);

    document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) saveNow(); });
    window.addEventListener('beforeunload', (ev) => {
      if (saveTimer) { saveNow(); ev.preventDefault(); ev.returnValue = ''; }
    });

    setInterval(checkReminders, 30000);
    // 日付が変わったらホームを更新
    let lastDay = todayStr();
    setInterval(() => { if (todayStr() !== lastDay) { lastDay = todayStr(); if (state.view === 'home') renderHome(); } }, 60000);
  }

  function startApp() {
    if (!state.started) { bindGlobal(); state.started = true; }
    const params = new URLSearchParams(location.search);
    const flow = params.get('flow');
    if (params.has('flow') || params.has('view')) history.replaceState(null, '', location.pathname);
    if (flow && FLOWS[flow]) { state.view = 'home'; startFlow(flow); }
    else if (params.get('view') === 'new') { go('home').then(openSheet); }
    else go('home');
    checkReminders();
  }

  async function boot() {
    applySettings();
    $('#lockForm').addEventListener('submit', onUnlock);
    try { await DB.open(); } catch (err) {
      $('#main').innerHTML = '<div class="view"><div class="card"><h2>データベースを開けませんでした</h2><p>' + esc(err.message || err) + '</p><p class="muted">プライベートブラウズでは保存できない場合があります。</p></div></div>';
      return;
    }
    state.cryptoMeta = (await DB.getMeta('crypto')) || null;
    if (state.cryptoMeta) showLock();
    else { await loadAll(); startApp(); }

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // デバッグ・テスト用に最小限を公開
  window.Tsuzuri = { state, go, lock, startFlow, openSheet };

  boot();
})();
