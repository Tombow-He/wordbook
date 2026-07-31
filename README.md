# 📖 词书（WordBook）

> 一个极简、离线可用的英语单词记录 PWA —— 内置词书 + 词典模块（详尽释义 / 词根词缀 / 派生词）+ 自动补全 + 真人发音 + 批量打印 PDF。

## 它解决什么问题

用手记或手机记单词时，单词散落各处、难以集中整理，之后转成 PDF 打印也不方便。词书把所有记词、查词、复习、打印的需求集中在一个轻量应用里：

- **集中记录**：你的单词集中存放在「我的单词本」，随时增删改查
- **快速输入**：输入时自动补全（2.2 万词词库），音标和释义自动带出
- **词典功能**：点开任意单词，看详尽中英释义、词根词缀分解、同根派生词
- **复习打印**：勾选单词批量打印成多栏 PDF，可自由选择是否包含英文/音标/中文

## ✨ 功能特性

- **内置词书**：中考 1600 / 高考 3674 / CET-4 3846 / CET-6 5406 / 考研 4801（来自开源 ECDICT）
- **我的单词本**：本地存储，JSON 导出/导入备份，换设备不丢词
- **自动补全录入**：输入前缀实时建议，键盘上下/回车/ESC 全支持
- **中英互搜**：可选「当前词书」或「全部词书」，英文/中文都能搜
- **词典模块**：
  - 详尽中英文释义（中文全量 + WordNet 英文释义，按词性分行）
  - **词根词缀分解**：611 个词根/前缀/后缀，点开看释义、来源、经典例词
  - **派生词跳转**：同词根的其他单词，可点击查看详情（词 ↔ 词根 ↔ 词 双向联动）
- **真人发音**：点击单词即发音（有道美音/英音，百度兜底），按需缓存离线可用
- **显示设置**：屏蔽中文/屏蔽英文/屏蔽音标/遮住全部点击显示（复习自测）、音标开关
- **正序/乱序**：词书自由切换字母序或随机乱序（可重新打乱）
- **批量打印 PDF**：勾选/全选 → 打印设置（可选英文/音标/中文）→ 字典式多栏排版 → 另存 PDF
- **PWA**：可添加到手机主屏，全屏独立运行，离线可用

## 🚀 快速开始

### 本地使用

```bash
# 方式 A：直接双击 index.html（file:// 可用，仅无 PWA 安装/离线）
# 方式 B：起本地服务器（完整功能）
node tools/serve.mjs          # 或双击 serve.bat
# 然后浏览器打开 http://localhost:8000
```

### 手机使用（PWA）

1. 电脑和手机连同一 WiFi，运行 `serve.bat`（或 `node tools/serve.mjs`），终端打印局域网地址
2. 手机浏览器打开该地址 → 「添加到主屏幕」→ 之后离线可用

> 也可以发布到任意 HTTPS 静态托管（Netlify / Cloudflare Pages / GitHub Pages），iOS 添加主屏后即为独立 App。

## 📚 数据源与词库

| 数据 | 来源 | 说明 |
|---|---|---|
| 词书词库 + 中英文释义 | [ECDICT](https://github.com/skywind3000/ECDICT)（MIT） | `ecdict.csv` 按考试标签筛选，含音标、中文释义、WordNet 英文释义 |
| 词根词缀 | ECDICT `wordroot.txt` | 611 个词根/前缀/后缀，含释义、来源、例词 |
| 备用词书 | [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary) | 词数更接近考纲，`--source kylebing` 可切换 |

词库在**构建时一次性下载处理**，打包进应用，运行时不依赖网络（国内访问 GitHub 不稳定也无需联网）。

## 🛠 技术架构

- **纯前端原生 HTML/CSS/JS**，零运行时依赖、零打包、无框架
- 词库数据打包为经典 `<script>` 文件，`file://` 双击即可用
- 用户单词存 `localStorage`（`store.js` 封装，隔离存储层）
- 自动补全：升序数组 + 二分查找，O(log n) 级延迟
- PWA：Service Worker 网络优先 + 离线缓存 + 版本自检更新
- 数据构建：`tools/build.mjs`（Node 脚本，CSV → 紧凑 JS 数据）

## 📁 目录结构

```
wordbook/
├── index.html          # 单页应用
├── css/style.css       # 应用样式 + 打印样式 + 响应式
├── js/
│   ├── store.js        # localStorage 封装（用户词 CRUD + 备份）
│   ├── vocab.js        # 词库查询 + 自动补全
│   ├── roots.js        # 词根词缀匹配 / 搜索 / 派生词
│   ├── view.js         # 显示设置（屏蔽/遮住/排序/发音口音）
│   ├── audio.js        # 真人发音（按需缓存）
│   ├── ui.js           # 全部界面渲染与交互
│   └── app.js          # 启动 + 版本检查 + PWA
├── data/               # 【构建生成】vocab-data.js / wordroot.js / version.json
├── icons/              # PWA 图标
├── manifest.json       # PWA 清单
├── sw.js               # Service Worker
├── tools/
│   ├── download.sh     # 下载原始词典数据（带国内镜像 fallback）
│   ├── build.mjs       # 数据构建（生成 data/）
│   ├── serve.mjs       # 本地服务器
│   ├── deploy.mjs      # 一键部署（Netlify）
│   ├── gen-icons.mjs   # 生成 PWA 图标
│   └── test-e2e.mjs    # 端到端测试（headless Edge + CDP）
├── deploy.bat          # Windows 一键部署
├── serve.bat           # Windows 一键本地服务
└── LICENSE             # MIT
```

## 🔧 开发与构建

```bash
# 1. 下载原始数据（ECDICT csv 63MB，一次性）
bash tools/download.sh

# 2. 构建词库
node tools/build.mjs

# 3. 本地运行
node tools/serve.mjs

# 4. 运行端到端测试
node tools/test-e2e.mjs        # 需先起服务；headless Edge
```

## 🚢 部署

```bash
node tools/deploy.mjs          # 或双击 deploy.bat（Windows）
```

部署到 Netlify（需先 `netlify login` + `netlify link`，详见 setup.bat）。Service Worker 会自动推送更新到手机端 App。

## 🧭 后续升级方向

以下是有价值但尚未实现的方向，欢迎参与：

- **词形变化与词组**：展示时态/单复数变化、常用搭配短语
- **复习计划**：间隔重复（Spaced Repetition）记忆曲线，待复习清单
- **词源树**：按词根组织词源关系图，点击展开同族词
- **每日一词 / 每日词根**：推送随机词/词根，养成学习习惯
- **云同步**：多设备同步单词本（当前为本地存储 + 手动备份）
- **TTS 离线发音**：接入本地语音引擎，完全离线发音
- **更细的打印版式**：词条分页、字号调节、导出 Markdown/Anki 卡组
- **多语言支持**：界面中英切换
- **自定义词书**：用户上传词表（CSV/TXT）生成个人词书

## 📄 开源协议

[MIT](LICENSE) © 2026 Tombow-He

词库数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT）与 [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary)，仅供学习交流使用。
