/* 軽量・安全な Markdown レンダラー（HTMLは常にエスケープ） */
(function (global) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  function safeUrl(url) {
    const u = url.trim();
    if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
    return null;
  }

  function inline(text) {
    const codes = [];
    let s = text.replace(/`([^`]+)`/g, (_, c) => {
      codes.push('<code>' + esc(c) + '</code>');
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    s = esc(s);
    // 画像（http(s)のみ）
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
      const u = safeUrl(url.replace(/&amp;/g, '&'));
      return u ? '<img alt="' + alt + '" src="' + esc(u) + '" loading="lazy">' : m;
    });
    // リンク
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const u = safeUrl(url.replace(/&amp;/g, '&'));
      return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>' : m;
    });
    // 自動リンク
    s = s.replace(/(^|[\s(（])(https?:\/\/[^\s<)）]+)/g, (m, pre, url) =>
      pre + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
    s = s.replace(/==(.+?)==/g, '<mark>$1</mark>');
    // ハッシュタグ
    s = s.replace(/(^|[\s　])#([^\s#　.,。、!?！？()（）\[\]]+)/g, '$1<span class="md-tag">#$2</span>');
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
    return s;
  }

  const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

  function render(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    return renderLines(lines, 0);
  }

  function renderLines(lines, offset) {
    let html = '';
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      if (/^\s*```/.test(line)) {
        const lang = line.trim().slice(3).trim();
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html += '<pre><code' + (lang ? ' data-lang="' + esc(lang) + '"' : '') + '>' + esc(buf.join('\n')) + '</code></pre>';
        continue;
      }

      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        const lv = h[1].length;
        html += '<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>';
        i++;
        continue;
      }

      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        html += '<hr>';
        i++;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const buf = [];
        const start = i;
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        html += '<blockquote>' + renderLines(buf, offset + start) + '</blockquote>';
        continue;
      }

      if (LIST_RE.test(line)) {
        const items = [];
        while (i < lines.length && LIST_RE.test(lines[i])) {
          const m = lines[i].match(LIST_RE);
          items.push({ indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), text: m[3], line: offset + i });
          i++;
        }
        html += renderList(items);
        continue;
      }

      if (!line.trim()) {
        i++;
        continue;
      }

      const buf = [];
      while (
        i < lines.length && lines[i].trim() &&
        !/^\s*```/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) &&
        !/^\s*>/.test(lines[i]) && !LIST_RE.test(lines[i]) &&
        !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
      ) buf.push(lines[i++]);
      html += '<p>' + buf.map(inline).join('<br>') + '</p>';
    }
    return html;
  }

  function renderList(items) {
    let out = '';
    const stack = [];
    for (const it of items) {
      while (stack.length && it.indent < stack[stack.length - 1].indent) {
        out += '</li></' + stack.pop().tag + '>';
      }
      const top = stack[stack.length - 1];
      if (!top || it.indent > top.indent) {
        const tag = it.ordered ? 'ol' : 'ul';
        out += '<' + tag + '>';
        stack.push({ indent: it.indent, tag });
      } else {
        out += '</li>';
      }
      const task = it.text.match(/^\[( |x|X)\]\s*(.*)$/);
      if (task) {
        const checked = task[1] !== ' ';
        out += '<li class="task' + (checked ? ' done' : '') + '"><input type="checkbox" data-line="' + it.line + '"' + (checked ? ' checked' : '') + '> <span>' + inline(task[2]) + '</span>';
      } else {
        out += '<li>' + inline(it.text);
      }
    }
    while (stack.length) out += '</li></' + stack.pop().tag + '>';
    return out;
  }

  /** プレーンテキスト化（抜粋用） */
  function plain(src) {
    return String(src || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s*#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s*)?/gm, '')
      .replace(/[*_~`=]{1,3}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  global.MD = { render, plain, esc };
})(window);
