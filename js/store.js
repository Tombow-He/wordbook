/* 词书 · 存储层（localStorage 封装）
 * 只存用户自己记录的单词；内置词书在 data/vocab-data.js 中，不落地存储。
 * 隔离存储实现，未来如需迁移 IndexedDB，只改本文件。
 */
window.App = window.App || {};

App.store = (function () {
  var KEY = 'vocab.userWords';
  var BOOK_KEY = 'vocab.book';
  var words = load();

  function load() {
    try {
      var arr = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(words)); } catch (e) { /* 配额等异常 */ }
  }

  function getAll() { return words.slice(); }
  function get(id) { return words.find(function (w) { return w.id === id; }); }

  function findByWord(word) {
    var lw = String(word || '').trim().toLowerCase();
    return words.find(function (w) { return w.word.toLowerCase() === lw; });
  }

  function add(word, phonetic, zh, sourceBookId) {
    word = String(word || '').trim();
    if (!word) return { ok: false, reason: '单词不能为空' };
    var dup = findByWord(word);
    if (dup) return { ok: false, reason: '已存在', existing: dup };
    var entry = {
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      word: word,
      phonetic: String(phonetic || '').trim(),
      zh: String(zh || '').trim(),
      sourceBookId: sourceBookId || '',
      addedAt: new Date().toISOString()
    };
    words.push(entry);
    save();
    return { ok: true, entry: entry };
  }

  function update(id, patch) {
    var i = words.findIndex(function (w) { return w.id === id; });
    if (i < 0) return false;
    words[i] = Object.assign({}, words[i], patch);
    save();
    return true;
  }

  function remove(id) {
    var n = words.length;
    words = words.filter(function (w) { return w.id !== id; });
    if (words.length !== n) { save(); return true; }
    return false;
  }

  function count() { return words.length; }

  function exportJSON() { return JSON.stringify(words, null, 2); }

  function importJSON(text) {
    var arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error('文件格式错误：顶层应为数组');
    var cleaned = arr
      .filter(function (w) { return w && typeof w.word === 'string' && w.word.trim(); })
      .map(function (w) {
        return {
          id: typeof w.id === 'string' ? w.id : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
          word: w.word.trim(),
          phonetic: w.phonetic || '',
          zh: w.zh || '',
          sourceBookId: w.sourceBookId || '',
          addedAt: w.addedAt || new Date().toISOString()
        };
      });
    words = cleaned;
    save();
    return cleaned.length;
  }

  function getLastBook() { return localStorage.getItem(BOOK_KEY) || 'mine'; }
  function setLastBook(b) { localStorage.setItem(BOOK_KEY, b); }

  return {
    getAll: getAll,
    get: get,
    findByWord: findByWord,
    add: add,
    update: update,
    remove: remove,
    count: count,
    exportJSON: exportJSON,
    importJSON: importJSON,
    getLastBook: getLastBook,
    setLastBook: setLastBook
  };
})();
