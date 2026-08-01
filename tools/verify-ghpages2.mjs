#!/usr/bin/env node
/* 抓 GitHub Pages 控制台错误 */
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'https://tombow-he.github.io/wordbook/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(os.tmpdir() + '/gh2-');
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=9241',
  '--user-data-dir=' + profile,
  URL
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(300);
  try {
    const l = await (await fetch('http://localhost:9241/json')).json();
    target = l.find((t) => t.type === 'page');
  } catch (e) { }
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push((m.params.args || []).map(a => a.value || a.description || '').join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception ?
      m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  }
  if (m.method === 'Network.loadingFailed') {
    errors.push('网络失败: ' + m.params.errorText + ' ' + (m.params.blockedReason || ''));
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id;
  pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result.result.value;
};

await send('Runtime.enable');
await send('Network.enable');
await sleep(4000);

console.log('=== 控制台错误 ===');
errors.forEach((e, i) => console.log(i + 1 + '. ' + e.slice(0, 200)));
console.log('共 ' + errors.length + ' 个错误');
console.log('App 定义:', await ev('typeof App'));

ws.close(); child.kill();
