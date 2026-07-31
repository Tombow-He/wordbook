#!/usr/bin/env node
/* 词书 · 线上站点全新访问验证（模拟 iPhone 首次打开）
 * 用全新用户目录加载线上地址，确认拿到的是最新版。
 */
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9227;
const URL = 'https://glistening-horse-e0f9ab.netlify.app/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(os.tmpdir() + '/wordbook-live-');
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

  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await evalJS('window.App && App.vocab && App.vocab.all.length > 0')) break;
  }

  console.log('== 全新访问线上站点 ==');
  const version = await evalJS('App.VERSION');
  const hasDisplay = await evalJS('document.getElementById("btn-display") !== null');
  const hasPanel = await evalJS('document.getElementById("display-panel") !== null');
  const hasViewJs = await evalJS('typeof App.view !== "undefined"');
  const hasFab = await evalJS('document.getElementById("fab-add") !== null');
  console.log('版本号:', version, '| 显示按钮:', hasDisplay, '| 设置面板:', hasPanel, '| view.js:', hasViewJs, '| 浮动按钮:', hasFab);

  /* 等待 SW 注册，然后重新加载，模拟用户第二次打开 */
  await sleep(3000);
  await send('Page.reload', { ignoreCache: true });
  await sleep(4000);
  const version2 = await evalJS('window.App ? App.VERSION : "未加载"');
  const hasDisplay2 = await evalJS('document.getElementById("btn-display") !== null');
  const swActive = await evalJS('navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => r.active ? r.active.scriptURL : "no").join(",") || "none")');
  console.log('重载后版本:', version2, '| 显示按钮:', hasDisplay2);
  console.log('SW:', swActive);

  ws.close(); child.kill();
  const ok = version === '1.2.0' && hasDisplay && hasPanel && hasViewJs && hasFab;
  console.log(ok ? '\n✅ 线上全新访问即新版，无需缓存问题' : '\n❌ 线上未取到新版');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
