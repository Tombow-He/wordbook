#!/usr/bin/env node
/* 词书 · 显示设置截图验证 */
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9226;
const APP_URL = 'http://localhost:8000/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(os.tmpdir() + '/wordbook-vshot-');
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
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    const p = os.tmpdir() + '/view-' + name + '.jpg';
    fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'));
    console.log('截图: ' + p);
  };

  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await evalJS('window.App && App.vocab.all.length > 0')) break;
  }
  await evalJS(`
    App.store.importJSON(JSON.stringify([
      { word: 'abandon', phonetic: "/ə'bændən/", zh: 'v. 放弃；抛弃', addedAt: new Date().toISOString() },
      { word: 'benevolent', phonetic: "/bə'nevələnt/", zh: 'a. 仁慈的；善意的', addedAt: new Date().toISOString() },
      { word: 'serendipity', phonetic: "/ˌserən'dɪpəti/", zh: 'n. 意外发现珍奇事物的本领', addedAt: new Date().toISOString() }
    ]));
    App.ui.render();
  `);
  await sleep(400);
  await shot('normal');

  await evalJS('App.view.set("hideZh", true); App.ui.render();');
  await sleep(300); await shot('hide-zh');

  await evalJS('App.view.set("hideZh", false); App.view.set("peek", true); App.ui.render();');
  await sleep(300); await shot('peek-masked');
  await evalJS('document.querySelector("#word-list .row").click()');
  await sleep(300); await shot('peek-revealed');

  await evalJS('App.view.set("peek", false); App.view.set("showPh", false); App.ui.render();');
  await sleep(300); await shot('no-phonetic');

  await evalJS('document.getElementById("btn-display").click()');
  await sleep(300); await shot('panel');

  ws.close(); child.kill();
  console.log('完成');
}

main().catch((err) => { console.error(err); process.exit(1); });
