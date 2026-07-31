/* 词书 · 单词发音模块
 * 真人发音：有道美音/英音，百度兜底。
 * 用 <audio> 直接加载播放（不 fetch，绕开 CORS 限制）；
 * 浏览器 HTTP 缓存会自动复用已下载过的音频，离线也基本可用。
 */
window.App = window.App || {};

App.audio = (function () {
  function getVoice() {
    return App.view.view.voice || 'us';   // 'us' | 'uk'
  }

  var playCache = {};   // word -> 最近点击时间（防止连点重复请求）
  var audioEl = null;   // 复用单个 Audio 元素

  function urlFor(word) {
    if (getVoice() === 'uk') {
      return 'https://dict.youdao.com/dictvoice?type=1&audio=' + encodeURIComponent(word);
    }
    return 'https://dict.youdao.com/dictvoice?type=0&audio=' + encodeURIComponent(word);
  }

  function play(word) {
    if (!window.Audio) return;
    word = String(word || '').trim();
    if (!word) return;

    var now = Date.now();
    if (playCache[word] && now - playCache[word] < 1200) return;  // 1.2s 内防重复
    playCache[word] = now;

    if (!audioEl) {
      audioEl = new Audio();
      /* 加载失败 → 有道兜底百度 */
      audioEl.addEventListener('error', function () {
        if (audioEl._fallbackUsed) return;
        audioEl._fallbackUsed = true;
        var w = audioEl._word;
        audioEl.src = 'https://fanyi.baidu.com/gettts?lan=en&text=' + encodeURIComponent(w) + '&spd=3&source=web';
        audioEl.play().catch(function () {});
      });
    }
    audioEl._word = word;
    audioEl._fallbackUsed = false;
    audioEl.src = urlFor(word);
    audioEl.play().catch(function () { /* 自动播放被拒等，静默 */ });
  }

  return { play: play, getVoice: getVoice };
})();
