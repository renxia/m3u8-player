# AI 编程开发指引

面向 AI 编程助手的项目约定。**以本文件为准**，不要依赖历史记忆中的 Handlebars 模板时代结构（已废弃）。

## 项目概述

M3U8 在线播放器：React 19 SPA（React Router 8 `BrowserRouter`），支持 HLS/MP4/FLV/磁力链，7 语言，HLS 分片缓存 + Service Worker 离线。

### 技术栈
- 构建：Vite 8（Rolldown 内核，`rolldownOptions` 而非 `rollupOptions`）
- UI：React 19 + Tailwind CSS 4（**无 `tailwind.config.js`**，主题写在 `src/index.css` 的 `@theme`/变量里）
- 语言：TypeScript 7（`strict: true`）
- i18n：i18next 26 + react-i18next 17
- 规范：Biome 2（`pnpm run lint` / `pnpm run format`）
- 包管理：pnpm 12（`pnpm-lock.yaml` 不入库）

## 常用命令

```bash
pnpm run dev        # 开发服务器 :3009
pnpm run build      # tsc --noEmit → vite build → zip
pnpm run preview    # 预览产物 :4171
pnpm run lint       # biome check --fix
pnpm run i18n:align # 以 zh-CN 为基准对齐 7 个语言包的 key
```

改动后至少要跑通 `npx tsc --noEmit` 与 `npx biome check src`。

## 目录约定

```
src/components/        展示组件（PascalCase 目录或 .tsx）
src/components/ui/     通用基座（Dialog：遮罩/焦点陷阱/Esc/aria）
src/hooks/             业务 hook；播放器相关在 hooks/player/
src/lib/               无 UI 的领域逻辑（cache / serviceWorker / share / seo / storage ...）
src/i18n/languages.ts  语言清单唯一来源
src/pages/             路由页面
src/types/index.ts     公共类型
public/                sw.js、manifest.json、静态资源（不经过构建）
scripts/               build.ts / i18n-align.ts
```

## 多语言

- **语言清单只写在 `src/i18n/languages.ts`**（`supportedLanguages` + `getLangPathPrefix` / `detectLangFromPath` / `stripLangPrefix`）。路由（`App.tsx`）、Header、SEO、`lib/utils.getLangPrefix()` 全部从它派生，**不要在别处硬编码语言数组**。
- 新增语言：`languages.ts` 加一项 → `src/i18n/locales/<lang>.json` 加文件 → `src/i18n/index.ts` 的 `resources` 注册 → `pnpm run i18n:align`。
- 文案 key 结构：首页用 `meta.*`，其余页面用 `<page>.meta.*`（由 `getSeoI18nPrefix()` 映射）；UI 文案分别在 `index/player/cache/common/settings/share/shortcuts/nav/footer` 命名空间下。
- **禁止在 JSX 里硬编码中文字面量**，一律 `t('ns.key')`；缺失 key 用 `pnpm run i18n:align` 补齐后填真实翻译。
- **不要给 `t()` 加中文 `defaultValue`**：key 齐全时它是死代码，key 缺失时会让非中文用户看到中文。新增文案必须 7 个语言包同时补齐。
- 有意保留的非 i18n 文案：Header 的语言自称（`中文` / `日本語` / …）、DevTools 面板（`import.meta.env.DEV` 下才挂载）、`lib/{network,resource}/` 与 `smartPreloader` 的内部调试描述（当前无 UI 消费方）。

## 播放器

- 双播放器：`hooks/player/artplayerConfig.ts`（默认）与 `dplayerConfig.ts`；HLS 实例统一由 `hlsInstance.ts#createHlsInstance` 创建（含缓存、预加载、fatal 错误重试）。
- `VideoType → 播放器类型键名` 的映射：Artplayer 用 `ART_TYPE_MAP`（`customHls→m3u8`、`customFlv→flv`、`customWebTorrent→torrent`）；DPlayer 用原样的 `customHls/customFlv/customWebTorrent` 作为 `customType` 键。**改类型枚举必须同步这两处**。
- DPlayer 的 `customType` 回调在**构造函数内同步执行**，回调里只能使用第二个参数传入的实例（`player.on(...)`），不能引用 `const dp`（TDZ）。
- 播放失败处理链路：`hls.js ERROR(fatal)` → 自动重试（network 2 次带退避、media recover 2 次，4xx 不重试）→ `onFatalError` → `usePlayer(onError)` → `Player` 错误面板（重试/关闭）。
- 生命周期：`usePlayer` 内已有卸载 `useEffect` 清理；新增实例必须在 `destroyAll()` 里销毁。

## 缓存子系统

分层（改动时保持方向：上层调下层，禁止下层反向依赖调度层）：

```
L4 调度：preloader（唯一状态机）+ smartPreloader（纯策略）
L3 传输：downloadManager（去重/优先级/并发/超时/内部 AbortController）
L2 策略：cacheAdapter（统一接口）+ IDBCacheManager / pwaCacheManager
L1 存储：indexedDB / Cache API
```

关键约定：
- **调用方 AbortSignal 只取消自己的等待**，共享请求由 `downloadManager` 内部 `AbortController` + 引用计数控制。不要把它透传进 `fetch`。
- `adapter.set()` **返回 boolean，必须校验**；失败不要计入预加载成功数。
- 统计（count/size）只在「新建」时自增，覆盖写要先 `removeFromStats`。
- **Service Worker 不再缓存媒体资源**（`public/sw.js` 对跨域 m3u8/ts 直接透传）。媒体缓存唯一归属是页面侧 `lib/cache`，不要在 SW 里加回缓存逻辑——SW 读不到用户的缓存开关。
- SW 与页面侧共用缓存桶名 `m3u8-player-media-v1`，改名必须两边同步。

## SEO

- `lib/seo.ts` 的 `PAGE_SEO_CONFIG` 按「去掉语言前缀」的页面路径登记；`useSeo` 负责 title/description/keywords + canonical + hreflang + `<html lang>`。
- 预渲染路由在 `vite.config.ts` 的 `prerenderPlugin.routes` 里，新增可索引页面要同步加入。

## 样式与可访问性

- 颜色用 Tailwind 语义类并同时给 `dark:` 变体，不要写死 hex（`App.tsx` 的 Toaster 内联色是历史遗留）。
- 图标按钮必须有 `aria-label`；弹窗统一用 `components/ui/Dialog`（自带 role/aria-modal/焦点陷阱/Esc）。
- 开关用 `role="switch"` + `aria-checked`。
- 提示统一用 `sonner`（`toast.success/error/info`）。`utils/toast` 已删除，不要恢复——它包的是 CDN 的 `h5Utils`，被拦截时会静默失联。非 React 上下文（播放器配置、`lib/*`）用 `i18n.t()` + `sonner`。

## 提交约定

- 使用 `type(scope): 描述` 的提交信息（如 `fix(player): ...`、`fix(cache): ...`）。
- 每个任务完成后立即 `git commit` 并 `git push`。
- 不要提交 `dist/`、`docs/`、`pnpm-lock.yaml`（`.gitignore` 已配置，属于有意为之）。

## 已知取舍（不要"顺手修"）

- 缓存类型 `pwa` 的 `isEnabled()` 只反映环境支持，用户开关由上层 `cacheConfigManager.isEnabled()` 判定，adapter 层属防御性冗余。
- 自动预加载的分组键使用子播放列表（level）URL，与 `hlsLoader` 的输入 URL 不同，「当前视频缓存」统计会拆成两份，但不影响命中率。
