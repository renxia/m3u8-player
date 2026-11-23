# 项目系统审查报告

审查日期：2026-11-24 · 范围：全仓（`src/`、`scripts/`、`public/`、构建配置、文档）· 分支：`dev-lzw`

---

## 0. 基线校验（实测）

| 项目 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 通过，0 错误 |
| `npx biome check src scripts` | ❌ 2 error / 1 info：`src/lib/seo.ts:109` 在普通函数里调 Hook；`src/pages/HomePage.tsx:73` 依赖数组漏 `isEmbed` |
| `pnpm exec vite build` | ✅ 通过，2.66s，2070 modules |
| 产物体积 | `index.js` 470.65 kB（gzip 137.64）· `react` 218.97 · `i18n` 59.55 · `css` 76.44 |
| 构建告警 | `indexedDB.ts` 被静态+动态双重引入，动态引入失效 |

**结论**：工程可构建、类型干净，但 lint 唯一两个错误里就有一个是真实运行时缺陷（Hook 规则）；主包 470 kB 偏大，`qrcode` + `lib/share.ts`(855 行) 因静态引入首页而进主包。

---

## 1. P0 阻断缺陷（均已逐行核验）

### 1.1 DPlayer 构造函数 TDZ → DPlayer / 磁力链播放 100% 失败
`src/hooks/player/dplayerConfig.ts:40` 声明 `const dp = new DPlayer({...})`，而 `video.customType.customHls/customFlv/customWebTorrent` 内部（`:81`、`:102`、`:137`）调用 `dp.on('destroy', ...)`。

DPlayer 的 `initMSE` 在**构造函数内同步调用** `customType[type](this.video, this)`（已核对 CDN 源码 `DPlayer.min.js` 1.26.0），此时 `dp` 仍在 TDZ → `ReferenceError: Cannot access 'dp' before initialization` → `new DPlayer` 抛错 → 被 `usePlayer.ts:191` 的 catch 吞成 `return false`，用户只看到"没反应"。

**放大后果**：`usePlayer.ts:248` 对 `torrent|magnet:` 强制走 DPlayer，所以 README 宣传的**磁力链播放同样全废**。

**修复**：改用回调的第二参数 `(video, player)`，用 `player.on('destroy', ...)`；或把 `dp.on` 挪到构造完成之后统一注册。

### 1.2 Artplayer 的 `customType` 键名不匹配 → FLV 播放失败
`artplayerConfig.ts:47` 只把 `customHls|hls` 映射为 `m3u8`，`customFlv` 原样透传；而 `customType` 只注册了 `m3u8`（`:97`）和 `flv`（`:135`）两个键。`detectVideoType` 对 `.flv` 返回 `customFlv`（`playerUtils.ts:24`）→ Artplayer 找不到处理器。

**修复**：`const artType = ... : type === 'customFlv' ? 'flv' : type`；`customWebTorrent` 同理需确认映射。

### 1.3 全站没有任何 HLS 错误处理
`grep "Hls.Events.ERROR|recoverMediaError|startLoad" src/` → **0 命中**。`artplayerConfig.ts:204` 的 `error` 回调为空实现。

后果：404 / CORS / 鉴权失败 / 解密失败 表现为**永久黑屏且无任何提示、无重试入口**。`resilientPlayer.ts` 的降级链只对"同步抛错"生效（`usePlayer.ts:270`），而播放失败都是异步事件，因此降级机制实际从未被触发。

**修复**：接 `Hls.Events.ERROR`，`fatal` 分类（network / media / manifestParsing）→ 指数退避重试 2–3 次 → 仍失败时渲染错误面板（错误码 + 重试 + 换播放器）。

### 1.4 Service Worker 与页面侧**同名双写**媒体缓存，且无视缓存开关
- `public/sw.js:12` `M3U8_CACHE = 'm3u8-player-media-v1'`
- `src/lib/cache/pwaCache.ts:23` `DEFAULT_CACHE_NAME = "m3u8-player-media-v1"` ← 同一个桶
- `public/sw.js:364-367`：所有跨域 m3u8/ts/mp4 直接走 `cacheFirst`，**全文不读 `cacheConfigManager`**

后果：a) 用户在设置页关闭缓存**无效**，SW 仍继续缓存；b) 切到 IndexedDB 模式时同一分片进两份存储，磁盘翻倍；c) SW 写入不带 `__metadata__`，`pwaCache` 的 count/size 与真实占用长期偏离（UI 显示 0 项、磁盘已满）。

