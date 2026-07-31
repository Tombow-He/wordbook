/* 词书 · 词根/前缀/后缀 查询模块
 * 读取 data/wordroot.js 生成的 window.WORDROOT_DATA。
 * 匹配规则：必须与 tools/build.mjs 保持同步（rootVariants/rootNormalize/rootMatch）。
 */
window.App = window.App || {};

App.roots = (function () {
  var DATA = window.WORDROOT_DATA || { version: 1, roots: [] };
  var roots = DATA.roots || [];

  var CLASS_ZH = {
    'root': '词根',
    'prefix': '前缀',
    'adjective-forming suffix': '形容词后缀',
    'noun-forming suffix': '名词后缀',
    'verb-forming suffix': '动词后缀',
    'adverb-forming suffix': '副词后缀',
    'adjective- and noun-forming suffix': '形容词/名词后缀'
  };

  function classZh(c) { return CLASS_ZH[c] || c || '词根'; }

  /* ---- 匹配规则（与 build.mjs 同步） ---- */
  function variants(key) {
    return String(key || '').split(',').map(function (v) { return v.trim(); }).filter(Boolean);
  }
  function norm(v) {
    return v.replace(/^[-]/g, '').replace(/[-]$/g, '').replace(/\d+$/g, '').toLowerCase();
  }
  function matchVariant(word, variant) {
    var n = norm(variant);
    if (!n) return false;
    if (variant.endsWith('-')) return word.length > n.length && word.indexOf(n) === 0;
    if (variant.startsWith('-')) return word.length > n.length && word.lastIndexOf(n) === word.length - n.length;
    return n.length >= 4 && word.length > n.length && word.indexOf(n) >= 0;
  }
  function hits(word, variants) {
    for (var i = 0; i < variants.length; i++) if (matchVariant(word, variants[i])) return true;
    return false;
  }

  function count() { return roots.length; }
  function get(key) {
    for (var i = 0; i < roots.length; i++) if (roots[i].r === key) return roots[i];
    return null;
  }

  /* 搜索词根：匹配词根串/释义/来源/例词 */
  function search(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return roots;
    return roots.filter(function (r) {
      return r.r.toLowerCase().indexOf(q) >= 0 ||
        (r.m || '').toLowerCase().indexOf(q) >= 0 ||
        (r.o || '').toLowerCase().indexOf(q) >= 0 ||
        (r.ex || []).some(function (w) { return w.toLowerCase().indexOf(q) >= 0; });
    });
  }

  /* 单词 → 匹配的词根列表：{key, curated(词在ex中=确定)} */
  function findForWord(word, max) {
    word = String(word || '').toLowerCase().trim();
    if (!word) return [];
    max = max || 5;
    var out = [];
    for (var i = 0; i < roots.length && out.length < max; i++) {
      var r = roots[i];
      if (hits(word, variants(r.r))) {
        out.push({ key: r.r, curated: (r.ex || []).indexOf(word) >= 0 });
      }
    }
    return out;
  }

  /* 词根的派生词：ex（经典，精确）+ rel（词库含此词根） */
  function related(key) {
    var r = get(key);
    if (!r) return { ex: [], rel: [] };
    return { ex: r.ex || [], rel: r.rel || [] };
  }

  return {
    count: count,
    get: get,
    search: search,
    findForWord: findForWord,
    related: related,
    classZh: classZh
  };
})();
