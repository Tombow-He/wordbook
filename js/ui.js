/* 词书 · 界面渲染与交互 */
window.App = window.App || {};

App.ui = (function () {
  var state = null;
  var $ = function (id) { return document.getElementById(id); };

  /* ---- 工具 ---- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 乱序：固定种子的伪随机，保证稳定（同词书同一乱序顺序） */
  var seedCache = {};
  function seededRandom(word) {
    var h = 2166136261;
    var s = String(word);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  }
  function shuffleSeed(entries) {
    var arr = entries.slice();
    arr.sort(function (a, b) {
      var ka = a.w || a.word || '';
      var kb = b.w || b.word || '';
      var ra = seededRandom(ka), rb = seededRandom(kb);
      if (ra !== rb) return ra - rb;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return arr;
  }
  /* 全局打乱（重新打乱按钮）：给所有词一个新随机序 */
  function reshuffleAll() {
    var entries = currentEntries();
    entries.forEach(function (e) {
      var key = e.w || e.word || '';
      seedCache[key] = Math.random();
    });
    return shuffleWithCache(entries);
  }
  function shuffleWithCache(entries) {
    var arr = entries.slice();
    arr.sort(function (a, b) {
      var ka = a.w || a.word || '';
      var kb = b.w || b.word || '';
      var ra = seedCache[ka] != null ? seedCache[ka] : seededRandom(ka);
      var rb = seedCache[kb] != null ? seedCache[kb] : seededRandom(kb);
      if (ra !== rb) return ra - rb;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return arr;
  }
  function isRandom() { return App.view.view.order === 'random'; }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  /* ---- 选择集 ---- */
  function selectedEntries() {
    var out = [];
    state.selected.forEach(function (key) {
      var e = null;
      if (key.indexOf('m:') === 0) {
        var rec = App.store.get(key.slice(2));
        if (rec) e = { w: rec.word, p: rec.phonetic, zh: rec.zh };
      } else if (key.indexOf('bk:') === 0) {
        var parts = key.split(':');
        var list = App.vocab.getWords(parts[1]);
        var w = parts.slice(2).join(':');
        var found = list.find(function (x) { return x.w === w; });
        if (found) e = { w: found.w, p: found.p, zh: found.zh };
      }
      if (e) out.push(e);
    });
    return out;
  }

  function updatePrintButton() {
    var n = state.selected.size;
    var btn = $('btn-print');
    var allBtn = $('btn-select-all');
    if (state.selectMode) {
      allBtn.hidden = false;
      var entries = currentEntries();
      var selectedVisible = entries.filter(function (e) {
        var key = state.currentBook === 'mine'
          ? 'm:' + e.id
          : 'bk:' + state.currentBook + ':' + e.w;
        return state.selected.has(key);
      }).length;
      allBtn.textContent = selectedVisible === entries.length && entries.length > 0 ? '清空' : '全选';
    } else {
      allBtn.hidden = true;
    }
    if (n > 0) {
      btn.hidden = false;
      $('print-count').textContent = ' (' + n + ')';
    } else {
      btn.hidden = true;
    }
  }

  /* ---- 主渲染 ---- */
  function render() {
    renderSidebar();
    renderHeader();
    renderList();
    updatePrintButton();
  }

  function renderSidebar() {
    var mine = $('nav-mine');
    mine.innerHTML = bookItemHtml('mine', '我的单词本', App.store.count(), true);
    var books = $('nav-books');
    var html = '';
    App.vocab.books.forEach(function (b) {
      html += bookItemHtml(b.id, b.name, b.count, false);
    });
    books.innerHTML = html;
    /* 工具：词根词缀 */
    $('roots-count').textContent = App.roots.count() || 0;
    $('btn-roots').classList.toggle('active', state.mode === 'roots');
  }

  function bookItemHtml(id, name, count, isMine) {
    var cls = state.currentBook === id ? 'book-item active' : 'book-item';
    return '<button class="' + cls + '" data-book="' + id + '">' +
      '<span>' + esc(name) + '</span>' +
      (isMine ? '<span class="bcount">' + count + '</span>' : '') +
      '</button>';
  }

  function wordOf(e) { return e.w || e.word || ''; }
  function zhOf(e) { return e.zh || ''; }

  /* 全局搜索：跨所有词书（含我的单词本）搜索英文或中文 */
  function globalSearch(q) {
    var out = [];
    /* 我的单词本 */
    App.store.getAll().forEach(function (w) {
      if (wordOf(w).toLowerCase().indexOf(q) >= 0 || zhOf(w).toLowerCase().indexOf(q) >= 0) {
        out.push({ kind: 'mine', e: w });
      }
    });
    /* 各内置词书（去重：同一单词显示第一个命中的书） */
    var seen = {};
    App.vocab.books.forEach(function (b) {
      App.vocab.getWords(b.id).forEach(function (w) {
        if (seen[w.w]) return;
        if (w.w.toLowerCase().indexOf(q) >= 0 || (w.zh || '').toLowerCase().indexOf(q) >= 0) {
          seen[w.w] = true;
          out.push({ kind: 'book', book: b.id, e: w });
        }
      });
    });
    return out;
  }

  function currentEntries() {
    var list;
    if (state.currentBook === 'mine') {
      list = App.store.getAll().slice().sort(function (a, b) { return a.addedAt < b.addedAt ? 1 : -1; });
    } else {
      list = App.vocab.getWords(state.currentBook).slice();
    }

    /* 排序：正序（字母序）或 乱序（稳定随机） */
    if (isRandom()) {
      list = shuffleWithCache(list);
    } else {
      list.sort(function (a, b) {
        var wa = wordOf(a).toLowerCase(), wb = wordOf(b).toLowerCase();
        return wa < wb ? -1 : wa > wb ? 1 : 0;
      });
    }

    var q = state.search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(function (e) {
      return wordOf(e).toLowerCase().indexOf(q) >= 0 ||
        zhOf(e).toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderHeader() {
    var count = $('book-count');
    if (state.mode === 'roots') {
      $('book-title').textContent = '词根词缀';
      var rootList = App.roots.search(state.search);
      var shown = rootList.length;
      count.textContent = q1(state.search) ? (shown + ' / ' + App.roots.count() + ' 词根') : (App.roots.count() + ' 词根');
      $('btn-select-mode').style.display = 'none';
      $('btn-select-all').hidden = true;
      $('btn-print').hidden = true;
      return;
    }
    $('btn-select-mode').style.display = '';
    $('btn-select-mode').textContent = state.selectMode ? '取消选择' : '选择';
    var title = state.currentBook === 'mine' ? '我的单词本' : App.vocab.bookName(state.currentBook);
    $('book-title').textContent = title;
    var total = state.currentBook === 'mine' ? App.store.count() : App.vocab.getWords(state.currentBook).length;
    var shown = currentEntries().length;
    var global = state.searchScope === 'all' && q1(state.search);
    var total2 = global ? globalSearch(state.search.trim().toLowerCase()).length : total;
    count.textContent = global
      ? (shown + ' / ' + total2 + ' 词')
      : (q1(state.search) ? (shown + ' / ' + total + ' 词') : (total + ' 词'));
    $('btn-select-mode').textContent = state.selectMode ? '取消选择' : '选择';
  }

  function q1(s) { return String(s || '').trim() !== ''; }

  /* ---- 显示设置 ---- */
  function syncViewPanel() {
    $('set-hide-en').checked = App.view.view.hideEn;
    $('set-hide-zh').checked = App.view.view.hideZh;
    $('set-hide-ph').checked = App.view.view.hidePh;
    $('set-show-ph').checked = App.view.view.showPh;
    $('set-peek').checked = App.view.view.peek;
    $('set-voice').value = App.view.view.voice;
    $('set-order').value = App.view.view.order;
    $('btn-reshuffle').hidden = App.view.view.order !== 'random';
    /* 音标总开关与"屏蔽音标"互斥：屏蔽音标时音标总开关置灰 */
    $('set-show-ph').disabled = App.view.view.hidePh;
  }

  function toggleDisplayPanel() {
    var p = $('display-panel');
    p.hidden = !p.hidden;
    if (!p.hidden) syncViewPanel();
  }

  /* 行内容是否屏蔽：hideEn/hideZh/hidePh 任一开启，或 peek 模式 */
  /* peek 模式时行内提示 */
  function peekHint() {
    return App.view.view.peek ? '<span class="row-hint">🔍 点击显示</span>' : '';
  }

  function renderList() {
    if (state.mode === 'roots') { renderRootList(); return; }
    var q = state.search.trim().toLowerCase();
    var global = state.searchScope === 'all' && q;

    var entries, total, show;
    if (global) {
      var results = globalSearch(q);
      total = results.length;
      show = results.slice(0, state.visibleCount);
    } else {
      entries = currentEntries();
      total = entries.length;
      show = entries.slice(0, state.visibleCount);
    }

    var box = $('word-list');
    var html = '';

    if (global) {
      show.forEach(function (r) {
        html += r.kind === 'mine' ? mineRowHtml(r.e) : searchRowHtml(r.e, r.book);
      });
    } else {
      show.forEach(function (e) {
        if (state.currentBook === 'mine') {
          html += mineRowHtml(e);
        } else {
          html += bookRowHtml(e);
        }
      });
    }

    box.innerHTML = html;

    var empty = $('empty-state');
    if (total === 0) {
      empty.hidden = false;
      if (global) {
        empty.innerHTML = '<div class="big">🔍</div><p>没有找到匹配的单词。</p>';
      } else if (state.currentBook === 'mine' && !q1(state.search)) {
        empty.innerHTML = '<div class="big">📖</div><p>单词本还是空的。<br>点右上角 <b>＋ 添加单词</b>，输入时会有自动补全。</p>';
      } else {
        empty.innerHTML = '<div class="big">🔍</div><p>没有匹配的单词。</p>';
      }
    } else {
      empty.hidden = true;
    }

    var sentinel = $('list-sentinel');
    sentinel.style.visibility = show.length < total ? 'visible' : 'hidden';
  }

  /* 词根词缀浏览模式：渲染词根卡片列表 */
  function renderRootList() {
    var list = App.roots.search(state.search);
    var box = $('word-list');
    var html = '';
    list.forEach(function (r) {
      var total = (r.ex || []).length + (r.rel || []).length;
      html += '<div class="root-card" data-root="' + esc(r.r) + '">' +
        '<div class="rc-key">' + esc(r.r) + '<span class="rc-class">' + esc(App.roots.classZh(r.c)) + '</span></div>' +
        '<div class="rc-meaning">' + esc(r.m) + '</div>' +
        '<div class="rc-meta"><span>' + (r.o ? '来源 ' + esc(r.o) : '') + '</span>' +
        (total ? '<span>' + total + ' 词</span>' : '') +
        '</div></div>';
    });
    box.innerHTML = html;

    var empty = $('empty-state');
    if (list.length === 0) {
      empty.hidden = false;
      empty.innerHTML = '<div class="big">🔍</div><p>没有匹配的词根词缀。</p>';
    } else {
      empty.hidden = true;
    }
    $('list-sentinel').style.visibility = 'hidden';
  }

  /* 全局搜索结果行（内置词书词条，带来源书徽标） */
  function searchRowHtml(e, bookId) {
    var cls = 'row' + rowMaskClass();
    return '<div class="' + cls + '" data-word="' + esc(e.w) + '" data-book="' + esc(bookId) + '">' +
      contentHtml(e.w, e.p, e.zh) +
      peekHint() +
      '<span class="ra"><span class="badge">' + esc(App.vocab.bookName(bookId)) + '</span></span></div>';
  }

  function mineRowHtml(e) {
    var srcBadge = e.sourceBookId ? '<span class="badge">来自 ' + esc(App.vocab.bookName(e.sourceBookId)) + '</span>' : '';
    var date = new Date(e.addedAt);
    var dateStr = isNaN(date) ? '' : ' · ' + date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    var checked = state.selected.has('m:' + e.id) ? ' checked' : '';
    var cb = state.selectMode
      ? '<input type="checkbox" class="cb" data-key="m:' + esc(e.id) + '"' + checked + '>'
      : '';
    var cls = 'row row-mine' + rowMaskClass();
    return '<div class="' + cls + '" data-id="' + esc(e.id) + '">' +
      cb +
      contentHtml(e.word, e.phonetic, e.zh) +
      peekHint() +
      '<span class="ra">' + srcBadge + '<span class="date">' + dateStr + '</span>' +
      '<button class="mini-btn" data-act="edit">编辑</button>' +
      '<button class="mini-btn danger" data-act="del">删除</button>' +
      '</span></div>';
  }

  function bookRowHtml(e) {
    var checked = state.selected.has('bk:' + state.currentBook + ':' + e.w) ? ' checked' : '';
    var cb = state.selectMode
      ? '<input type="checkbox" class="cb" data-key="bk:' + esc(state.currentBook) + ':' + esc(e.w) + '"' + checked + '>'
      : '';
    var fav = state.selectMode ? '' : '<button class="fav-btn" data-act="fav" title="收藏到我的单词本">＋</button>';
    var cls = 'row' + rowMaskClass();
    return '<div class="' + cls + '" data-word="' + esc(e.w) + '">' +
      cb +
      contentHtml(e.w, e.p, e.zh) +
      peekHint() +
      '<span class="ra">' + fav + '</span></div>';
  }

  /* 根据显示设置拼接行 class：
   *   hidePh 或 showPh=false → .hide-ph（CSS 隐藏音标）
   *   peek 模式 → .masked（全部遮住，点击显示）
   */
  function rowMaskClass() {
    var v = App.view.view;
    var cls = '';
    if (v.hidePh || !v.showPh) cls += ' hide-ph';
    if (v.peek) cls += ' masked';
    return cls;
  }

  /* 单词 / 音标 / 释义 三段内容：
   *   hideEn/hideZh → 对应字段模糊（屏蔽）
   *   peek → 交给 .masked CSS 统一遮住
   *   hidePh 或 showPh=false → 交给 .hide-ph CSS 隐藏音标
   */
  function contentHtml(word, ph, zh) {
    var v = App.view.view;
    function span(cls, txt) {
      return txt ? '<span class="' + cls + '">' + esc(txt) + '</span>' : '<span class="' + cls + '"></span>';
    }
    var html = '';
    html += v.hideEn ? span('rw blur', word) : span('rw', word);
    html += span('rp', ph);
    html += v.hideZh ? span('rz blur', zh) : span('rz', zh);
    return html;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* 释义按词性分行：ECDICT 中文释义格式如 "vt. 放弃；n. 放任"，转成每词性一行 */
  function posLines(zh) {
    var s = String(zh || '').trim();
    if (!s) return '';
    var parts = s.split(/；/);
    var out = [];
    parts.forEach(function (p) {
      p = p.trim();
      if (!p) return;
      /* 前缀是词性标记（n./v./vt./a./adv./prep./num./conj./pron./abbr. 等）则单独成行 */
      var m = p.match(/^((?:[a-zA-Z]{1,6}\.)(?:[a-zA-Z]{1,6}\.)?\s*)/);
      if (m) {
        out.push('<div class="pos-line"><span class="pos">' + esc(m[1].trim()) + '</span><span>' + esc(p.slice(m[0].length)) + '</span></div>');
      } else {
        out.push('<div class="pos-line">' + esc(p) + '</div>');
      }
    });
    return out.join('');
  }

  /* ---- 添加弹窗 ---- */
  var chosen = null;
  var sugList = [];
  var sugIdx = -1;
  var sugTimer = null;

  function openAdd() {
    chosen = null; sugList = []; sugIdx = -1;
    $('add-input').value = '';
    $('add-phonetic').value = '';
    $('add-zh').value = '';
    $('manual-fields').hidden = true;
    $('add-preview').hidden = true;
    $('suggest-dropdown').hidden = true;
    showMsg('', '');
    $('modal').hidden = false;
    $('add-input').focus();
  }

  function closeAdd() {
    $('modal').hidden = true;
    clearTimeout(sugTimer);
  }

  function showMsg(text, kind) {
    var el = $('add-msg');
    el.textContent = text;
    el.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function onAddInput() {
    clearTimeout(sugTimer);
    var v = $('add-input').value;
    chosen = null;
    $('add-preview').hidden = true;
    if (!v.trim()) {
      $('suggest-dropdown').hidden = true;
      sugList = []; sugIdx = -1;
      return;
    }
    sugTimer = setTimeout(function () {
      sugList = App.vocab.suggest(v, 10);
      sugIdx = -1;
      renderSuggest();
    }, 100);
  }

  function renderSuggest() {
    var dd = $('suggest-dropdown');
    if (!sugList.length) { dd.hidden = true; return; }
    var html = '';
    sugList.forEach(function (e, i) {
      var badges = (e.s || []).map(function (bid) {
        return '<span class="badge">' + esc(App.vocab.bookName(bid)) + '</span>';
      }).join('');
      html += '<div class="sug-item' + (i === sugIdx ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="sw">' + esc(e.w) + '</span>' +
        '<span class="sp">' + esc(e.p) + '</span>' +
        '<span class="sz">' + esc(e.zh) + '</span>' +
        badges +
        '</div>';
    });
    dd.innerHTML = html;
    dd.hidden = false;
    dd.querySelector('.sel') && dd.querySelector('.sel').scrollIntoView({ block: 'nearest' });
  }

  function chooseSug(e) {
    chosen = e;
    $('add-input').value = e.w;
    $('suggest-dropdown').hidden = true;
    sugList = []; sugIdx = -1;
    $('manual-fields').hidden = true;
    var pv = $('add-preview');
    pv.hidden = false;
    var badges = (e.s || []).map(function (bid) {
      return '<span class="badge">' + esc(App.vocab.bookName(bid)) + '</span>';
    }).join('');
    pv.innerHTML = '<div><span class="pw">' + esc(e.w) + '</span><span class="pp">' + esc(e.p) + '</span></div>' +
      '<div class="pz">' + esc(e.zh) + '</div>' +
      (badges ? '<div class="badges">' + badges + '</div>' : '');
    showMsg('', '');
  }

  function renderManualPreview() {
    var pv = $('add-preview');
    var word = $('add-input').value.trim();
    var phonetic = $('add-phonetic').value.trim();
    var zh = $('add-zh').value.trim();
    pv.hidden = false;
    pv.innerHTML = '<div><span class="pw">' + esc(word) + '</span><span class="pp">' + esc(phonetic) + '</span></div>' +
      '<div class="pz">' + esc(zh) + '</div>';
  }

  function confirmAdd() {
    var word = $('add-input').value.trim();
    if (!word) { showMsg('请输入单词', 'err'); return; }

    if (chosen) {
      doAdd(word, chosen.p, chosen.zh, chosen.s && chosen.s[0] || '');
      return;
    }

    var exact = App.vocab.lookupExact(word);
    if (exact) {
      doAdd(word, exact.p, exact.zh, exact.s && exact.s[0] || '');
      return;
    }

    var mf = $('manual-fields');
    if (mf.hidden) {
      /* 词表没有 → 打开手动编辑 */
      mf.hidden = false;
      $('add-phonetic').value = '';
      $('add-zh').value = '';
      renderManualPreview();
      showMsg('词表中没有这个词，请补全音标和中文释义', 'ok');
      $('add-zh').focus();
      return;
    }

    var zh = $('add-zh').value.trim();
    if (!zh) { showMsg('请填写中文释义', 'err'); return; }
    doAdd(word, $('add-phonetic').value.trim(), zh, '');
  }

  function doAdd(word, phonetic, zh, src) {
    var res = App.store.add(word, phonetic, zh, src);
    if (!res.ok) {
      showMsg(res.reason === '已存在' ? '『' + word + '』已在单词本中' : res.reason, 'err');
      return;
    }
    closeAdd();
    render();
    toast('已添加『' + res.entry.word + '』');
  }

  /* ---- 词典增强：英文释义、词根、派生词 ---- */

  /* 英文释义按行渲染（每行形如 "n. ..." / "v. ..."） */
  function defLines(def) {
    var s = String(def || '').trim();
    if (!s) return '';
    return s.split('\n').map(function (line) {
      line = line.trim();
      if (!line) return '';
      var m = line.match(/^([a-zA-Z]+\.)\s*/);
      if (m) {
        return '<div class="def-line"><span class="dpos">' + esc(m[1]) + '</span><span>' + esc(line.slice(m[0].length)) + '</span></div>';
      }
      return '<div class="def-line">' + esc(line) + '</div>';
    }).join('');
  }

  /* 详情增强：英文释义 + 词根 chips + 派生词 chips */
  function detailEnrichmentHtml(word) {
    var html = '';
    /* 英文释义（仅词典中的词） */
    var full = App.vocab.lookupExact(word);
    if (full && full.d) {
      html += '<div class="db-def">' + defLines(full.d) + '</div>';
    }
    /* 词根分解 */
    var matched = App.roots.findForWord(word, 5);
    if (matched.length) {
      var chips = '';
      matched.forEach(function (r) {
        var tag = r.curated ? '<span class="ck-certain">确定</span>' : '';
        chips += '<span class="root-chip" data-root="' + esc(r.key) + '">' + esc(r.key) + tag + '</span>';
      });
      html += '<div class="db-section"><div class="db-label">词根词缀分解</div><div class="chip-row">' + chips + '</div></div>';
    }
    /* 派生词（同词根的其他词） */
    var rel = [];
    var seen = {};
    matched.forEach(function (r) {
      var words = App.roots.related(r.key);
      [].concat(words.ex, words.rel).forEach(function (w) {
        if (w === word || seen[w]) return;
        seen[w] = true;
        if (rel.length < 12) rel.push(w);
      });
    });
    if (rel.length) {
      var relHtml = rel.map(function (w) {
        var exists = App.vocab.lookupExact(w) || App.store.findByWord(w);
        var cls = exists ? 'rel-chip' : 'rel-chip muted';
        var arrow = exists ? '<span class="ck-arrow">→</span>' : '';
        return '<span class="' + cls + '" data-word="' + esc(w) + '">' + esc(w) + arrow + '</span>';
      }).join('');
      html += '<div class="db-section"><div class="db-label">派生词（同词根）</div><div class="chip-row">' + relHtml + '</div></div>';
    }
    return html;
  }

  /* 打开一个单词的详情（用于派生词跳转） */
  function openWordDetail(word) {
    var full = App.vocab.lookupExact(word);
    if (full) { openDetail(full, false); return; }
    var rec = App.store.findByWord(word);
    if (rec) { openDetail(rec, true); return; }
    toast('词库中无此词');
  }

  /* 打开词根词缀详情弹窗 */
  function openRootDetail(key) {
    var root = App.roots.get(key);
    if (!root) return;
    $('root-title').textContent = '词根词缀';
    var words = App.roots.related(key);
    var html = '<div class="rb-meta"><span class="rb-class">' + esc(App.roots.classZh(root.c)) + '</span>' +
      (root.o ? ' · 来源 ' + esc(root.o) : '') + '</div>' +
      '<div class="rb-meaning">' + esc(root.m) + '</div><div class="rb-rows">';

    if (words.ex.length) {
      html += '<div class="db-section"><div class="db-label">经典例词（' + words.ex.length + '）</div><div class="chip-row">' +
        words.ex.map(function (w) {
          var exists = App.vocab.lookupExact(w);
          var cls = exists ? 'rel-chip' : 'rel-chip muted';
          var arrow = exists ? '<span class="ck-arrow">→</span>' : '';
          return '<span class="' + cls + '" data-word="' + esc(w) + '">' + esc(w) + arrow + '</span>';
        }).join('') + '</div></div>';
    }
    if (words.rel.length) {
      html += '<div class="db-section"><div class="db-label">词库中含此词根（' + words.rel.length + '）</div><div class="chip-row">' +
        words.rel.map(function (w) {
          var exists = App.vocab.lookupExact(w);
          var cls = exists ? 'rel-chip' : 'rel-chip muted';
          var arrow = exists ? '<span class="ck-arrow">→</span>' : '';
          return '<span class="' + cls + '" data-word="' + esc(w) + '">' + esc(w) + arrow + '</span>';
        }).join('') + '</div></div>';
    }
    if (!words.ex.length && !words.rel.length) {
      html += '<div class="rb-empty">词库中暂无此词根的例词</div>';
    }
    html += '</div>';
    $('root-body').innerHTML = html;
    $('root-modal').hidden = false;
  }

  /* ---- 详情弹窗 ---- */
  function openDetail(e, isMine) {
    var modal = $('detail-modal');
    var body = $('detail-body');
    var editBtn = $('detail-edit');
    var saveBtn = $('detail-save');
    var favBtn = $('detail-favorite');
    var delBtn = $('detail-delete');

    $('detail-title').textContent = isMine ? '单词详情' : '词书单词';

    if (isMine) {
      var dup = App.store.findByWord(e.word);
      var isDup = dup && dup.id !== e.id;
      var meta = '添加于 ' + new Date(e.addedAt).toLocaleString();
      if (e.sourceBookId) meta += ' · 来自 ' + App.vocab.bookName(e.sourceBookId);
      body.innerHTML = '<div class="db-word" title="点击发音">' + esc(e.word) + '</div>' +
        '<div class="db-phonetic">' + esc(e.phonetic) + '</div>' +
        '<div class="db-zh">' + posLines(e.zh) + '</div>' +
        detailEnrichmentHtml(e.word) +
        '<div class="db-meta">' + esc(meta) + '</div>' +
        '<div class="db-edit" hidden>' +
        '<input id="edit-phonetic" placeholder="音标" value="' + esc(e.phonetic) + '">' +
        '<textarea id="edit-zh" rows="3" placeholder="中文释义">' + esc(e.zh) + '</textarea>' +
        (isDup ? '<div class="msg err">提示：存在另一个相同单词（' + esc(dup.word) + '）</div>' : '') +
        '</div>';
      editBtn.hidden = false;
      saveBtn.hidden = true;
      favBtn.hidden = true;
      delBtn.hidden = false;
      modal._id = e.id;
      modal._isMine = true;
    } else {
      var existing = App.store.findByWord(e.w);
      var badges = (e.s || []).map(function (bid) {
        return '<span class="badge">' + esc(App.vocab.bookName(bid)) + '</span>';
      }).join('');
      body.innerHTML = '<div class="db-word" title="点击发音">' + esc(e.w) + '</div>' +
        '<div class="db-phonetic">' + esc(e.p) + '</div>' +
        '<div class="db-zh">' + posLines(e.zh) + '</div>' +
        detailEnrichmentHtml(e.w) +
        '<div class="db-meta">' + (badges || '') + '</div>';
      editBtn.hidden = true;
      saveBtn.hidden = true;
      delBtn.hidden = true;
      favBtn.hidden = false;
      favBtn.disabled = !!existing;
      favBtn.textContent = existing ? '已在单词本中' : '＋ 收藏到我的单词本';
      modal._bookId = (e.s && e.s[0]) || state.currentBook;
      modal._word = e.w;
      modal._isMine = false;
    }
    modal.hidden = false;
  }

  function closeDetail() {
    $('detail-modal').hidden = true;
    $('detail-edit').hidden = true;
    $('detail-save').hidden = true;
    $('detail-favorite').hidden = true;
    $('detail-delete').hidden = true;
  }

  function enterEdit() {
    $('detail-edit').hidden = true;
    $('detail-save').hidden = false;
    $('detail-body').querySelector('.db-edit').hidden = false;
  }

  function saveEdit() {
    var modal = $('detail-modal');
    var phonetic = $('edit-phonetic').value.trim();
    var zh = $('edit-zh').value.trim();
    if (!zh) { toast('释义不能为空'); return; }
    App.store.update(modal._id, { phonetic: phonetic, zh: zh });
    closeDetail();
    render();
    toast('已保存');
  }

  /* ---- 打印 ---- */
  var PRINT_KEY = 'vocab.print';

  function getPrintSettings() {
    var d = { en: true, ph: true, zh: true };
    try { return Object.assign(d, JSON.parse(localStorage.getItem(PRINT_KEY) || '{}')); }
    catch (e) { return d; }
  }

  function savePrintSettings(s) {
    try { localStorage.setItem(PRINT_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  function doPrint() {
    var entries = selectedEntries();
    if (!entries.length) { toast('请先勾选要打印的单词'); return; }
    var ps = getPrintSettings();
    $('print-en').checked = !!ps.en;
    $('print-ph').checked = !!ps.ph;
    $('print-zh').checked = !!ps.zh;
    $('print-modal')._entries = entries;
    $('print-modal').hidden = false;
  }

  function buildPrint(entries, ps) {
    if (!ps.en && !ps.ph && !ps.zh) { toast('请至少勾选一项内容'); return; }
    entries.sort(function (a, b) { return a.w < b.w ? -1 : a.w > b.w ? 1 : 0; });
    var title = state.currentBook === 'mine' ? '我的单词本' : App.vocab.bookName(state.currentBook);
    var now = new Date();
    var date = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    var html = '<div class="print-head"><h1>' + esc(title) + '</h1>' +
      '<div class="print-meta">共 ' + entries.length + ' 词 · ' + date + '</div></div><div class="columns">';
    entries.forEach(function (e) {
      html += '<div class="entry">';
      if (ps.en) html += '<span class="w">' + esc(e.w) + '</span>';
      if (ps.ph && e.p) html += '<span class="p">' + esc(e.p) + '</span>';
      if (ps.zh) html += '<span class="zh">' + esc(e.zh) + '</span>';
      html += '</div>';
    });
    html += '</div>';
    $('print-root').innerHTML = html;
    window.print();
  }

  /* ---- 导出 / 导入 ---- */
  function exportJSON() {
    var data = App.store.exportJSON();
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var now = new Date();
    a.href = url;
    a.download = '词书备份-' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('已导出 ' + App.store.count() + ' 个单词');
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var n = App.store.importJSON(reader.result);
        render();
        toast('已导入 ' + n + ' 个单词');
      } catch (err) {
        toast('导入失败：' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  /* ---- 事件绑定 ---- */
  function bind() {
    document.addEventListener('click', function (ev) {
      var t = ev.target;

      /* 侧栏：词根词缀视图 */
      var rv = t.closest('[data-rootview]');
      if (rv) {
        state.mode = state.mode === 'roots' ? 'book' : 'roots';
        state.search = '';
        $('search').value = '';
        state.selected = new Set();
        state.selectMode = false;
        state.visibleCount = 300;
        render();
        return;
      }

      /* 侧栏切换 */
      var bi = t.closest('[data-book]');
      if (bi && document.getElementById('sidebar').contains(bi)) {
        state.currentBook = bi.getAttribute('data-book');
        state.mode = 'book';
        state.search = '';
        $('search').value = '';
        state.selected = new Set();
        state.selectMode = false;
        state.visibleCount = 300;
        App.store.setLastBook(state.currentBook);
        render();
        return;
      }

      /* 行内按钮 */
      var act = t.closest('[data-act]');
      if (act) {
        var row = act.closest('.row');
        var a = act.getAttribute('data-act');
        ev.stopPropagation();
        if (a === 'fav') {
          var w = row.getAttribute('data-word');
          var found = App.vocab.getWords(state.currentBook).find(function (x) { return x.w === w; });
          if (found) {
            var res = App.store.add(found.w, found.p, found.zh, state.currentBook);
            if (res.ok) { render(); toast('已收藏『' + found.w + '』'); }
            else if (res.existing) toast('『' + found.w + '』已在单词本中');
          }
          return;
        }
        if (a === 'edit') {
          var id = row.getAttribute('data-id');
          var rec = App.store.get(id);
          if (rec) { openDetail(rec, true); enterEdit(); }
          return;
        }
        if (a === 'del') {
          var id2 = row.getAttribute('data-id');
          if (confirm('确定删除『' + (App.store.get(id2) || {}).word + '』吗？')) {
            App.store.remove(id2);
            state.selected.delete('m:' + id2);
            render();
          }
          return;
        }
      }

      /* 复选框 */
      var cb = t.closest('input.cb');
      if (cb) {
        ev.stopPropagation();
        if (cb.checked) state.selected.add(cb.getAttribute('data-key'));
        else state.selected.delete(cb.getAttribute('data-key'));
        updatePrintButton();
        return;
      }

      /* 点击单词 → 播放发音 */
      var wSpan = t.closest('.rw');
      if (wSpan && !act && !cb) {
        var word = wSpan.textContent;
        if (word) App.audio.play(word);
        ev.stopPropagation();
        return;
      }

      /* 词根卡片点击 → 词根详情 */
      var rcard = t.closest('.root-card');
      if (rcard && !act) {
        openRootDetail(rcard.getAttribute('data-root'));
        return;
      }

      /* 行点击：peek 遮住时先切换显示，否则打开详情 */
      var r = t.closest('.row');
      if (r && !act) {
        if (App.view.view.peek && r.classList.contains('masked')) {
          r.classList.toggle('revealed');
          return;
        }
        if (r.getAttribute('data-id')) {
          var rec2 = App.store.get(r.getAttribute('data-id'));
          if (rec2) openDetail(rec2, true);
        } else if (r.getAttribute('data-word')) {
          var w2 = r.getAttribute('data-word');
          /* 全局搜索结果行带来源书 data-book；普通内置行无则用当前词书 */
          var bookId = r.getAttribute('data-book') || state.currentBook;
          var found2 = App.vocab.getWords(bookId).find(function (x) { return x.w === w2; });
          if (found2) openDetail(found2, false);
        }
        return;
      }
    });

    /* 显示设置面板 */
    $('btn-display').addEventListener('click', function () { toggleDisplayPanel(); });
    document.addEventListener('click', function (ev) {
      var p = $('display-panel');
      if (p && !p.hidden && !p.contains(ev.target) && !$('btn-display').contains(ev.target)) {
        p.hidden = true;
      }
    });
    function bindViewCheckbox(id, key) {
      $(id).addEventListener('change', function () {
        App.view.set(key, this.checked);
        syncViewPanel();
        renderList();
      });
    }
    bindViewCheckbox('set-hide-en', 'hideEn');
    bindViewCheckbox('set-hide-zh', 'hideZh');
    bindViewCheckbox('set-hide-ph', 'hidePh');
    bindViewCheckbox('set-show-ph', 'showPh');
    bindViewCheckbox('set-peek', 'peek');
    $('set-voice').addEventListener('change', function () {
      App.view.set('voice', this.value);
    });
    $('set-order').addEventListener('change', function () {
      App.view.set('order', this.value);
      syncViewPanel();
      renderList();
      renderHeader();
    });
    $('btn-reshuffle').addEventListener('click', function () {
      reshuffleAll();
      renderList();
    });

    /* 添加弹窗 */
    $('btn-add').addEventListener('click', openAdd);
    $('fab-add').addEventListener('click', openAdd);
    $('btn-cancel').addEventListener('click', closeAdd);
    $('btn-confirm').addEventListener('click', confirmAdd);
    $('add-input').addEventListener('input', onAddInput);
    $('add-phonetic').addEventListener('input', renderManualPreview);
    $('add-zh').addEventListener('input', renderManualPreview);

    $('suggest-dropdown').addEventListener('mousedown', function (ev) {
      var it = ev.target.closest('.sug-item');
      if (it) {
        ev.preventDefault();
        chooseSug(sugList[+it.getAttribute('data-i')]);
      }
    });

    $('add-input').addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') {
        if (sugList.length) { sugIdx = (sugIdx + 1) % sugList.length; renderSuggest(); ev.preventDefault(); }
      } else if (ev.key === 'ArrowUp') {
        if (sugList.length) { sugIdx = (sugIdx - 1 + sugList.length) % sugList.length; renderSuggest(); ev.preventDefault(); }
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        if (sugIdx >= 0 && sugList[sugIdx]) chooseSug(sugList[sugIdx]);
        else confirmAdd();
      } else if (ev.key === 'Escape') {
        closeAdd();
      }
    });

    $('modal').addEventListener('mousedown', function (ev) {
      if (ev.target === $('modal')) closeAdd();
    });

    /* 详情弹窗 */
    $('detail-close').addEventListener('click', closeDetail);
    $('detail-edit').addEventListener('click', enterEdit);
    $('detail-save').addEventListener('click', saveEdit);
    $('detail-favorite').addEventListener('click', function () {
      var modal = $('detail-modal');
      var found = App.vocab.getWords(modal._bookId).find(function (x) { return x.w === modal._word; });
      if (found) {
        var res = App.store.add(found.w, found.p, found.zh, modal._bookId);
        closeDetail();
        render();
        if (res.ok) toast('已收藏『' + found.w + '』');
        else toast('『' + found.w + '』已在单词本中');
      }
    });
    $('detail-delete').addEventListener('click', function () {
      var modal = $('detail-modal');
      var rec = App.store.get(modal._id);
      if (rec && confirm('确定删除『' + rec.word + '』吗？')) {
        App.store.remove(modal._id);
        state.selected.delete('m:' + modal._id);
        closeDetail();
        render();
        toast('已删除');
      }
    });
    $('detail-modal').addEventListener('mousedown', function (ev) {
      if (ev.target === $('detail-modal')) closeDetail();
    });
    $('detail-body').addEventListener('click', function (ev) {
      var w = ev.target.closest('.db-word');
      if (w && w.textContent.trim()) App.audio.play(w.textContent.trim());
      /* 词根 chip → 词根详情 */
      var rc = ev.target.closest('.root-chip');
      if (rc) openRootDetail(rc.getAttribute('data-root'));
      /* 派生词 chip → 该词详情 */
      var rl = ev.target.closest('.rel-chip');
      if (rl) {
        var rw = rl.getAttribute('data-word');
        if (rw && !rl.classList.contains('muted')) openWordDetail(rw);
      }
    });

    /* 词根词缀弹窗 */
    $('root-close').addEventListener('click', function () { $('root-modal').hidden = true; });
    $('root-modal').addEventListener('mousedown', function (ev) {
      if (ev.target === $('root-modal')) $('root-modal').hidden = true;
    });
    $('root-body').addEventListener('click', function (ev) {
      var rl = ev.target.closest('.rel-chip');
      if (rl) {
        var rw = rl.getAttribute('data-word');
        if (rw && !rl.classList.contains('muted')) openWordDetail(rw);
      }
    });

    /* 搜索 */
    $('search').addEventListener('input', function () {
      state.search = $('search').value;
      state.visibleCount = 300;
      renderList();
      renderHeader();
    });
    $('search-scope').addEventListener('change', function () {
      state.searchScope = this.value;
      state.visibleCount = 300;
      renderList();
      renderHeader();
    });

    /* 选择模式 */
    $('btn-select-mode').addEventListener('click', function () {
      state.selectMode = !state.selectMode;
      if (!state.selectMode) { state.selected = new Set(); }
      render();
    });

    /* 全选 / 清空当前视图 */
    $('btn-select-all').addEventListener('click', function () {
      var entries = currentEntries();
      var keys = entries.map(function (e) {
        return state.currentBook === 'mine'
          ? 'm:' + e.id
          : 'bk:' + state.currentBook + ':' + e.w;
      });
      var allSelected = keys.length > 0 && keys.every(function (k) { return state.selected.has(k); });
      if (allSelected) {
        keys.forEach(function (k) { state.selected.delete(k); });
      } else {
        keys.forEach(function (k) { state.selected.add(k); });
      }
      renderList();
      updatePrintButton();
    });

    /* 打印 */
    $('btn-print').addEventListener('click', doPrint);
    $('print-cancel').addEventListener('click', function () { $('print-modal').hidden = true; });
    $('print-confirm').addEventListener('click', function () {
      var ps = { en: $('print-en').checked, ph: $('print-ph').checked, zh: $('print-zh').checked };
      savePrintSettings(ps);
      var entries = $('print-modal')._entries || [];
      $('print-modal').hidden = true;
      buildPrint(entries, ps);
    });
    $('print-modal').addEventListener('mousedown', function (ev) {
      if (ev.target === $('print-modal')) $('print-modal').hidden = true;
    });

    /* 导出 / 导入 */
    $('btn-export').addEventListener('click', exportJSON);
    $('btn-import').addEventListener('click', function () { $('import-file').click(); });
    $('import-file').addEventListener('change', function () {
      if (this.files && this.files[0]) {
        if (confirm('导入会覆盖当前『我的单词本』的全部内容，确定继续吗？')) {
          importFile(this.files[0]);
        }
      }
      this.value = '';
    });

    /* 无限加载 */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          state.visibleCount += 300;
          renderList();
        }
      }, { root: $('word-list'), rootMargin: '200px' });
      io.observe($('list-sentinel'));
    }
  }

  return {
    init: function (st) {
      state = st;
      bind();
      render();
    },
    render: render
  };
})();