**修复**：SW 媒体路由改为 pass-through（`event.respondWith(fetch(request))`），媒体缓存统一由页面侧负责；`CACHE_NAME` 用构建版本号注入而非硬编码 `v1`。

### 1.5 共享下载被"第一个调用方"的 signal 中止 → 停预加载会打断正在播放的分片
`src/lib/cache/downloadManager.ts:113` 用首个调用方的 `signal` 启动 `execute`，`:160` 直接 `fetch(url, { signal })`。而注释（`:99`、`:126`）声称"仅取消当前调用方的等待"。

后果：播放（`hlsLoader.ts:239`）与预加载（`preloader.ts:637`）命中同一 URL 时，点"停止预加载"或 seek 会**让播放请求一起失败**，反之预加载被播放器的取消信号误杀。

**修复**：`execute` 内部自建 `AbortController`，引用计数归零才 abort；调用方 signal 只影响 `waitWithSignal`。

### 1.6 写缓存失败仍计入成功 → 假"已缓存"
`preloader.ts:639` 忽略 `await adapter.set(...)` 的布尔返回值，无条件 `loaded++`；`indexedDB.ts:491` 把 `QuotaExceededError` 吞成 `false`。

后果：配额满时进度条走到 100%、UI 显示"已缓存"，实际无数据，下次播放仍走网络——这正是用户会报"缓存了但还是要缓冲"的根因。

**修复**：`set` 失败计入失败数并 toast 提示；`QuotaExceededError` 触发一次立即淘汰后重试。

### 1.7 `getPageSeoMeta` 在普通函数里调用 `useTranslation()`
`src/lib/seo.ts:108-109`。违反 Rules of Hooks（biome 已报错），一旦被条件调用或非渲染期调用即崩。函数体与 `useSeo.ts:71-76` 完全重复，属冗余 + 隐患。

**修复**：删除 `getPageSeoMeta`，SEO 取文案统一走 `useSeo`。

### 1.8 SEO 覆盖率与 key 错位 → 4 个语言 + 4 个页面 meta 错误
- `src/lib/seo.ts:37-45` 只登记 `/`、`/en`、`/ja-JP`；`:57` 正则也只认这两个语言 → **fr / de / pt / es 全部 MISS**，页面 meta 沿用 `index.html` 的中文标题。
- `useSeo.ts:72-75` 按 `${i18nKey}.title/description/keywords/author` 取值，但 locale 里 `about` 只有 `title`/`meta.*`，**没有 `about.description`** → i18next 把 key 字符串原样输出，`meta description` 变成字面量 `"about.description"`（实测 `zh-CN.json` 已确认缺失）。
- 全站无 `hreflang` / `canonical` / `robots.txt`；`index.html:2` 的 `<html lang="zh-CN">` 硬编码，切语言不更新。

---

## 2. P1 架构问题

### 2.1 缓存子系统：分层混乱 + 循环依赖 + 三套并发控制
实际依赖链（已核）：

```
hlsInstance → HlsCachedFragmentLoader → adapter / downloadManager / cacheWriteQueue
preloader → adapter + m3u8Parser + downloadManager + networkMonitor + resourceMonitor + smartPreloader
resourceMonitor → @/lib/cache (adapter)      ← 反向依赖，形成环
CacheIndicator → 绕过 adapter 直接订阅 idbCacheManager + pwaCacheManager
```

- **循环依赖**：`preloader.ts:19` → `resourceMonitor` → `@/lib/cache`（index.ts 又导出 preloader），靠 ESM 提升侥幸未炸，初始化顺序极脆弱。
- **抽象泄漏**：`index.ts:5` 对外暴露 `indexedDBStore`；`cacheAdapter.ts:92` 用动态 `import('./indexedDB')` 绕过 manager；`CacheIndicator.tsx:107` 直接订阅底层两个 manager。
- **职责重叠**：`IDBCacheManager` 与 `pwaCache` 的 stats/LRU/事件 95% 同构；`cacheWriteQueue` 与 `downloadManager.acquire` 是**两套并发限制**；`smartPreloader` 实为纯策略计算却是带 localStorage 的单例。

**目标分层（4 层，迁移而非重写）**
1. L1 存储引擎：只保留一套字节级 `get/put/delete/keys`
2. L2 缓存策略：唯一 `CacheManager`（统计只算一次 + LRU + 配额）
3. L3 传输：`downloadManager` 独占网络（去重/优先级/超时/重试/内部 AbortController）
4. L4 调度：`preloader` 唯一状态机 + 纯函数策略 `predictConfig()`

