/* 词书 · 词库查询（读取 data/vocab-data.js 生成的 window.WORD_DATA） */
window.App = window.App || {};

App.vocab = (function () {
  var DATA = window.WORD_DATA || { books: [], lists: {}, all: [] };

  function getBook(id) {
    for (var i = 0; i < DATA.books.length; i++) {
      if (DATA.books[i].id === id) return DATA.books[i];
    }
    return null;
  }

  function getWords(id) { return DATA.lists[id] || []; }

  function bookName(id) { var b = getBook(id); return b ? b.name : id; }

  /* 二分查找：第一个 w >= prefix 的位置 */
  function lowerBound(arr, prefix) {
    var lo = 0, hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid].w < prefix) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /* 前缀自动补全，O(log n + K) */
  function suggest(prefix, k) {
    k = k || 10;
    prefix = String(prefix || '').trim().toLowerCase();
    if (!prefix) return [];
    var lo = lowerBound(DATA.all, prefix);
    var out = [];
    for (var i = lo; i < DATA.all.length && out.length < k; i++) {
      if (DATA.all[i].w.indexOf(prefix) !== 0) break;
      out.push(DATA.all[i]);
    }
    return out;
  }

  function lookupExact(word) {
    var lw = String(word || '').trim().toLowerCase();
    if (!lw) return null;
    var i = lowerBound(DATA.all, lw);
    if (DATA.all[i] && DATA.all[i].w === lw) return DATA.all[i];
    return null;
  }

  return {
    books: DATA.books,
    lists: DATA.lists,
    all: DATA.all,
    getBook: getBook,
    getWords: getWords,
    bookName: bookName,
    suggest: suggest,
    lookupExact: lookupExact
  };
})();
