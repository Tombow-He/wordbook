#!/usr/bin/env node
/* 词书 · 数据构建脚本
 * 用法：
 *   node tools/build.mjs                 # 用 tools/tmp/ecdict.csv（ECDICT 主源）
 *   node tools/build.mjs --source kylebing   # 备用源：KyleBing（可从 jsdelivr 下载或放入 tools/tmp/kylebing/）
 * 输出：data/vocab-data.js + data/stats.json
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const source = args.includes('--source') ? args[args.indexOf('--source') + 1] : 'ecdict';

const BOOKS = [
  { id: 'zk',  name: '中考', tag: 'zk' },
  { id: 'gk',  name: '高考', tag: 'gk' },
  { id: 'cet4', name: 'CET-4', tag: 'cet4' },
  { id: 'cet6', name: 'CET-6', tag: 'cet6' },
  { id: 'ky',  name: '考研', tag: 'ky' }
];
const TAG_SET = new Set(BOOKS.map(b => b.tag));
const MAX_ZH = 200;     // 中文释义上限（ECDICT 平均仅 14 字符，放宽足够）
const FREQ_N = 15000;   // 自动补全词库在词书基础上追加的高频词数量（按 ECDICT 词频）
const MAX_DEF = 300;    // 英文释义（WordNet）上限：按 \n 分义项取前3，每项~90字符，总~300

/* ---------- 英文释义规范化：按 \n 分义项，取前 3 项，每项 ~90 字符句点截断 ---------- */
function cleanDef(def) {
  def = String(def || '').trim().replace(/\r/g, '');
  if (!def) return '';
  const senses = def.split(/\\n/).map(s => s.trim()).filter(Boolean);
  const keep = senses.slice(0, 3);
  const out = keep.map(s => {
    if (s.length <= 90) return s;
    const cut = s.slice(0, 90);
    const dot = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf(';'), cut.lastIndexOf(','));
    return dot > 40 ? cut.slice(0, dot + 1) : cut.slice(0, 88) + '…';
  });
  return out.join('\n').slice(0, MAX_DEF);
}

