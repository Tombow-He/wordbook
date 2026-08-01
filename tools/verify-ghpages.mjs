#!/usr/bin/env node
/* 验证 GitHub Pages 线上渲染 */
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'https://tombow-he.github.io/wordbook/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(os.tmpdir() + '/gh-');
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=9240',
  '--user-data-dir=' + profile,
  URL
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(300);
  try {
    const l = await (await fetch('http://localhost:9240/json')).json();
    target = l.find((t) => t.type === 'page');
  } catch (e) { }
}
if (!target) { console.error('CDP 未就绪'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id;
  pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result && r.result.exceptionDetails) return 'ERR:' + (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || 'unknown');
  return r.result.result.value;
};

for (let i = 0; i < 200; i++) {
  await sleep(250);
  const v = await ev('window.App && App.vocab && App.vocab.all.length');
  if (typeof v === 'number' && v > 0) break;
  if (i % 20 === 0) console.log('等待加载 ' + (i / 4) + 's, vocab=' + v);
}

console.log('=== GitHub Pages 线上渲染验证 ===');
console.log('词库加载:', await ev('App.vocab.all.length'), '词');
console.log('词根数据:', await ev('App.roots ? App.roots.count() : "未加载"'), '个');
console.log('版本号:', await ev('App.VERSION'));
console.log('侧栏词书按钮:', await ev('document.querySelectorAll("#sidebar [data-book]").length'), '个');
console.log('浮动按钮:', await ev('document.getElementById("fab-add") !== null'));
console.log('JS错误:', await ev('(window.__errs||[]).length'));
console.log('SW注册:', await ev('navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => r.active ? "active" : "none").join(",") || "none")'));

ws.close(); child.kill();
