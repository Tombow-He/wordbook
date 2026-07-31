#!/usr/bin/env node
/* 词书 · 截图验证（headless Edge + CDP）
 * 前置：先运行 node tools/serve.mjs 8000
 * 运行：node tools/screenshot.mjs
 */
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9223;
const APP_URL = 'http://localhost:8000/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(os.tmpdir() + '/wordbook-shot-');
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
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++msgId;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJS = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return r.result.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    const p = os.tmpdir() + '/wordbook-' + name + '.jpg';
    fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'));
    console.log('截图: ' + p);
    return p;
  };

  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await evalJS('window.App && App.vocab.all.length > 0')) break;
  }

  /* 准备数据：往单词本加几个词 */
  await evalJS(`
    App.store.importJSON(JSON.stringify([
      { word: 'abandon', phonetic: "/ə'bændən/", zh: 'v. 放弃；抛弃', addedAt: new Date().toISOString() },
      { word: 'benevolent', phonetic: "/bə'nevələnt/", zh: 'a. 仁慈的；善意的', addedAt: new Date().toISOString() },
      { word: 'serendipity', phonetic: "/ˌserən'dɪpəti/", zh: 'n. 意外发现珍奇事物的本领', addedAt: new Date().toISOString() }
    ]));
    App.ui.render();
    document.querySelector('[data-book=cet4]').click();
  `);
  await sleep(500);
  await shot('cet4-list');

  /* 我的单词本 */
  await evalJS('document.querySelector("[data-book=mine]").click()');
  await sleep(400);
  await shot('mine-list');

  /* 添加弹窗 + 自动补全 */
  await evalJS(`document.getElementById('btn-add').click()`);
  await sleep(200);
  await evalJS(`
    var inp = document.getElementById('add-input');
    inp.value = 'tele';
    inp.dispatchEvent(new Event('input'));
  `);
  await sleep(500);
  await shot('add-autocomplete');

  /* 打印视图（print media） */
  await evalJS(`document.getElementById('btn-cancel').click()`);
  await evalJS(`
    document.querySelectorAll('#word-list input.cb').forEach(c => c.click());
    document.getElementById('btn-print').click();
    document.getElementById('print-confirm').click();
  `);
  await sleep(300);
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  await sleep(400);
  await shot('print-layout');
  await send('Emulation.setEmulatedMedia', { media: '' });

  ws.close();
  child.kill();
  console.log('完成');
}

main().catch((err) => { console.error(err); process.exit(1); });