/* ---------- 纯 JS quote-aware CSV 解析（ECDICT 由 Python csv 生成，字段内含逗号/引号/换行） ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ---------- 规范化 ---------- */
function cleanPhonetic(p) {
  return String(p || '')
    .replace(/^[\s/\[\]'"（）()]+/, '')
    .replace(/[\s/\[\]'"（）()]+$/, '')
    .trim();
}

function truncateZh(zh, max = MAX_ZH) {
  zh = String(zh || '')
    .trim()
    .replace(/\\n/g, '；')             // ECDICT 文件里的字面 \n（转义换行）→ 中文分号
    .replace(/\s*\n\s*/g, '；')       // 万一有真实换行
    .replace(/[ \t]+/g, ' ');
  if (!zh) return '';
  if (zh.length <= max) return zh;
  const cut = zh.slice(0, max);
  const sep = Math.max(cut.lastIndexOf('；'), cut.lastIndexOf(';'),
    cut.lastIndexOf('。'), cut.lastIndexOf('，'), cut.lastIndexOf('.'));
  if (sep > max * 0.5) return cut.slice(0, sep + 1);
  return cut.slice(0, max - 1) + '…';
}

function cleanWord(w) {
  const s = String(w || '').trim().toLowerCase();
  if (!/^[a-z][a-z'-]*$/.test(s)) return null;   // 只收纯单词
  return s;
}

/* ---------- 主构建 ---------- */
async function main() {
  let lists = Object.fromEntries(BOOKS.map(b => [b.id, []]));
  const allMap = new Map();      // word -> entry
  const allSrc = new Map();      // word -> Set(bookId)
  const freqPool = new Map();    // word -> {p, zh, d, frq, bnc}（ECDICT 高频词，用于扩宽自动补全）
  const defMap = new Map();      // word -> 英文释义 d（仅 all 条目使用，避免共享 entry 双倍计字节）
  let added = 0;                 // 追加的高频补全词数量

  if (source === 'kylebing') {
    await buildFromKylebing(lists, allMap, allSrc);
  } else {
    buildFromEcdict(lists, allMap, allSrc, freqPool, defMap);

    /* 在词书词之上，追加高频词，让自动补全覆盖更广 */
    const pool = [...freqPool.entries()].sort((a, b) => freqKey(a[1]) - freqKey(b[1]));
    for (const [w, e] of pool) {
      if (added >= FREQ_N) break;
      if (allMap.has(w)) continue;
      allMap.set(w, { w, p: e.p, zh: e.zh });
      added++;
    }
    console.log(`追加高频补全词：${added}`);
  }

  /* 排序 + 附加来源 + 补英文释义（d 只在 all 条目上） */
  for (const b of BOOKS) {
    lists[b.id].sort((a, b) => a.w < b.w ? -1 : a.w > b.w ? 1 : 0);
  }
  const all = [];
  for (const [w, e] of allMap) {
    const src = [...(allSrc.get(w) || [])].sort((a, b) => bookOrder(a) - bookOrder(b));
    const d = defMap.get(w) || '';
    const base = { w, p: e.p, zh: e.zh };
    if (d) base.d = d;
    all.push(src.length ? Object.assign(base, { s: src }) : base);
  }
  all.sort((a, b) => a.w < b.w ? -1 : a.w > b.w ? 1 : 0);

  /* 词根词缀数据（wordroot.txt → data/wordroot.js） */
  let rootStats = null;
  if (source === 'ecdict') {
    rootStats = buildWordroot(all);
  }

  const books = BOOKS
    .filter(b => lists[b.id].length)
    .map(b => ({ id: b.id, name: b.name, count: lists[b.id].length }));

  const data = { books, lists, all };
  const outJs = '/* 词书 · 内置词库（由 tools/build.mjs 自动生成，勿手改） */\n' +
    'window.WORD_DATA = ' + JSON.stringify(data) + ';\n';

  const jsPath = path.join(ROOT, 'data', 'vocab-data.js');
  fs.writeFileSync(jsPath, outJs, 'utf8');

  const stats = {
    source,
    builtAt: new Date().toISOString(),
    books,
    freqAdded: source === 'ecdict' ? added : 0,
    totalUnique: all.length,
    withDef: source === 'ecdict' ? defMap.size : 0,
    fileBytes: Buffer.byteLength(outJs, 'utf8'),
    wordroot: rootStats,
    sha256: crypto.createHash('sha256').update(outJs).digest('hex')
  };
  fs.writeFileSync(path.join(ROOT, 'data', 'stats.json'), JSON.stringify(stats, null, 2), 'utf8');

  console.log('== 构建完成 ==');
  console.log('每本书词数：');
  books.forEach(b => console.log(`  ${b.name.padEnd(6)} ${b.count}`));
  console.log(`去重后唯一词数：${all.length}`);
  console.log(`输出体积：${(stats.fileBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`输出文件：${jsPath}`);
}

function bookOrder(id) {
  const i = BOOKS.findIndex(b => b.id === id);
  return i < 0 ? 99 : i;
}

function freqKey(e) {
  return e.frq > 0 ? e.frq : Infinity;
}

/* ================= 词根/前缀/后缀（wordroot.txt） =================
 * 匹配规则（必须与 js/roots.js 保持同步）：
 *   1. 键按逗号拆变体（"scop, -scope, -scopy"）
 *   2. 变体规范化：去前缀'-'、后缀'-'、尾数字、小写
 *   3. 前缀变体(v以-结尾)：w.startsWith(n) && w.length>n.length
 *      后缀变体(v以-开头)：w.endsWith(n) && w.length>n.length
 *      纯词根：n.length>=4 && w.includes(n) && w.length>n.length
 */
function rootVariants(key) {
  return String(key || '').split(',').map(v => v.trim()).filter(Boolean);
}
function rootNormalize(v) {
  return v.replace(/^[-]/g, '').replace(/[-]$/g, '').replace(/\d+$/g, '').toLowerCase();
}
function rootMatch(word, variant) {
  const n = rootNormalize(variant);
  if (!n) return false;
  if (variant.endsWith('-')) return word.length > n.length && word.startsWith(n);
  if (variant.startsWith('-')) return word.length > n.length && word.endsWith(n);
  return n.length >= 4 && word.length > n.length && word.includes(n);
}
function rootHits(word, variants) {
  return variants.some(v => rootMatch(word, v));
}

function buildWordroot(vocabAll) {
  const wPath = path.join(ROOT, 'tools', 'tmp', 'wordroot.txt');
  if (!fs.existsSync(wPath)) {
    console.warn('  未找到 wordroot.txt，跳过词根词缀数据');
    return null;
  }
  const vocabSet = new Set(vocabAll.map(x => x.w));
  const raw = JSON.parse(fs.readFileSync(wPath, 'utf8'));
  const CLASS_ZH = {
    'root': '词根',
    'prefix': '前缀',
    'adjective-forming suffix': '形容词后缀',
    'noun-forming suffix': '名词后缀',
    'verb-forming suffix': '动词后缀',
    'adverb-forming suffix': '副词后缀',
    'adjective- and noun-forming suffix': '形容词/名词后缀'
  };

  const roots = [];
  let curatedTotal = 0, relTotal = 0;
  for (const key of Object.keys(raw)) {
    const item = raw[key];
    const variants = rootVariants(key);
    /* ex：人工筛选的 example ∩ 词库，去重，规范化 */
    const ex = [];
    const seen = new Set();
    for (const w of (item.example || [])) {
      const cw = String(w).toLowerCase().replace(/[^a-z']/g, '');
      if (!cw || seen.has(cw)) continue;
      seen.add(cw);
      if (!vocabSet.has(cw)) continue;      // 只保留词库内可点击的词
      ex.push(cw);
      if (ex.length >= 12) break;
    }
    /* rel：词库反向索引（同边界规则），去掉已在 ex 的词 */
    const rel = [];
    for (const v of vocabAll) {
      if (rootHits(v.w, variants) && !ex.includes(v.w)) {
        rel.push(v.w);
        if (rel.length >= 15) break;
      }
    }
    roots.push({
      r: key,
      m: item.meaning || '',
      c: item.class || '',
      o: item.origin || '',
      ex,
      rel
    });
    curatedTotal += ex.length;
    relTotal += rel.length;
  }
  /* 排序：词根串字母序 */
  roots.sort((a, b) => a.r < b.r ? -1 : a.r > b.r ? 1 : 0);

  const outJs = '/* 词书 · 词根词缀数据（由 tools/build.mjs 自动生成，勿手改） */\n' +
    'window.WORDROOT_DATA = ' + JSON.stringify({ version: 1, roots: roots }) + ';\n';
  const jsPath = path.join(ROOT, 'data', 'wordroot.js');
  fs.writeFileSync(jsPath, outJs, 'utf8');

  const stats = {
    count: roots.length,
    curatedExamples: curatedTotal,
    reverseIndexed: relTotal,
    fileBytes: Buffer.byteLength(outJs, 'utf8')
  };
  console.log(`  词根词缀：${roots.length} 个；经典例词 ${curatedTotal}；反向索引 ${relTotal}；体积 ${(stats.fileBytes/1024).toFixed(1)} KB`);
  return stats;
}

/* ---------- ECDICT 源 ---------- */
function buildFromEcdict(lists, allMap, allSrc, freqPool, defMap) {
  const csvPath = path.join(ROOT, 'tools', 'tmp', 'ecdict.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('未找到 ' + csvPath + '，请先运行 tools/download.sh');
    process.exit(1);
  }
  console.log('解析 ECDICT CSV（约 63MB，需要几秒）…');
  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(text);
  const header = rows[0];
  const idx = {};
  header.forEach((h, i) => { idx[h.trim()] = i; });
  const iWord = idx.word, iPho = idx.phonetic, iTr = idx.translation, iTag = idx.tag,
        iFrq = idx.frq, iBnc = idx.bnc, iDef = idx.definition;
  if (iWord === undefined || iPho === undefined || iTr === undefined || iTag === undefined) {
    console.error('CSV 表头不符合预期：' + header.join(','));
    process.exit(1);
  }

  let kept = 0;
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.length < Math.max(iTag, iTr) + 1) continue;
    const w = cleanWord(cols[iWord]);
    if (!w) continue;
    const zh = truncateZh(cols[iTr]);
    const phonetic = cleanPhonetic(cols[iPho]);

    /* 英文释义 → defMap（仅 all 条目用，避免共享 entry 双倍计字节） */
    if (iDef !== undefined && cols[iDef] && !defMap.has(w)) {
      const d = cleanDef(cols[iDef]);
      if (d) defMap.set(w, d);
    }

    /* 高频池：仅有当代语料库词频排名的词才进池（过滤缩写/专名等噪声） */
    const frq = parseInt(cols[iFrq], 10) || 0;
    if (frq > 0 && zh && !freqPool.has(w)) {
      freqPool.set(w, { p: phonetic, zh, frq, bnc: parseInt(cols[iBnc], 10) || 0 });
    }

    const tags = String(cols[iTag] || '').trim().split(/\s+/).filter(t => TAG_SET.has(t));
    if (!tags.length) continue;
    const entry = { w, p: phonetic, zh };
    for (const t of tags) {
      if (!allSrc.has(w)) allSrc.set(w, new Set());
      allSrc.get(w).add(t);
      lists[t].push(entry);
    }
    if (!allMap.has(w)) allMap.set(w, entry);
    kept++;
  }
  console.log(`  保留带考试标签词条：${kept}；高频池：${freqPool.size}；英文释义：${defMap.size}`);
}

/* ---------- KyleBing 备用源 ---------- */
async function buildFromKylebing(lists, allMap, allSrc) {
  const KB = {
    zk:  '1-初中-顺序.json',
    gk:  '2-高中-顺序.json',
    cet4: '3-CET4-顺序.json',
    cet6: '4-CET6-顺序.json',
    ky:  '5-考研-顺序.json'
  };
  const dir = path.join(ROOT, 'tools', 'tmp', 'kylebing');
  fs.mkdirSync(dir, { recursive: true });

  for (const b of BOOKS) {
    const file = path.join(dir, KB[b.id]);
    let arr;
    if (fs.existsSync(file)) {
      arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    } else {
      const url = 'https://cdn.jsdelivr.net/gh/KyleBing/english-vocabulary@master/json/' +
        encodeURIComponent(KB[b.id]);
      console.log('下载 ' + b.name + ' … ' + url);
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error('下载失败：' + b.name);
        process.exit(1);
      }
      arr = await resp.json();
      fs.writeFileSync(file, JSON.stringify(arr), 'utf8');
    }
    for (const item of arr) {
      const w = cleanWord(item.word);
      if (!w) continue;
      const zh = (item.translations || [])
        .map(t => ((t.type ? t.type + '. ' : '') + (t.translation || '')).trim())
        .filter(Boolean)
        .join('；');
      const entry = { w, p: '', zh: truncateZh(zh) };
      if (!allSrc.has(w)) allSrc.set(w, new Set());
      allSrc.get(w).add(b.id);
      lists[b.id].push(entry);
      if (!allMap.has(w)) allMap.set(w, entry);
    }
    console.log(`  ${b.name}: ${lists[b.id].length} 词`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
