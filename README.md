# M3U8 在线播放器

[在线预览：https://m3u8-player.lzw.me](https://m3u8-player.lzw.me)

一个体验良好的免费 M3U8 视频在线播放器，支持 7 种语言、HLS 分片缓存与离线播放。

## 特性

- **播放能力**：HLS（M3U8）、MP4、FLV、磁力链；Artplayer / DPlayer 双播放器可切换
- **观影体验**：0.5x–8x 倍速、长按倍速、截图、画面旋转、画中画、全屏、键盘快捷键
- **批量剧集**：粘贴多行 M3U8 地址自动解析为剧集列表并连播
- **缓存与离线**：HLS 分片缓存（Cache API / IndexedDB 可切换）、自动预加载、配额与命中率展示、Service Worker 离线访问
- **本地存储**：历史记录、收藏夹
- **多语言**：简体中文、English、日本語、Français、Deutsch、Português、Español
- **分享**：生成海报（WebP）+ 二维码，支持系统分享与图片下载
- **SEO**：多语言 × 多页面预渲染、canonical / hreflang

## 技术栈

| 项 | 版本 |
|---|---|
| Node.js | 20.19+ |
| pnpm | 12.x |
| React | 19 |
| React Router | 8（`BrowserRouter` 模式） |
| TypeScript | 7 |
| Vite | 8（Rolldown 内核） |
| Tailwind CSS | 4（`@tailwindcss/vite`，主题定义在 `src/index.css`） |
| i18next / react-i18next | 26 / 17 |
| Biome | 2（格式化 + lint） |

播放器内核（hls.js / flv.js / Artplayer / DPlayer / WebTorrent）通过 CDN 运行时注入，见 `src/lib/cdn.ts`，不参与打包。

## 快速开始

```bash
pnpm install
pnpm run dev        # 开发服务器 http://localhost:3009
pnpm run build      # 类型检查 + 构建 + 打包 zip
pnpm run preview    # 预览构建产物
pnpm run lint       # biome check --fix
```

## 目录结构

```
src/
├── App.tsx                 # 路由（7 语言 × 5 页面，按语言清单自动展开）
├── main.tsx                # 入口：主题初始化、i18n、统计脚本
├── components/
│   ├── Player/             # 播放器容器、控制栏、输入表单、历史/收藏、缓存指示器
│   ├── DevTools/           # 仅 DEV 构建可见
│   ├── ServiceWorker*/     # SW 设置与更新提示
│   ├── ui/                 # 通用 Dialog 基座（焦点陷阱 / Esc / aria）
│   └── Header/Footer/Layout/ShareDialog/...
├── hooks/
│   ├── player/             # artplayer/dplayer 配置、hls 实例、降级、缩略图
│   └── usePlayer/useCache/useSeo/useTheme/useKeyboardShortcuts/...
├── i18n/
│   ├── languages.ts        # 语言清单唯一来源（新增语言只改这里）
│   └── locales/*.json      # 7 个语言包
├── lib/
│   ├── cache/              # IndexedDB / Cache API、适配器、预加载、下载管理、m3u8 解析
│   ├── serviceWorker/      # SW 注册与 hooks
│   ├── monitor|network|resource/   # 性能、网络、存储配额监控
│   └── share/seo/storage/embed/cdn/utils
├── pages/                  # Home / About / Download / Feedback / Settings
└── types/
public/                     # sw.js、manifest.json、静态资源
scripts/build.ts            # 构建脚本（tsc → vite build → zip）
scripts/i18n-align.ts       # 语言包 key 对齐
```

## 环境变量

| 变量 | 作用 |
|---|---|
| `SEO_PRERENDER` | 非空时启用预渲染（`scripts/build.ts` 检测到 Chrome 会自动设置） |
| `PUPPETEER_EXECUTABLE_PATH` | 预渲染使用的 Chrome 路径 |
| `PRENDER_CONCURRENCY` | 预渲染并发数，默认 50 |
| `MD_BAIDU_ID` / `MD_GA_ID` | 统计脚本 ID（见 `index.html`） |

## 构建产物

- `dist/m3u8-player/` — 完整站点
- `dist/m3u8-player.zip` — 压缩包

`dist/`、`docs/`、`pnpm-lock.yaml` 按约定不入库（见 `.gitignore`）。

## 相关

- [m3u8 视频批量下载工具](https://github.com/lzwme/m3u8-dl)

## 许可证

Copyright © 志文工作室
