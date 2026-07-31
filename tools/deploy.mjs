#!/usr/bin/env node
/* 词书 · 一键更新部署
 * 作用：
 *   1. 把 wordbook 的最新文件同步到部署文件夹 wordbook-deploy
 *   2. 调用 Netlify CLI 部署到同一站点（网址不变）
 * 用法：
 *   node tools/deploy.mjs            # 同步 + 部署
 * 首次使用前，请先运行 setup.bat 完成登录和站点链接。
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEPLOY = path.join(ROOT, '..', 'wordbook-deploy');

/* 需要随改动一起部署的文件 */
const FILES = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css/style.css',
  'js/store.js',
  'js/vocab.js',
  'js/roots.js',
  'js/view.js',
  'js/audio.js',
  'js/ui.js',
  'js/app.js',
  'data/vocab-data.js',
  'data/wordroot.js',
  'data/version.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

function sync() {
  fs.mkdirSync(DEPLOY, { recursive: true });
  let bytes = 0, count = 0;
  for (const rel of FILES) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) {
      console.warn('  警告：缺少 ' + rel + '（跳过）');
      continue;
    }
    const dst = path.join(DEPLOY, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    bytes += fs.statSync(src).size;
    count++;
  }
  console.log(`已同步 ${count} 个文件到 ${DEPLOY}（${(bytes / 1024 / 1024).toFixed(2)} MB）`);
}

function netlifyInvoke() {
  /* 用 Node 直接执行 netlify-cli 的入口（不经过 .cmd / 不依赖 PATH 里的 node） */
  const candidates = [
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'netlify-cli', 'bin', 'run.js'),
    path.join(path.dirname(process.execPath), '..', 'AppData', 'Roaming', 'npm', 'node_modules', 'netlify-cli', 'bin', 'run.js')
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function deploy() {
  const cli = netlifyInvoke();
  if (!cli) {
    console.log('\n❌ 未找到 netlify-cli 入口，请先运行 setup.bat 或重装：');
    console.log('    npm install -g netlify-cli');
    process.exit(1);
  }
  console.log('\n== 部署中…（保持终端打开，约 1 分钟）==');
  try {
    execFileSync(process.execPath, [cli, 'deploy', '--prod', '--dir=.', '--message=更新'], {
      cwd: DEPLOY,
      stdio: 'inherit'
    });
    console.log('\n✅ 部署完成，网址不变。');
  } catch (e) {
    console.log('\n❌ 部署失败。');
    console.log('  如果提示需要登录/链接站点，请先运行 setup.bat 完成首次设置。');
    console.log('  调试：手动执行下面命令看详细报错：');
    console.log('    cd ' + DEPLOY + ' && netlify deploy --prod --dir=. --message=更新');
    process.exit(1);
  }
}

console.log('== 词书 更新部署 ==');
console.log('第一步：同步最新文件到部署文件夹…');
sync();
if (process.argv.includes('--sync-only')) {
  console.log('（--sync-only：仅同步，未部署）');
  process.exit(0);
}
deploy();
