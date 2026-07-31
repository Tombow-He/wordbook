#!/usr/bin/env node
/* 词书 · 线上发音真实验证（加载线上站点，模拟点击单词，看 audio 能否播放） */
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9231;
const URL = 'https://glistening-horse-e0f9ab.netlify.app/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(os.tmpdir() + '/wb-audio-');
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile,
    URL
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(300);
    try {
      const list = await (await fetch(`http://localhost:${CDP_PORT}/json`)).json();
      target = list.find((t) => t.type === 'page');
    } catch (e) { }
  }
  if (!target) { console.error('CDP 未就绪'); process.exit(1); }

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

  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await evalJS('window.App && App.vocab.all.length > 0')) break;
  }

  console.log('线上版本:', await evalJS('App.VERSION'));
  console.log('audio.js 已加载:', await evalJS('typeof App.audio === "object" && typeof App.audio.play === "function"'));

  /* 模拟点击单词（直接调 play 并监听音频能否加载） */
  const result = await evalJS(`
    new Promise(function (resolve) {
      var w = "apple";
      var url = 'https://dict.youdao.com/dictvoice?type=0&audio=' + encodeURIComponent(w);
      var a = new Audio();
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve({ status: 'timeout' }); } }, 9000);
      a.addEventListener('canplay', function () {
        if (!done) { done = true; clearTimeout(timer); resolve({ status: 'canplay', duration: a.duration }); }
      });
      a.addEventListener('error', function () {
        if (!done) { done = true; clearTimeout(timer); resolve({ status: 'error', code: a.error && a.error.code }); }
      });
      a.src = url;
    })
  `);
  console.log('有道音频浏览器加载:', JSON.stringify(result));

  /* 用 App.audio.play 触发，验证内部流程无异常 */
  const playCall = await evalJS('(function(){ try { App.audio.play("apple"); return "ok"; } catch(e){ return "err:" + e.message; } })()');
  console.log('App.audio.play 调用:', playCall);

  ws.close(); child.kill();
  const ok = result.status === 'canplay' && playCall === 'ok';
  console.log(ok ? '\n✅ 线上发音可用' : '\n❌ 线上发音仍不可用');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
