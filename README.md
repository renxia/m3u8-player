# M3U8 在线播放器

[在线预览：https://m3u8-player.lzw.me](https://m3u8-player.lzw.me)

一个简单的 M3U8 视频在线播放器，支持多语言，拥有极佳的在线观影体验。

## 特性

- 支持 4/8/16倍速播放、长按倍速等 VIP 级观影体验
- 支持 HLS 协议的 M3U8 资源，支持播放本地文件和在线视频
- M3U8 视频 URL 参数识别播放
- 支持输入批量剧集播放
- 支持 mp4、flv以及磁力链格式的视频播放
- 支持简易的历史记录、收藏夹功能
- 支持中文、英文、日文多语言界面
- 组件化架构，易于维护和扩展
- 使用 TypeScript 开发，类型安全
- 使用 Bun 作为包管理器，构建速度更快

## 快速开始

### 安装依赖

```bash
bun install
# 或
pnpm install
```

### 开发模式

```bash
bun run dev
# 或
pnpm run dev
```

### 构建生产版本

```bash
bun run build
# 或
pnpm run build
```

构建完成后会生成:
- `dist/m3u8-player/` - 项目文件
- `dist/m3u8-player-[timestamp].zip` - 压缩包

## 项目结构

```
src/
├── layouts/        # 布局模板
├── partials/       # 可复用组件
├── locales/        # 多语言配置
├── pages/          # 页面模板
├── assets/         # TypeScript 源码和静态资源
│   ├── types.ts    # 类型定义
│   ├── i18n.types.ts
│   ├── main.ts     # 主逻辑
│   ├── i18n.main.ts
│   └── dl.main.ts
└── index.ts        # Vite 入口
```

详细的构建文档请查看 [BUILD_GUIDE.md](./docs/BUILD_GUIDE.md)

## 相关

- [m3u8 视频批量下载工具](https://github.com/lzwme/m3u8-dl)

## 许可证

Copyright © 志文工作室

