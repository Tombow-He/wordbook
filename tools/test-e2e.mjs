#!/usr/bin/env node
/* 词书 · 端到端测试（headless Edge + CDP）
 * 前置：先运行 node tools/serve.mjs 8000
 * 运行：node tools/test-e2e.mjs
 */
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9222;
const APP_URL = 'http://localhost:8000/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

async function main() {
  const profile = fs.mkdtempSync(os.tmpdir() + '/wordbook-edge-');
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile,
    APP_URL
  ], { stdio: 'ignore' });

  /* 等待 CDP 就绪 */
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(300);
    try {
      const list = await (await fetch(`http://localhost:${CDP_PORT}/json`)).json();
      target = list.find((t) => t.type === 'page');
    } catch (e) { /* not ready */ }
  }
  if (!target) { console.error('CDP 未就绪'); child.kill(); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++msgId;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  async function evalJS(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) {
      const d = r.result.exceptionDetails.exception;
      throw new Error('JS 异常: ' + (d ? d.description : JSON.stringify(r.result.exceptionDetails)));
    }
    return r.result.result.value;
  }

  /* 等待应用加载 */
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const ready = await evalJS('window.App && App.vocab && App.vocab.all.length > 0');
      if (ready) break;
    } catch (e) { /* retry */ }
  }

  console.log('== 1. 数据加载 ==');
  const total = await evalJS('App.vocab.all.length');
  check('自动补全词库已加载 (' + total + ' 词)', total > 20000, total);
  const books = await evalJS('App.vocab.books.map(b => b.name + ":" + b.count).join(", ")');
  console.log('  · 内置词书: ' + books);

  console.log('== 2. 自动补全 ==');
  const sug = await evalJS('JSON.stringify(App.vocab.suggest("aband", 5).map(e => e.w))');
  const sugArr = JSON.parse(sug);
  check('suggest("aband") 返回候选', sugArr.length > 0 && sugArr.every(w => w.startsWith('aband')), sugArr);
  const sugZoo = await evalJS('App.vocab.suggest("zoo", 3).map(e=>e.w).join(",")');
  check('suggest("zoo") 有结果', sugZoo.indexOf('zoo') === 0, sugZoo);

  console.log('== 3. 初始状态 ==');
  const cnt0 = await evalJS('App.store.count()');
  check('我的单词本初始为空', cnt0 === 0, cnt0);

  console.log('== 4. 添加单词（含重复拦截） ==');
  const addRes = await evalJS('JSON.stringify(App.store.add("abandon", "/ə\'bændən/", "v. 放弃；抛弃", "cet4"))');
  check('添加 abandon 成功', JSON.parse(addRes).ok === true, addRes);
  const addRes2 = await evalJS('App.store.add("abandon").ok');
  check('重复词被拦截', addRes2 === false, addRes2);
  const cnt1 = await evalJS('App.store.count()');
  check('单词本现有 1 词', cnt1 === 1, cnt1);

  console.log('== 5. 界面渲染 ==');
  await evalJS('App.ui.render()');
  const rows = await evalJS('document.querySelectorAll("#word-list .row").length');
  check('列表渲染 1 行', rows === 1, rows);
  const fab = await evalJS('document.getElementById("fab-add") !== null && getComputedStyle(document.getElementById("fab-add")).position === "fixed"');
  check('全局浮动按钮存在且 position:fixed', fab === true, fab);
  const fabClick = await evalJS('document.getElementById("fab-add").click(); document.getElementById("modal").hidden === false');
  check('点击浮动按钮打开添加弹窗', fabClick === true, fabClick);
  await evalJS('document.getElementById("btn-cancel").click()');

  console.log('== 5.5. 显示设置 ==');
  /* 屏蔽中文 → 中文释义带 blur */
  await evalJS('App.view.set("hideZh", true); App.ui.render();');
  const zhBlur = await evalJS('document.querySelector("#word-list .row .rz").classList.contains("blur")');
  check('屏蔽中文后释义模糊', zhBlur === true, zhBlur);
  await evalJS('App.view.set("hideZh", false); App.ui.render();');
  const zhClear = await evalJS('!document.querySelector("#word-list .row .rz").classList.contains("blur")');
  check('取消屏蔽中文后恢复', zhClear === true, zhClear);
  /* 屏蔽英文 → 单词带 blur */
  await evalJS('App.view.set("hideEn", true); App.ui.render();');
  const enBlur = await evalJS('document.querySelector("#word-list .row .rw").classList.contains("blur")');
  check('屏蔽英文后单词模糊', enBlur === true, enBlur);
  await evalJS('App.view.set("hideEn", false); App.ui.render();');
  /* 屏蔽音标 → 行有 hide-ph class，音标不可见 */
  await evalJS('App.view.set("hidePh", true); App.ui.render();');
  const phHidden = await evalJS('document.querySelector("#word-list .row").classList.contains("hide-ph")');
  check('屏蔽音标后行隐藏音标', phHidden === true, phHidden);
  await evalJS('App.view.set("hidePh", false); App.ui.render();');
  /* peek 模式 → 行 masked，点击显示 */
  await evalJS('App.view.set("peek", true); App.ui.render();');
  const peekMasked = await evalJS('document.querySelector("#word-list .row").classList.contains("masked")');
  check('peek 模式行被遮住', peekMasked === true, peekMasked);
  await evalJS('document.querySelector("#word-list .row").click()');
  const peekRevealed = await evalJS('document.querySelector("#word-list .row").classList.contains("revealed")');
  check('点击后显示内容', peekRevealed === true, peekRevealed);
  await evalJS('App.view.set("peek", false); App.ui.render();');
  /* 音标总开关关闭 */
  await evalJS('App.view.set("showPh", false); App.ui.render();');
  const showPhOff = await evalJS('document.querySelector("#word-list .row").classList.contains("hide-ph")');
  check('音标开关关闭后隐藏', showPhOff === true, showPhOff);
  await evalJS('App.view.set("showPh", true); App.ui.render();');
  console.log('== 5.6. 发音 ==');
  const audioExists = await evalJS('typeof App.audio !== "undefined" && typeof App.audio.play === "function"');
  check('发音模块已加载', audioExists === true, audioExists);
  const voiceDefault = await evalJS('App.audio.getVoice()');
  check('默认美音', voiceDefault === 'us', voiceDefault);
  await evalJS('App.view.set("voice", "uk")');
  const voiceUk = await evalJS('App.audio.getVoice()');
  check('切换英音生效', voiceUk === 'uk', voiceUk);
  await evalJS('App.view.set("voice", "us")');
  /* 点击单词应触发发音（不报错；真实播放 headless 下受限） */
  /* 发音：headless 下不真播音频（外部音频可能引发渲染进程竞态），只验证 API 完整 */
  const audioApi = await evalJS('(function(){ return { play: typeof App.audio.play, getVoice: typeof App.audio.getVoice, urlSrc: "audio-src-ok" }; })()');
  check('发音 API 完整', audioApi.play === 'function' && audioApi.getVoice === 'function', audioApi);

  console.log('== 5.7. 排序（正序/乱序） ==');
  /* 切到 CET-4 看首行 */
  await evalJS('document.querySelector("#sidebar [data-book=cet4]").click()');
  const ascFirst = await evalJS('document.querySelector("#word-list .row .rw").textContent');
  check('正序首行为 abandon', ascFirst === 'abandon', ascFirst);
  /* 切换乱序 */
  await evalJS('App.view.set("order", "random"); App.ui.render();');
  const randFirst = await evalJS('document.querySelector("#word-list .row .rw").textContent');
  check('乱序首行非 abandon', randFirst !== 'abandon', randFirst);
  const randStable = await evalJS('(function(){ var a = App.state.currentBook; App.ui.render(); return document.querySelector("#word-list .row .rw").textContent; })()');
  check('乱序稳定可复现', randStable === randFirst, randStable);
  /* 恢复正序 */
  await evalJS('App.view.set("order", "asc"); App.ui.render();');
  const ascBack = await evalJS('document.querySelector("#word-list .row .rw").textContent');
  check('恢复正序首行 abandon', ascBack === 'abandon', ascBack);
  /* 搜索正常（之前 e.word bug）：先清空再搜，避免残留状态 */
  await evalJS('(function(){ var s = document.getElementById("search"); s.value = ""; s.dispatchEvent(new Event("input")); })()');
  await evalJS('(function(){ var s = document.getElementById("search"); s.value = "ability"; s.dispatchEvent(new Event("input")); })()');
  await evalJS('App.ui.render()');
  const searchRows = await evalJS('document.querySelectorAll("#word-list .row").length');
  check('内置词书搜索正常（无崩溃）', searchRows >= 1, searchRows);
  await evalJS('(function(){ var s = document.getElementById("search"); s.value = ""; s.dispatchEvent(new Event("input")); })()');
  await evalJS('document.querySelector("#sidebar [data-book=mine]").click()');

  /* 设置面板开关同步：打开面板 → 勾选"遮住全部" → peek 生效 */
  await evalJS('document.getElementById("btn-display").click()');
  const panelOpen = await evalJS('document.getElementById("display-panel").hidden === false');
  check('显示设置面板可打开', panelOpen === true, panelOpen);
  await evalJS('document.getElementById("set-peek").click()');
  const panelPeek = await evalJS('App.view.view.peek === true');
  check('面板勾选遮住后 peek 生效', panelPeek === true, panelPeek);
  await evalJS('document.getElementById("set-peek").click()'); // 取消
  await evalJS('document.getElementById("btn-display").click()'); // 关闭面板
  await evalJS('App.ui.render()');
  const rowText = await evalJS('(function(){ var r = document.querySelector("#word-list .row"); return r ? r.textContent : "无行"; })()');
  check('行内包含单词和释义', rowText.includes('abandon') && rowText.includes('放弃'), rowText);

  console.log('== 5.8. 全局搜索 ==');
  /* 搜索范围切到"全部词书" */
  await evalJS('document.querySelector("#sidebar [data-book=cet4]").click()');
  await evalJS('document.getElementById("search-scope").value = "all"; document.getElementById("search-scope").dispatchEvent(new Event("change"))');
  const gSearch = await evalJS('(function(){ var s = document.getElementById("search"); s.value = "善良"; s.dispatchEvent(new Event("input")); return document.querySelectorAll("#word-list .row").length; })()');
  check('中文全局搜索有结果', gSearch > 0, gSearch);
  const gSearchHasBook = await evalJS('(function(){ var rows = document.querySelectorAll("#word-list .row"); for (var i=0;i<rows.length;i++){ var b = rows[i].querySelector(".badge"); if (b) return b.textContent; } return null; })()');
  check('全局搜索结果带来源书', typeof gSearchHasBook === 'string' && gSearchHasBook.length > 0, gSearchHasBook);
  const gSearchEn = await evalJS('(function(){ var s = document.getElementById("search"); s.value = "ability"; s.dispatchEvent(new Event("input")); return document.querySelectorAll("#word-list .row").length; })()');
  check('英文全局搜索有结果', gSearchEn > 0, gSearchEn);
  /* 恢复 */
  await evalJS('(function(){ var s = document.getElementById("search"); s.value = ""; s.dispatchEvent(new Event("input")); })()');
  await evalJS('document.getElementById("search-scope").value = "book"; document.getElementById("search-scope").dispatchEvent(new Event("change"))');
  await evalJS('document.querySelector("#sidebar [data-book=mine]").click()');

  console.log('== 5.9. 词性分行 ==');
  await evalJS('document.querySelector("#sidebar [data-book=cet4]").click()');
  await evalJS('document.querySelector("#word-list .row").click()');
  const posLines = await evalJS('document.querySelectorAll("#detail-body .pos-line").length');
  check('详情释义按词性分行', posLines >= 1, posLines);
  await evalJS('document.getElementById("detail-close").click()');
  await evalJS('document.querySelector("#sidebar [data-book=mine]").click()');

  console.log('== 5.10. 词典模块（释义/词根/派生词） ==');
  const rootsCount = await evalJS('App.roots.count()');
  check('词根词缀数据加载 (' + rootsCount + ')', rootsCount === 611, rootsCount);
  const telMatch = await evalJS('JSON.stringify(App.roots.findForWord("telescope").map(r => ({k:r.key, c:r.curated})))');
  const telArr = JSON.parse(telMatch);
  check('telescope 词根匹配 scop/tele', telArr.some(r => r.k.indexOf('scop') >= 0) && telArr.some(r => r.k.indexOf('tele') >= 0) && telArr.every(r => r.c), telMatch);
  /* 详情增强：打开 telescope 看释义/词根 */
  await evalJS('document.querySelector("#sidebar [data-book=cet4]").click()');
  await evalJS('(function(){ var s = document.getElementById("search"); s.value = "telescope"; s.dispatchEvent(new Event("input")); })()');
  const telRow = await evalJS('(function(){ var rows = document.querySelectorAll("#word-list .row"); for (var i=0;i<rows.length;i++){ if (rows[i].getAttribute("data-word") === "telescope") return rows[i]; } return null; })()');
  if (telRow) {
    await evalJS('document.querySelector("#word-list .row[data-word=telescope]").click()');
    const dbDef = await evalJS('(function(){ var d = document.querySelector("#detail-body .db-def"); return d ? d.textContent.length : 0; })()');
    check('详情显示英文释义', dbDef > 20, dbDef);
    const dbRoots = await evalJS('document.querySelectorAll("#detail-body .root-chip").length');
    check('详情显示词根chips', dbRoots >= 1, dbRoots);
    const dbRel = await evalJS('document.querySelectorAll("#detail-body .rel-chip").length');
    check('详情显示派生词chips', dbRel >= 1, dbRel);
    /* 点派生词 → 跳转 */
    const relClick = await evalJS('(function(){ var c = document.querySelector("#detail-body .rel-chip:not(.muted)"); if (!c) return "no-chip"; var w = c.getAttribute("data-word"); c.click(); return "clicked:" + w; })()');
    check('点派生词跳转', relClick.indexOf('clicked:') === 0, relClick);
    await evalJS('document.getElementById("detail-close").click()');
  } else {
    check('找到 telescope 行', false, '未找到');
  }
  await evalJS('(function(){ var s = document.getElementById("search"); s.value = ""; s.dispatchEvent(new Event("input")); })()');
  await evalJS('document.querySelector("#sidebar [data-book=mine]").click()');

  console.log('== 5.11. 词根词缀浏览模块 ==');
  await evalJS('document.getElementById("btn-roots").click()');
  const rootsMode = await evalJS('App.state.mode === "roots"');
  check('进入词根词缀模式', rootsMode === true, rootsMode);
  const rootCards = await evalJS('document.querySelectorAll("#word-list .root-card").length');
  check('渲染词根卡片', rootCards >= 100, rootCards);
  const rootTitle = await evalJS('document.getElementById("book-title").textContent');
  check('标题为词根词缀', rootTitle === '词根词缀', rootTitle);
  /* 模块内搜索 */
  await evalJS('(function(){ var s = document.getElementById("search"); s.value = "scope"; s.dispatchEvent(new Event("input")); })()');
  const rootSearch = await evalJS('document.querySelectorAll("#word-list .root-card").length');
  check('词根模块搜索过滤', rootSearch >= 1, rootSearch);
  await evalJS('(function(){ var s = document.getElementById("search"); s.value = ""; s.dispatchEvent(new Event("input")); })()');
  /* 点词根卡片 → root-modal */
  await evalJS('document.querySelector("#word-list .root-card").click()');
  const rootModalOpen = await evalJS('document.getElementById("root-modal").hidden === false');
  check('词根详情弹窗打开', rootModalOpen === true, rootModalOpen);
  const rootModalHasEx = await evalJS('document.querySelectorAll("#root-body .rel-chip").length > 0');
  check('词根弹窗含例词', rootModalHasEx === true, rootModalHasEx);
  await evalJS('document.getElementById("root-close").click()');
  await evalJS('document.getElementById("btn-roots").click()'); // 退出词根模式
  await evalJS('document.querySelector("#sidebar [data-book=mine]").click()');

  console.log('== 5.12. 全局快捷键 ==');
  /* / 键聚焦搜索 */
  await evalJS('document.body.click()'); // 确保焦点不在输入框
  await evalJS('document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }))');
  const slashFocus = await evalJS('document.activeElement === document.getElementById("search")');
  check('/ 键聚焦搜索', slashFocus === true, slashFocus);
  /* Ctrl+K 聚焦搜索 */
  await evalJS('document.body.click()');
  await evalJS('document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))');
  const ctrlKFocus = await evalJS('document.activeElement === document.getElementById("search")');
  check('Ctrl+K 聚焦搜索', ctrlKFocus === true, ctrlKFocus);
  /* N 键打开添加弹窗 */
  await evalJS('document.body.click()');
  await evalJS('document.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true }))');
  const nOpen = await evalJS('document.getElementById("modal").hidden === false');
  check('N 键打开添加弹窗', nOpen === true, nOpen);
  await evalJS('document.getElementById("btn-cancel").click()');
  /* → 键切词书（当前 mine → 下一个 zk） */
  await evalJS('document.querySelector("#sidebar [data-book=mine]").click()');
  await evalJS('document.body.click()');
  await evalJS('document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))');
  const rightBook = await evalJS('App.state.currentBook');
  check('→ 键切换词书', rightBook === 'zk', rightBook);
  /* ← 键切回 */
  await evalJS('document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))');
  const leftBook = await evalJS('App.state.currentBook');
  check('← 键切换词书', leftBook === 'mine', leftBook);
  /* 输入框内不触发（输入 n 不弹添加）：在真实输入框上派发 keydown */
  await evalJS('document.querySelector("#sidebar [data-book=zk]").click()');
  const inInput = await evalJS('(function(){ var s = document.getElementById("search"); var before = document.getElementById("modal").hidden; s.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true })); return before === document.getElementById("modal").hidden; })()');
  check('输入框内 N 不触发添加', inInput === true, inInput);
  await evalJS('document.querySelector("#sidebar [data-book=mine]").click()');

  console.log('== 6. 词书切换 ==');
  await evalJS('document.querySelector("#sidebar [data-book=cet4]").click()');
  const cet4Title = await evalJS('document.getElementById("book-title").textContent');
  check('标题切换为 CET-4', cet4Title === 'CET-4', cet4Title);
  const cet4Rows = await evalJS('document.querySelectorAll("#word-list .row").length');
  check('CET-4 分页渲染 300 行', cet4Rows === 300, cet4Rows);
  const cet4First = await evalJS('document.querySelector("#word-list .row .rw").textContent');
  check('CET-4 首行单词合理', /^[a-z]/.test(cet4First), cet4First);
  /* 收藏到我的单词本（第 2 行是 ability，与已添加的 abandon 不重复） */
  await evalJS('document.querySelectorAll("#word-list .row")[1].querySelector("[data-act=fav]").click()');
  const cnt2 = await evalJS('App.store.count()');
  const favWord = await evalJS('App.store.getAll().map(w=>w.word).join(",")');
  check('收藏后单词本 2 词 (' + favWord + ')', cnt2 === 2 && favWord.includes('ability'), favWord);

  console.log('== 7. 批量选择 + 打印 ==');
  await evalJS('document.querySelector("#sidebar [data-book=mine]").click()');
  const mineRows = await evalJS('document.querySelectorAll("#word-list .row").length');
  check('切回单词本 2 行', mineRows === 2, mineRows);
  /* 非选择模式下不应有复选框占位 */
  const noCb = await evalJS('document.querySelectorAll("#word-list input.cb").length');
  check('非选择模式无复选框占位', noCb === 0, noCb);
  /* 进入选择模式后再勾选 */
  await evalJS('document.getElementById("btn-select-mode").click()');
  const cbAfterSelect = await evalJS('document.querySelectorAll("#word-list input.cb").length');
  check('选择模式出现复选框', cbAfterSelect === 2, cbAfterSelect);
  /* 勾选含 ability 的那一行（乱序下位置可能变化） */
  await evalJS('(function(){ var rows = document.querySelectorAll("#word-list .row"); for (var i=0;i<rows.length;i++){ if (rows[i].textContent.indexOf("ability") >= 0){ rows[i].querySelector("input.cb").click(); break; } } })()');
  const printVisible = await evalJS('document.getElementById("btn-print").hidden === false');
  check('打印按钮出现', printVisible === true, printVisible);

  /* 打印设置弹窗 */
  await evalJS('document.getElementById("btn-print").click()');
  const printModalOpen = await evalJS('document.getElementById("print-modal").hidden === false');
  check('打印设置弹窗打开', printModalOpen === true, printModalOpen);
  const printDefaults = await evalJS('["print-en","print-ph","print-zh"].every(id => document.getElementById(id).checked)');
  check('打印默认全勾选', printDefaults === true, printDefaults);
  await evalJS('document.getElementById("print-confirm").click()');
  const printHtml = await evalJS('document.getElementById("print-root").innerHTML');
  check('打印内容含选中单词与标题', printHtml.includes('ability') && printHtml.includes('我的单词本'), printHtml.slice(0, 160));
  const printCount = await evalJS('(document.getElementById("print-root").innerHTML.match(/class="entry"/g) || []).length');
  check('打印条目数 = 1', printCount === 1, printCount);
  const printHasAll = await evalJS('document.querySelector("#print-root .entry").textContent.indexOf("能力") >= 0');
  check('打印含中文释义', printHasAll === true, printHasAll);

  console.log('== 7.4. 打印选项（取消中文） ==');
  await evalJS('document.getElementById("btn-print").click()');
  await evalJS('document.getElementById("print-zh").click()');
  await evalJS('document.getElementById("print-confirm").click()');
  const printNoZh = await evalJS('document.getElementById("print-root").innerHTML');
  check('取消中文后打印不含释义', !/能力|仁慈|放弃/.test(printNoZh), printNoZh.slice(0, 160));
  const printNoZhCount = await evalJS('(document.getElementById("print-root").innerHTML.match(/class="entry"/g) || []).length');
  check('取消中文后条目仍在', printNoZhCount === 1, printNoZhCount);

  console.log('== 7.5. 真实 PDF 生成（@media print） ==');
  /* 恢复全勾选再生成 PDF */
  await evalJS('localStorage.removeItem("vocab.print"); document.getElementById("btn-print").click(); document.getElementById("print-confirm").click();');
  const pdf = await send('Page.printToPDF', { printBackground: false });
  const pdfBuf = Buffer.from(pdf.result.data, 'base64');
  const pdfPath = os.tmpdir() + '/wordbook-print-test.pdf';
  fs.writeFileSync(pdfPath, pdfBuf);
  const isPdf = pdfBuf.slice(0, 4).toString() === '%PDF';
  check('生成合法 PDF (' + (pdfBuf.length / 1024).toFixed(1) + ' KB)', isPdf && pdfBuf.length > 500, pdfBuf.length);

  console.log('== 8. 导出 / 导入备份 ==');
  const exported = await evalJS('App.store.exportJSON()');
  check('导出为合法 JSON 数组', (() => { try { return Array.isArray(JSON.parse(exported)) && JSON.parse(exported).length === 2; } catch (e) { return false; } })(), exported.slice(0, 60));
  const imported = await evalJS('App.store.importJSON(' + JSON.stringify(JSON.stringify([{ word: 'hello', phonetic: '/hə\'ləʊ/', zh: '你好' }])) + ')');
  check('导入 1 条后返回 1', imported === 1, imported);
  const cnt3 = await evalJS('App.store.count()');
  check('导入覆盖为 1 词', cnt3 === 1, cnt3);
  await evalJS('App.store.importJSON(' + JSON.stringify(exported) + ')');
  const cnt4 = await evalJS('App.store.count()');
  check('还原备份为 2 词', cnt4 === 2, cnt4);

  console.log('== 9. 详情 / 编辑 / 删除 ==');
  await evalJS('document.querySelector("#word-list .row").click()');
  const detailOpen = await evalJS('document.getElementById("detail-modal").hidden === false');
  check('点击行打开详情', detailOpen === true);
  await evalJS('document.getElementById("detail-close").click()');
  await evalJS('App.store.remove(App.store.getAll()[0].id); App.ui.render()');
  const cnt5 = await evalJS('App.store.count()');
  check('删除后 1 词', cnt5 === 1, cnt5);

  ws.close();
  child.kill();
  console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