### 2.2 播放器生命周期不闭环
- `usePlayer.ts` 与 `components/Player/index.tsx` **都没有 `useEffect`**（实测 `grep -c useEffect` = 0/0）→ 路由离开后 hls/torrent 实例无人销毁，持续占用连接与内存。
- `usePlayer.ts:74-108` 的 `hls/flvPlayer/wtClient` 销毁分支是**死代码**：真实实例挂在 `art.hls`，从未写入 `instances`。
- `usePlayer.ts:306-309` 降级路径直接 `initDPlayerInstance`，**跳过 `destroyAll`** → 同容器双实例。
- `usePlayer.ts:143` 覆盖 `instances.current.art` 时无 URL 校验；降级后 `currentUrlRef` 未更新，`artplayerConfig.ts:102` 的 `currentUrlRef.current !== m3u8Url` 直接 return → **降级"成功"但黑屏**。
- 快速切集竞态：`pendingAnimationFrameRef` 被 `cancelAnimationFrame`（`:224`）时旧 Promise 无 settle 路径，`isPlayingRef` 可能长期为 true，后续点击只入队（`:184`）不播。

### 2.3 两套提示体系并存
sonner（`App.tsx:21`、ShareDialog、SettingsPage、HistoryList）+ 自研 `utils/toast.ts` 包 `window.h5Utils`（来自 `index.html` 外部 CDN）。CDN 被拦截时 `h5Utils` 为 `undefined`，`ServiceWorkerSettings/index.tsx:16` 解构即抛 `TypeError`，清缓存静默失败。**统一到 sonner**。

### 2.4 语言清单在 5 处重复，已漂移
`App.tsx:33`（手写 7×5 路由展开）、`Header.tsx`、`lib/seo.ts`、`i18n/index.ts`、`vite.config.ts:16`（预渲染路由）。`seo.ts` 已漏 4 种语言即为漂移证据。

**修复**：`i18n/index.ts` 导出 `supportedLanguages` + `buildRoutes()` 单一来源，其余全部派生。

### 2.5 隐患（未炸但会炸）
- `indexedDB.ts:435` 先读 version 再单事务写 → 并发同 URL 双写"乐观锁"失效；`:145` 任何版本升级都删库（升级即全量丢缓存）；无 `onversionchange/onblocked`。
- `cacheAdapter.ts:177-181` 注释写"获取最旧"，实际 `query(limit)` 取**最新**再 reverse → 清理时删掉刚缓存的分片。
- `hlsLoader.ts:80` 模块级 `currentM3U8Url` 被缩略图实例覆盖 → 主播放器分片被归到错误 URL，按视频清理会误删/漏删。
- `preloader.ts:298` 每次 `FRAG_LOADED` 都重置 500ms 定时器 → 连续缓冲时分片时自动预加载永不触发。
- `InputForm.tsx:55` 正则 `/https?:\/\/[a-z0-9\-./]+/i` 截断 `?token=` 查询串 → 带鉴权地址 403。
- `HomePage.tsx:98-102` 把 `encodeURIComponent(url)` 塞进 `URLSearchParams` → 地址栏双重编码，判断恒真每次都 `replaceState`。
- `HomePage.tsx:165` 对 `getUrlParams()` 已解码的值再 `decodeURIComponent` → 含 `%` 的地址抛 `URIError` 白屏。
- 无全局 `window.onerror` / `unhandledrejection` / ErrorBoundary（全库 0 命中）→ 运行时异常即白屏。
- `main.tsx:29` `initStats()` 同步执行且依赖外部 CDN 脚本，被广告拦截时中断模块求值 → 首屏白屏。

---

## 3. 冗余与死代码（已 grep 核验）

