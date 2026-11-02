/* 綴 Tsuzuri — メインアプリ */
(function () {
  'use strict';

  const { MOODS, PROMPTS, TEMPLATES } = window.JData;
  const esc = MD.esc;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  const SETTINGS_KEY = 'tsuzuri.settings';

  const DEFAULT_SETTINGS = {
    theme: 'system', font: 'sans', fontSize: 17, dailyGoal: 400,
    autoLockMin: 0, weekStart: 0, editorMode: 'write', spellcheck: false,
  };

  const state = {
    entries: new Map(),
    key: null,
    cryptoMeta: null,
    started: false,
    view: 'home',
    currentId: null,
    filter: { q: '', tag: null, mood: null, fav: false },
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
    const { q, tag, mood, fav } = state.filter;
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return sorted().filter((e) => {
      if (tag && !e.tags.includes(tag)) return false;
      if (mood && e.mood !== mood) return false;
      if (fav && !e.favorite) return false;
      if (terms.length) {
        const hay = (e.title + '\n' + e.body + '\n' + e.date).toLowerCase();
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
    if (view === 'editor' && state.view !== 'editor') state.prevView = state.view;
    await leaveEditor();
    document.body.classList.remove('focus-mode', 'nav-open');
    state.view = view;
    if (view === 'editor') state.currentId = opts.id;
    $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    const main = $('#main');
    main.scrollTop = 0;
    window.scrollTo(0, 0);
    ({ home: renderHome, list: renderList, calendar: renderCalendar, stats: renderStats, settings: renderSettings, editor: renderEditor })[view]();
    renderSidebar();
    if (opts.focus !== false && view !== 'editor') main.focus({ preventScroll: true });
  }

  function openEntry(id) { go('editor', { id }); }

  function writeNew(date = todayStr(), init = {}) {
    const e = newEntry(date, init);
    go('editor', { id: e.id });
  }

  function writeToday() {
    const today = sorted().find((e) => e.date === todayStr());
    if (today) openEntry(today.id); else writeNew();
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
      '<h3>' + highlight(title, terms) + '</h3>' +
      '<p>' + highlight(excerpt(e, terms), terms) + '</p>' +
      (e.tags.length ? '<div class="ec-tags">' + e.tags.map((t) => '<span>#' + esc(t) + '</span>').join('') + '</div>' : '') +
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
    const todayChars = todays.reduce((s, e) => s + chars(e.body), 0);
    const goal = state.settings.dailyGoal;
    const pct = goal ? Math.min(100, Math.round((todayChars / goal) * 100)) : 0;
    const monthKey = today.slice(0, 7);
    const monthCount = all.filter((e) => e.date.startsWith(monthKey)).length;
    const totalChars = all.reduce((s, e) => s + chars(e.body), 0);
    const md = today.slice(5);
    const onThisDay = all.filter((e) => e.date !== today && (e.date.slice(5) === md || e.date === addDays(today, -7) || e.date === addDays(today, -30)));
    const recent = all.filter((e) => e.date !== today).slice(0, 5);
    const prompt = PROMPTS[state.promptIdx % PROMPTS.length];

    $('#main').innerHTML =
      '<div class="view home">' +
      '<header class="view-head"><div><p class="eyebrow">' + fmtDate(today) + '</p><h1>' + greeting() + '</h1></div></header>' +

      '<section class="tiles">' +
      tile('🔥', st.current + '<small>日</small>', '連続記録', st.wroteToday ? '今日も書けました' : (st.current ? '今日書くと ' + (st.current + 1) + ' 日に' : '今日から始めよう')) +
      tile('📝', monthCount + '<small>件</small>', '今月の記録', '最長 ' + st.longest + ' 日連続') +
      tile('✍️', totalChars.toLocaleString() + '<small>字</small>', 'これまでの文字数', st.days + ' 日分の記録') +
      '<div class="tile goal"><div class="tile-label">今日の目標</div>' +
      '<div class="ring" style="--p:' + pct + '"><span>' + pct + '%</span></div>' +
      '<div class="tile-sub">' + todayChars + ' / ' + goal + ' 字</div></div>' +
      '</section>' +

      '<section class="card prompt-card">' +
      '<div class="prompt-label">💡 今日のお題</div>' +
      '<p class="prompt-text">' + esc(prompt) + '</p>' +
      '<div class="row gap"><button class="btn primary" id="usePrompt">このお題で書く</button><button class="btn ghost" id="shufflePrompt">🔀 別のお題</button></div>' +
      '</section>' +

      '<section class="section"><div class="section-head"><h2>今日の記録</h2>' +
      '<button class="btn small" id="homeNew">＋ 新しく書く</button></div>' +
      (todays.length ? '<div class="cards">' + todays.map((e) => entryCard(e)).join('') + '</div>'
        : '<div class="empty"><p>今日はまだ書いていません。テンプレートから始めることもできます。</p>' +
          '<div class="template-grid">' + TEMPLATES.map((t) => '<button class="template-btn" data-tpl="' + t.id + '"><span>' + t.icon + '</span>' + esc(t.name) + '</button>').join('') + '</div></div>') +
      '</section>' +

      (onThisDay.length ? '<section class="section"><div class="section-head"><h2>🕰️ 振り返り</h2><span class="muted small">1週間前・1か月前・過去の今日</span></div>' +
        '<div class="cards">' + onThisDay.map((e) => '<div class="ago-label">' + relDays(e.date) + '</div>' + entryCard(e)).join('') + '</div></section>' : '') +

      (recent.length ? '<section class="section"><div class="section-head"><h2>最近の記録</h2>' +
        '<div class="row gap"><button class="btn small ghost" id="randomEntry">🎲 ランダムに読む</button><button class="btn small ghost" data-goto="list">すべて見る →</button></div></div>' +
        '<div class="cards">' + recent.map((e) => entryCard(e)).join('') + '</div></section>' : '') +

      (!all.length ? '<section class="card welcome"><h2>綴 Tsuzuri へようこそ 👋</h2>' +
        '<ul><li>すべてのデータは<b>このブラウザの中だけ</b>に保存されます（サーバー送信なし）。</li>' +
        '<li>設定からパスフレーズで<b>AES-256 暗号化</b>できます。</li>' +
        '<li>Markdown・タスクリスト・タグ・気分記録・カレンダー・インサイトに対応。</li>' +
        '<li>オフラインでも動作し、ホーム画面にインストールできます。</li></ul></section>' : '') +
      '</div>';

    const main = $('#main');
    bindCards(main);
    $('#usePrompt').onclick = () => writeNew(todayStr(), { body: '> ' + prompt + '\n\n' });
    $('#shufflePrompt').onclick = () => { state.promptIdx = (state.promptIdx + 1 + Math.floor(Math.random() * (PROMPTS.length - 1))) % PROMPTS.length; renderHome(); };
    $('#homeNew').onclick = () => writeNew();
    $$('[data-tpl]', main).forEach((b) => (b.onclick = () => {
      const t = TEMPLATES.find((x) => x.id === b.dataset.tpl);
      writeNew(todayStr(), { body: t.body, tags: t.tags || [] });
    }));
    const r = $('#randomEntry');
    if (r) r.onclick = () => { const a = sorted(); openEntry(a[Math.floor(Math.random() * a.length)].id); };
    $$('[data-goto]', main).forEach((b) => (b.onclick = () => go(b.dataset.goto)));
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
      (f.tag ? '<button class="chip active" id="clearTag">#' + esc(f.tag) + ' ✕</button>' : '') +
      (f.q || f.tag || f.mood || f.fav ? '<button class="chip ghost" id="clearAll">条件をクリア</button>' : '') +
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
    const ct = $('#clearTag'); if (ct) ct.onclick = () => { f.tag = null; renderList(); renderSidebar(); };
    const ca = $('#clearAll'); if (ca) ca.onclick = () => { Object.assign(f, { q: '', tag: null, mood: null, fav: false }); $('#searchInput').value = ''; renderList(); renderSidebar(); };
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

    $('#main').innerHTML =
      '<div class="view stats">' +
      '<header class="view-head"><div><p class="eyebrow">インサイト</p><h1>あなたの記録の傾向</h1></div></header>' +
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
      [['Ctrl/⌘ + N', '新しく書く'], ['Ctrl/⌘ + K', '検索'], ['Ctrl/⌘ + S', '今すぐ保存'], ['Ctrl/⌘ + E', 'プレビュー切替'], ['Ctrl/⌘ + B / I', '太字 / 斜体'],
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

  /* ================= 起動・グローバルイベント ================= */
  function bindGlobal() {
    $$('#nav button').forEach((b) => (b.onclick = () => {
      if (b.dataset.view === 'list') Object.assign(state.filter, { tag: null, mood: null, fav: false });
      go(b.dataset.view);
    }));
    $('#newEntryBtn').onclick = () => writeToday();
    $('#topNewBtn').onclick = () => writeNew();
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

    // 日付が変わったらホームを更新
    let lastDay = todayStr();
    setInterval(() => { if (todayStr() !== lastDay) { lastDay = todayStr(); if (state.view === 'home') renderHome(); } }, 60000);
  }

  function startApp() {
    if (!state.started) { bindGlobal(); state.started = true; }
    go('home');
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
  window.Tsuzuri = { state, go, lock };

  boot();
})();
