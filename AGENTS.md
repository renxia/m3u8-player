# AI 编程开发指引

本文档为 AI 编程助手提供的开发规范和参考指南，用于指导项目开发工作。

## 项目概述

**M3U8 在线播放器** - 一个支持多语言的 M3U8 视频在线播放器

### 技术栈
- **构建工具**: Vite 5.x
- **模板引擎**: Handlebars 4.x
- **开发语言**: TypeScript 5.x
- **包管理器**: Bun 1.x
- **项目类型**: 静态网站 + TypeScript 构建

### 项目特性
- 支持 HLS 协议的 M3U8 资源
- 支持 mp4、flv、磁力链格式视频
- 支持批量剧集播放
- 支持历史记录、收藏夹功能
- 支持中文、英文、日文多语言
- 使用 TypeScript 开发，类型安全
- 组件化架构（HBS 模板）

## 项目结构

```
m3u8-player/
├── src/                    # 源代码目录
│   ├── layouts/            # 布局模板
│   │   └── default.hbs
│   ├── partials/           # 可复用组件
│   │   ├── header.hbs
│   │   └── footer.hbs
│   ├── locales/            # 多语言配置
│   │   ├── zh-CN.json
│   │   ├── en.json
│   │   └── ja-JP.json
│   ├── pages/              # 页面模板
│   │   ├── index.hbs
│   │   ├── about.hbs
│   │   ├── download.hbs
│   │   └── feedback.hbs
│   ├── assets/             # TypeScript 源码和静态资源
│   │   ├── types.ts        # 通用类型定义
│   │   ├── i18n.types.ts   # i18n 类型定义
│   │   ├── main.ts         # 主逻辑 (播放器功能)
│   │   ├── i18n.main.ts    # 国际化
│   │   ├── dl.main.ts      # 下载页逻辑
│   │   ├── favicon.png
│   │   ├── play.html
│   │   └── webtorrent.sw.min.js
│   └── data/               # 数据文件
│       └── version.json
├── dist/                   # 构建输出目录
├── tsconfig.json           # TypeScript 配置
├── vite.config.js         # Vite 构建配置
├── build.js              # 构建脚本
├── package.json          # 项目配置
└── *.md                 # 文档文件
```

## 构建系统

### 构建命令

```bash
# 安装依赖
bun install
# 或
npm install

# 开发模式 (带热更新)
bun run dev

# 生产构建
bun run build

# 预览构建结果
bun run preview
```

### 构建输出

执行 `bun run build` 后：

1. **Vite 编译** - 将 TypeScript 文件编译为 JavaScript
2. **Handlebars 渲染** - 为所有语言生成 HTML 页面
3. **静态资源复制** - 复制 assets 目录中的非 TypeScript 文件
4. **ZIP 压缩** - 生成带时间戳的压缩包

输出位置：
- `dist/m3u8-player/` - 完整的项目文件
- `dist/m3u8-player-[timestamp].zip` - 压缩包

### Vite 配置说明

**vite.config.js** 关键配置：

```javascript
{
  root: 'src',                          // 源代码根目录
  build: {
    outDir: '../dist/m3u8-player',       // 输出目录
    rollupOptions: {
      input: {
        // TypeScript 入口文件
        'main': path.resolve(__dirname, 'src/assets/main.ts'),
        'i18n.main': path.resolve(__dirname, 'src/assets/i18n.main.ts'),
        'dl.main': path.resolve(__dirname, 'src/assets/dl.main.ts'),
      },
      output: {
        entryFileNames: 'assets/[name].js',  // JS 输出到 assets/
      }
    }
  }
}
```

## TypeScript 开发规范

### 类型定义位置

1. **通用类型** - `src/assets/types.ts`
   - `StorageData` - 本地存储数据
   - `PlayListItem` - 播放列表项
   - `PlayerType` - 播放器类型
   - `VideoType` - 视频类型
   - `PlayerElements` - DOM 元素引用
   - 等等

2. **模块特定类型** - 同目录下的 `*.types.ts`
   - `src/assets/i18n.types.ts` - i18n 相关类型

### 添加新的 TypeScript 文件

1. 在 `src/assets/` 下创建 `.ts` 文件
2. 在 `vite.config.js` 的 `rollupOptions.input` 中添加入口
3. Vite 会自动编译并输出到 `dist/m3u8-player/assets/`

