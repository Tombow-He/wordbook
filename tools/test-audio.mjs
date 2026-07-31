#!/usr/bin/env node
/* 词书 · 验证外部发音源在浏览器里能否正常加载播放 */
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9228;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(os.tmpdir() + '/wordbook-audio-');
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile,
    'about:blank'
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

  const tests = [
    { name: '有道(美音)', url: 'https://dict.youdao.com/dictvoice?type=0&audio=apple' },
    { name: '有道(英音)', url: 'https://dict.youdao.com/dictvoice?type=1&audio=apple' },
    { name: '百度(英音)', url: 'https://fanyi.baidu.com/gettts?lan=en&text=apple&spd=3&source=web' }
  ];

  console.log('== 浏览器加载外部音频测试 ==');
  for (const t of tests) {
    const result = await evalJS(`
      new Promise(function (resolve) {
        var a = new Audio();
        var done = false;
        var timer = setTimeout(function () { if (!done) { done = true; resolve({ status: 'timeout' }); } }, 8000);
        a.addEventListener('canplay', function () {
          if (!done) { done = true; clearTimeout(timer); resolve({ status: 'canplay', duration: a.duration }); }
        });
        a.addEventListener('error', function () {
          if (!done) { done = true; clearTimeout(timer); resolve({ status: 'error', code: a.error && a.error.code }); }
        });
        a.src = ${JSON.stringify(t.url)};
      })
    `);
    console.log('  ' + t.name + ' → ' + JSON.stringify(result));
  }

  ws.close(); child.kill();
  console.log('完成');
}

main().catch((err) => { console.error(err); process.exit(1); });
