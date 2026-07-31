#!/usr/bin/env node
/* 词书 · 验证 Service Worker 注册（headless Edge + CDP） */
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9225;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(os.tmpdir() + '/swcheck-');
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=' + CDP_PORT,
  '--user-data-dir=' + profile,
  'http://localhost:8000/'
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(300);
  try {
    const l = await (await fetch('http://localhost:' + CDP_PORT + '/json')).json();
    target = l.find((t) => t.type === 'page');
  } catch (e) { }
}
if (!target) { console.log('CDP 未就绪'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJS = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result.result.value;
};

for (let i = 0; i < 40; i++) {
  await sleep(250);
  if (await evalJS('window.App && App.vocab.all.length > 0')) break;
}
await sleep(2000); // 等 SW 注册

const reg = await evalJS(
  'navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => r.active ? "active:" + r.active.scriptURL : "no-active").join(",") || "none")'
);
console.log('SW 注册状态:', reg);
ws.close();
child.kill();
process.exit(reg && reg.indexOf('active') >= 0 ? 0 : 1);