示例：
```javascript
// vite.config.js
rollupOptions: {
  input: {
    'main': path.resolve(__dirname, 'src/assets/main.ts'),
    'my-script': path.resolve(__dirname, 'src/assets/my-script.ts'),  // 新增
  }
}
```

### TypeScript 配置

**tsconfig.json** 关键设置：
- `target: "ES2020"` - 目标 ECMAScript 版本
- `module: "ESNext"` - ESM 模块
- `strict: true` - 启用严格类型检查
- `lib: ["ES2020", "DOM"]` - 包含 DOM 类型

## 多语言开发

### 语言文件位置

- `src/locales/zh-CN.json` - 中文
- `src/locales/en.json` - 英文
- `src/locales/ja-JP.json` - 日文

### 添加新语言

1. 复制现有语言文件：
   ```bash
   cp src/locales/zh-CN.json src/locales/fr.json
   ```

2. 编辑新语言文件内容

3. 构建项目：
   ```bash
   bun run build
   ```

4. 新语言版本自动生成在 `dist/m3u8-player/fr/`

### 在代码中使用翻译

在 `.hbs` 模板中：
```handlebars
{{t 'page.title'}}
```

在 TypeScript 代码中：
```typescript
(window as any).translate('translation.key')
```

## Handlebars 模板开发

### Helper 函数

项目注册了以下 Helper：

```handlebars
{{t 'key'}}              // 获取翻译
{{eq value1 value2}}     // 条件判断
{{times n}}             // 循环 n 次
{{url 'path'}}           // 拼接带语言前缀的 URL
```

### 页面模板结构

```handlebars
{{!< layouts/default.hbs}}

<div class="container">
  <h1>{{t 'page.title'}}</h1>
  <p>{{t 'page.description'}}</p>
</div>
```

## 常见任务

### 修改播放器功能

1. 编辑 `src/assets/main.ts`
2. 修改相关 TypeScript 代码（带类型提示）
3. 运行 `bun run build` 测试

### 修改页面 UI

1. 编辑对应的 `.hbs` 模板文件
2. 如需修改文案，编辑 `src/locales/*.json`
3. 运行 `bun run build`

### 添加新页面

1. 在 `src/pages/` 下创建 `.hbs` 文件
2. 在各语言 JSON 中添加翻译
3. 运行 `bun run build`
4. 新页面自动生成在所有语言目录

### 修复构建错误

1. 检查 TypeScript 类型错误
2. 确认 `vite.config.js` 中的入口文件路径正确
3. 确认输出路径 `outDir` 配置正确

## 开发注意事项

### 文件修改原则

1. **优先编辑 TypeScript 文件** - 而非编译后的 JS 文件
2. **编辑模板** - 使用 `.hbs` 文件而非生成的 HTML
3. **更新翻译** - 修改 JSON 文件而非直接修改 HTML

### 类型检查

如需单独进行类型检查：
```bash
bunx tsc --noEmit
```

### Git 忽略

以下内容已被 `.gitignore`：
- `dist/` - 构建输出目录
- `node_modules/` - 依赖目录
- 不包括 `bun.lock`（Bun 的 lockfile 保留）

## 构建输出验证

构建成功后，检查：

```bash
# 检查编译的 JS 文件
ls dist/m3u8-player/assets/*.js

# 预期输出：
# - main.js
# - i18n.main.js
# - dl.main.js
# - preload-helper.js (自动生成)

# 检查 HTML 文件
ls dist/m3u8-player/*.html

# 检查 ZIP 压缩包
ls dist/m3u8-player-*.zip
```

## 文档参考

- [BUILD_GUIDE.md](./BUILD_GUIDE.md) - 详细构建文档
- [README.md](./README.md) - 项目说明
- [MIGRATION.md](./MIGRATION.md) - 迁移历史和变更记录

## 技术栈版本

- Bun: 1.3.4+
- TypeScript: 5.9.3+
- Vite: 5.4.21+
- Handlebars: 4.7.8+
- Node.js: 18+ (兼容性)

## 开发环境要求

- Bun 1.x 或 Node.js 18+
- 支持的操作系统: Windows, macOS, Linux
- 推荐的 IDE: VS Code + TypeScript 插件

## 总结

本文档提供了完整的开发规范，涵盖：
- ✅ 项目结构和技术栈
- ✅ 构建系统使用方法
- ✅ TypeScript 开发规范
- ✅ 多语言开发流程
- ✅ Handlebars 模板开发
- ✅ 常见任务和注意事项

AI 编程助手应遵循本文档的规范进行项目开发工作。
