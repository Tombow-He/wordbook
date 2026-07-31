/* 词书 · 显示设置（屏蔽中文/英文/音标、遮住点击显示）
 * 状态持久化在 localStorage，切换词书时保留。
 */
window.App = window.App || {};

App.view = (function () {
  var KEY = 'vocab.view';
  var defaults = {
    hideZh: false,     // 屏蔽中文
    hideEn: false,     // 屏蔽英文
    hidePh: false,     // 屏蔽音标
    peek: false,       // 遮住全部，点击才显示
    showPh: true,      // 音标显示开关（默认开）
    voice: 'us',       // 发音口音：'us' 美音 / 'uk' 英音
    order: 'asc'       // 词书排序：'asc' 正序 / 'random' 乱序
  };

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
    return Object.assign({}, defaults, s);
  }

  var view = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(view)); } catch (e) { /* ignore */ } }

  function set(key, val) {
    view[key] = val;
    save();
  }

  /* 某一行是否遮住（peek 模式 = 所有内容遮住，点击才显示） */
  function rowMasked() {
    return !!view.peek || view.hideZh || view.hideEn || view.hidePh;
  }

  return {
    view: view,
    set: set,
    rowMasked: rowMasked,
    defaults: defaults
  };
})();
