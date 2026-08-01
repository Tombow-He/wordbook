import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
const EDGE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe';
const URL = 'https://tombow-he.github.io/wordbook/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(os.tmpdir() + '/gh3-');
const child = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9242','--user-data-dir='+profile, URL], {stdio:'ignore'});
let target=null;
for(let i=0;i<60&&!target;i++){await sleep(300);try{const l=await(await fetch('http://localhost:9242/json')).json();target=l.find(t=>t.type==='page');}catch(e){}}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let id=0;const pending=new Map();
ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const send=(method,params={})=>new Promise(res=>{const mid=++id;pending.set(mid,res);ws.send(JSON.stringify({id:mid,method,params}));});
const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});return r.result.result.value;};
let loaded=false;
for(let i=0;i<200;i++){ // 最长 50 秒
  await sleep(250);
  const v=await ev('typeof App!==\"undefined\"?App.vocab.all.length:\"wait\"');
  if(typeof v==='number'&&v>0){loaded=true;break;}
  if(i%8===0) console.log('等待加载...', i/4, 's, vocab:', v);
}
console.log('=== GitHub Pages 加载结果 ===');
console.log('加载成功:', loaded);
if(loaded){
  console.log('词库:', await ev('App.vocab.all.length'), '词');
  console.log('词根:', await ev('App.roots.count()'), '个');
  console.log('版本:', await ev('App.VERSION'));
  console.log('词书按钮:', await ev('document.querySelectorAll("#sidebar [data-book]").length'), '个');
}
ws.close();child.kill();