| 项 | 证据 | 处置 |
|---|---|---|
| `src/components/NetworkIndicator.tsx`(114 行) | 全库仅自身定义，0 引用 | 删 |
| `lib/serviceWorker/m3u8CacheManager.ts`(219 行) | 仅 `serviceWorker/index.ts:6` 重导出，无消费方；与 pwaCache 重复 | 删 |
| `smartPreloader` 单例外壳 | `adjustPreloadConfig`(:566) 0 引用；核心价值只是纯计算 | 降级为纯函数 |
| `cacheWriteQueue.ts`(75 行) | 与 `downloadManager.acquire` 重复；`clearQueue` 丢弃 resolver（一旦接入即死锁） | 合并进 downloadManager |
| `getSegmentIndexByTime` / `preloader.getProgress` / `deleteByM3U8` / `getAllItems` / `clearM3U8Cache` / `useCacheStatus` | 均仅定义+导出，0 调用 | 删 |
| **三份「时间→分片索引」** | `preloader.ts:349`、`hlsInstance.ts:250`、`m3u8Parser.ts:194` 逐字相同 | 合并为一处 |
| 两份 stats 增减 + 两份 LRU 缓存 | `IDBCacheManager:63-85` vs `pwaCache:79-103` | 合并 |
| `getPageSeoMeta` | 与 `useSeo.ts:71-76` 重复且违反 Hook 规则 | 删 |
| `tailwind.config.js` | Tailwind 4 下无 `@config` 引入，`darkMode/content/layout-bg` 全部无效 | 删或显式接入 |
| `.gitignore` 忽略 `docs/` + `pnpm-lock.yaml` | `cat .gitignore` 实测 | 文档不入库、lockfile 不入库（与 AGENTS.md:265 矛盾）→ 修正 |
| 未用 npm 依赖 | `hls.js`（运行时用 CDN 的 `window.Hls`）、`handlebars`、`react-image-crop`、`class-variance-authority`、`@react-router/dev`、`vite-plugin-dts`、`@tailwindcss/postcss` | 删 |
| `@lzwme/fe-utils` | 被 `logger.ts:1` 运行时 import，却放在 devDependencies | 移到 dependencies |

---

## 4. 交互体验问题

| 级别 | 问题 | 位置 |
|---|---|---|
| P0 | 无加载态/错误态/重试按钮，失败只剩黑框 + 一条 toast | `components/Player/index.tsx:388-413` |
| P0 | **全项目 0 个 `aria-label`**（55 个 button）；移动端按钮文字 `hidden` 后既无可见文本也无无障碍名 | `Header.tsx:93,111,150`、`PlayerControls.tsx:147,164,181,198` |
| P0 | 三个弹窗均无 `role="dialog"`/`aria-modal`/焦点陷阱；`KeyboardShortcutsHelp` 连 Esc 都没有 | `ShareDialog.tsx:169`、`KeyboardShortcutsHelp.tsx:56`、`SettingsPage.tsx:649` |
| P1 | 快捷键双触发：文档级 `keydown` + `preventDefault` 与 Artplayer 内置 hotkey / DPlayer `hotkey:true` 并存 → 空格"暂停又播放"、方向键跳 20s 且页面滚动被吞 | `useKeyboardShortcuts.ts:74` |
| P1 | 空输入直接播 demo，`usePlayer.ts:204` 的校验提示成死代码 | `InputForm.tsx:52` |
| P1 | 切换语言用 `window.location.href` 整页刷新，丢失 `?url=` → 正在播放的视频被清空 | `Header.tsx:51-62` |
| P1 | 倍速状态三处各自为政：`PlayerControls.tsx:39` 本地 state、真实 `playbackRate`、storage 恢复互不同步 | `PlayerControls.tsx`、`HomePage.tsx:223` |
| P1 | `DownloadPage.tsx:8` `navigator.language === 'zh-CN'` 精确匹配，zh-TW/zh-HK 拿不到镜像 | `DownloadPage.tsx:8` |
| P2 | 每次播放强制 `scrollIntoView` 到 `#player`，从页尾历史点播会被拉走 | `HomePage.tsx:107` |
| P2 | 旋转态用 `container.style.transform`，跨集不重置，与全屏图层叠加冲突 | `usePlayer.ts:373` |
| P2 | 分享下载 `a.click()` 后立即 `revokeObjectURL`（Safari 可能失败），且无 try/catch | `ShareDialog.tsx:157` |
| P2 | 暗色绕过变量：`CollapsibleSection.tsx:84` `bg-white` 无 `dark:`、`App.tsx:26` Toaster 内联 hex | — |

### i18n
- 218 key 在 7 语言间**完全对齐**（对齐由脚本强制，不代表语义正确）。
- **代码引用了不存在的 key**：`common.save/edit/saved/videoName`（`HistoryList.tsx:71,159,170,222`）→ 非中文用户看到中文 defaultValue。
- **整组件硬编码中文**：`ServiceWorkerSettings/index.tsx` 全文无 `t()`；另有 `ServiceWorkerUpdate`、`HomePage.tsx:176`、`DownloadPage.tsx:88`、`FeedbackPage.tsx:41`、`SettingsPage.tsx:223,270`、`InputForm.tsx:140`。
- `scripts/i18n-align.ts:89` 补 key 时写 `zh:原文` 占位符，会原样上线；`:96-101` 静默删除目标语言独有 key。建议补一条 CI 校验：locale key 集合一致 + 代码中 `t('x')` 的 key 必须存在。

---

## 5. 功能增强（低成本优先）

