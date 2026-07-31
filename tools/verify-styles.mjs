#!/usr/bin/env node
/* 词书 · 样式验证（print media 列布局 / 移动端布局 / 无 JS 报错） */
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9224;
const APP_URL = 'http://localhost:8000/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(os.tmpdir() + '/wordbook-style-');
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--window-size=1280,800',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile,
    APP_URL
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(300);
    try {
      const list = await (await fetch(`http://localhost:${CDP_PORT}/json`)).json();
      target = list.find((t) => t.type === 'page');
    } catch (e) { }
  }
  if (!target) { console.error('CDP 未就绪'); child.kill(); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception.description || 'unknown');
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++msgId;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJS = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) {
      errors.push(JSON.stringify(r.result.exceptionDetails).slice(0, 200));
      return undefined;
    }
    return r.result.result.value;
  };

  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await evalJS('window.App && App.vocab.all.length > 0')) break;
  }

  /* 准备单词 */
  await evalJS(`
    App.store.importJSON(JSON.stringify([
      { word: 'abandon', phonetic: "/ə'bændən/", zh: 'v. 放弃；抛弃', addedAt: new Date().toISOString() },
      { word: 'benevolent', phonetic: "/bə'nevələnt/", zh: 'a. 仁慈的；善意的', addedAt: new Date().toISOString() },
      { word: 'serendipity', phonetic: "/ˌserən'dɪpəti/", zh: 'n. 意外发现珍奇事物的本领', addedAt: new Date().toISOString() }
    ]));
    App.ui.render();
    document.querySelectorAll('#word-list input.cb').forEach(c => c.click());
    document.getElementById('btn-print').click();
    document.getElementById('print-confirm').click();
  `);
  await sleep(300);

  /* 打印媒体样式 */
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  await sleep(200);
  const print = await evalJS(`
    (function(){
      var app = getComputedStyle(document.getElementById('app')).display;
      var pr = getComputedStyle(document.getElementById('print-root')).display;
      var cols = getComputedStyle(document.querySelector('#print-root .columns')).columnCount;
      return { appDisplay: app, printDisplay: pr, columnCount: cols };
    })()
  `);
  console.log('打印媒体: #app=' + print.appDisplay + ', #print-root=' + print.printDisplay + ', 列数=' + print.columnCount);
  console.log(print.appDisplay === 'none' && print.printDisplay === 'block' && print.columnCount === '3'
    ? '  ✅ 打印布局正确（App 隐藏、打印区显示、3 列）'
    : '  ❌ 打印布局异常');

  /* 恢复屏幕媒体，检查移动端 */
  await send('Emulation.setEmulatedMedia', { media: '' });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  const mobile = await evalJS(`
    (function(){
      var sb = getComputedStyle(document.getElementById('sidebar')).flexDirection;
      return { sidebarDirection: sb };
    })()
  `);
  console.log('移动端(390px): 侧栏 flexDirection=' + mobile.sidebarDirection);
  console.log(mobile.sidebarDirection === 'row' ? '  ✅ 移动端侧栏为横向书签栏' : '  ❌ 移动端布局异常');

  await send('Emulation.clearDeviceMetricsOverride');

  console.log('JS 运行错误数: ' + errors.length);
  errors.forEach((e) => console.log('  ⚠️ ' + e.slice(0, 160)));
  console.log(errors.length === 0 ? '  ✅ 无 JS 报错' : '  ❌ 存在 JS 报错');

  ws.close();
  child.kill();
  process.exit(errors.length === 0 && print.appDisplay === 'none' && print.printDisplay === 'block' && print.columnCount === '3' && mobile.sidebarDirection === 'row' ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