| 优先级 | 功能 | 说明 |
|---|---|---|
| ★★★ | HLS 错误面板 + 一键重试 | 与 1.3 同源，收益最大 |
| ★★★ | 播放进度记忆（按 URL 存 `currentTime`，`?t=` 分享） | 长剧集刚需，storage 层已就绪 |
| ★★★ | 字幕：外挂 VTT/SRT（本地文件拖入 + URL） | Artplayer 原生支持 `subtitle`，成本极低 |
| ★★ | 音轨/清晰度统一 UI | `artplayerConfig.ts:59` `audio.control: false` 改为 `true` 即可 |
| ★★ | DPlayer 能力对齐（画中画/镜像/比例/清晰度菜单） | 目前 DPlayer 明显弱于 Artplayer |
| ★★ | "下一集"倒计时 + 自动连播修复 | `dplayerConfig.ts:45` `loop: true` 使 `ended` 永不触发 |
| ★★ | 多标签页配置同步（`storage` 事件） | `cacheConfigManager` 现无同步 |
| ★ | A-B 循环、`lowLatencyMode`/DVR、投屏入口 | 直播场景 |
| ★ | 首页分享卡片懒加载 | `ShareDialog` 静态引入首页，`qrcode` 进主包，`React.lazy` 可减首屏 |

---

## 6. 工程化与文档

| 项 | 问题 |
|---|---|
| **文档严重过期** | `README.md` 与 `AGENTS.md` 描述的是 Handlebars 模板时代：`src/layouts`、`src/partials`、`src/assets/main.ts`、`vite.config.js`、`build.js`、3 种语言、`BUILD_GUIDE.md`/`MIGRATION.md`（均不存在）、`dist/m3u8-player-[timestamp].zip`。与现状（React 19 + React Router 8 + 7 语言 + `scripts/build.ts`）**8 处冲突**。AI 助手按此文档开发必然跑偏。 |
| `docs/CACHE_ISSUES_ANALYSIS1.md` | 全文失效（引用的行号与结论均已被修复/改写），且 `docs/` 被 gitignore |
| 构建 | `scripts/build.ts:60` 依赖系统 `zip` 命令（Windows 原生无）；`:53` `rmrf(dist/m3u8-player/web/static)` 指向从不存在的目录；`build` 链路绕过 `tsc`（`build:vite` 才校验） |
| CI | 无任何 CI（无 `.github/workflows`）——lint + tsc + build 全靠本地自觉 |
| 预渲染 | `vite.config.ts:16` 只预渲染 `''/about/download`；`feedback`/`settings` 缺失（feedback 有第三方评论可接受，settings 建议补） |
| 隐私 | 默认上报百度统计 + GA4，ID 硬编码兜底，设置页无开关与告知；`networkMonitor.ts:466` 定时请求 `bing.com/favicon.ico` 测速属未披露第三方请求 |
| 生产噪声 | `sw.js` 保留大量 `console.log`；`logger` 生产级别 `warn` 仍输出 |

---

## 7. 建议执行路线

**Phase 1 — 止血（0.5 天，改动小、收益高）**
1. DPlayer TDZ（1.1）+ Artplayer FLV 键名（1.2）→ 恢复 DPlayer/磁力链/FLV 播放
2. HLS `Events.ERROR` + 错误面板 + 重试（1.3）
3. SW 媒体路由改 pass-through（1.4）
4. `downloadManager` 内部 AbortController + 引用计数（1.5）
5. `adapter.set` 失败上抛（1.6）
6. 删 `getPageSeoMeta`，补 `about.description` 等 key，`seo.ts` 语言清单派生（1.7 / 1.8）
7. 补 `useEffect` 卸载清理（2.2）

**Phase 2 — 结构（1–2 天）**
1. 语言/路由单一来源（2.4）
2. 统一提示体系到 sonner（2.3）
3. 删死代码：`NetworkIndicator`、`m3u8CacheManager`、`cacheWriteQueue`、7 个未用依赖（第 3 节）
4. 三份「时间→索引」合并、`cacheAdapter.getOldestKeys` 修正
5. `InputForm` 正则与 `HomePage` 双重解码修复
6. 重写 `README.md` / `AGENTS.md`，`.gitignore` 去掉 `docs/`、`pnpm-lock.yaml`

**Phase 3 — 体验与增强（按需）**
1. 无障碍：aria-label / dialog 基座 / 焦点陷阱（第 4 节 P0 三条）
2. 播放进度记忆 + `?t=` 分享 + 字幕 + 音轨
3. 缓存子系统 L1–L4 分层收敛（2.1）
4. 加 CI：`biome check` + `tsc --noEmit` + `vite build` + i18n key 校验
