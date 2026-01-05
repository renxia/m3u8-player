# M3U8 Player 构建系统文档

## 项目结构

```
m3u8-player/
├── src/                      # 源代码目录
│   ├── layouts/              # 布局模板
│   │   └── default.hbs       # 默认布局(header + footer)
│   ├── partials/             # 可复用组件
│   │   ├── header.hbs        # 顶部导航
│   │   └── footer.hbs        # 页脚
│   ├── locales/              # 多语言配置
│   │   ├── zh-CN.json        # 中文
│   │   ├── en.json           # 英文
│   │   └── ja-JP.json        # 日文
│   ├── pages/                # 页面模板
│   │   ├── index.hbs         # 首页
│   │   ├── about.hbs         # 关于
│   │   ├── download.hbs      # 下载
│   │   └── feedback.hbs      # 反馈
│   ├── assets/               # 静态资源
│   │   ├── main.js           # 主脚本
│   │   ├── i18n.main.js      # 多语言脚本
│   │   ├── dl.main.js        # 下载脚本
│   │   ├── favicon.png       # 图标
│   │   └── play.html         # 播放页面
│   └── index.js              # Vite 入口文件
├── dist/                     # 构建输出目录
│   └── m3u8-player/         # 项目输出
│   └── m3u8-player-[timestamp].zip  # 压缩包
├── build.js                 # Bun 构建脚本
├── package.json              # 项目配置
└── vite.config.js            # Vite 配置
```

## 快速开始

### 1. 安装依赖

**使用 Bun (推荐):**
```bash
bun install
```

**使用 npm:**
```bash
npm install
```

### 2. 开发模式

```bash
bun run dev
# 或
npm run dev
```

访问 `http://localhost:3000` 查看效果

### 3. 构建生产版本

```bash
bun run build
# 或
npm run build
```

构建产物将输出到 `dist/m3u8-player/` 目录,并自动生成压缩包

### 4. 预览构建结果

```bash
bun run preview
# 或
npm run preview
```

## 特性说明

### 1. 多语言支持

项目使用 JSON 文件管理多语言内容,位于 `src/locales/` 目录:

- `zh-CN.json` - 中文
- `en.json` - 英文
- `ja-JP.json` - 日文

#### 添加新语言

1. 在 `src/locales/` 创建新的 JSON 文件(如 `fr.json`)
2. 在 JSON 中定义翻译内容,参考现有文件结构
3. 构建时自动生成对应的语言页面

#### 在模板中使用翻译

```handlebars
{{t 'index.inputPlaceholder'}}
{{nav.home}}
{{footer.copyright}}
```

### 2. 组件化

#### 布局(Layouts)

布局文件定义页面整体结构,位于 `src/layouts/`:

- `default.hbs` - 默认布局,包含完整的 HTML 结构

#### 组件(Partials)

可复用组件位于 `src/partials/`:

- `header.hbs` - 顶部导航栏
- `footer.hbs` - 页脚

#### 引用组件

在页面或布局中使用:

```handlebars
{{> header}}
{{> footer}}
```

### 3. URL 处理

#### 相对路径

使用 `url` helper 处理多语言路径:

```handlebars
<a href="../{{url 'about.html'}}">{{nav.about}}</a>
```

- 中文版本生成: `about.html`
- 英文版本生成: `en/about.html`
- 日文版本生成: `ja-jp/about.html`

### 4. Handlebars Helpers

#### {{t 'key.path'}}

获取翻译内容:

```handlebars
{{t 'index.play'}}
```

#### {{eq a b}}

条件判断:

```handlebars
{{#eq lang 'zh-CN'}}
  中文内容
{{else}}
  其他语言内容
{{/eq}}
```

## 构建流程

### 输入
- `src/pages/*.hbs` - 页面模板
- `src/layouts/*.hbs` - 布局模板
- `src/partials/*.hbs` - 组件模板
- `src/locales/*.json` - 多语言配置
- `src/assets/` - 静态资源

### 输出

构建后会生成以下目录结构:

```
dist/
└── m3u8-player/              # 项目输出目录
    ├── index.html             # 中文首页
    ├── about.html            # 中文关于页
    ├── download.html         # 中文下载页
    ├── feedback.html         # 中文反馈页
    ├── en/                  # 英文版本
    │   ├── index.html
    │   ├── about.html
    │   ├── download.html
    │   └── feedback.html
    ├── ja-jp/              # 日文版本
    │   ├── index.html
    │   ├── about.html
    │   ├── download.html
    │   └── feedback.html
    └── assets/              # 静态资源
        ├── main.js
        ├── i18n.main.js
        ├── dl.main.js
        ├── favicon.png
        ├── play.html
        └── webtorrent.sw.min.js
```

### 自动打包

构建完成后,会自动生成压缩包:

```
dist/
└── m3u8-player-[timestamp].zip  # 压缩包 (如: m3u8-player-20260105-1142.zip)
```

时间戳格式: `YYYYMMDD-HHMM` (年月日-时分)

### Bun vs npm 性能

Bun 比 npm 更快,特别是在:

- 🚀 **依赖安装** - 速度快 2-5 倍
- ⚡ **构建速度** - 构建时间约 67-80ms
- 📦 **包管理** - 锁文件更简洁

## 修改和维护

### 修改导航栏

编辑 `src/partials/header.hbs`,修改一处即可应用到所有语言和页面。

### 修改页脚

编辑 `src/partials/footer.hbs`。

### 添加翻译

1. 在所有 `locales/*.json` 文件中添加相同的 key
2. 在模板中使用 `{{t 'key.path'}}` 引用

### 添加新页面

1. 在 `src/pages/` 创建新的 `.hbs` 文件
2. 在 `locales/*.json` 中添加页面相关的翻译
3. 运行 `npm run build` 构建所有语言版本

## 注意事项

1. **静态资源路径**: 在 HTML 中引用 assets 时使用 `../assets/` 前缀
2. **语言切换**: 语言链接会在构建时自动生成
3. **SEO**: 每个语言版本都有独立的 URL,有利于搜索引擎优化
4. **部署**: `dist/m3u8-player/` 目录可以直接部署到静态网站托管服务
5. **压缩包**: 每次构建会自动生成带时间戳的 ZIP 文件,方便版本管理

## 从旧版本迁移

如果您有旧版本的 HTML 文件需要迁移:

1. 提取公共部分(如 header/footer)到 `src/partials/`
2. 将页面内容转换为 Handlebars 模板放入 `src/pages/`
3. 提取所有文本内容到 `locales/*.json`
4. 使用 Handlebars 语法替换硬编码文本

## 常见问题

### Q: 如何添加新的 Helper?

在 `vite.config.js` 的 `registerHelpers()` 函数中注册:

```javascript
Handlebars.registerHelper('helperName', function() {
  // helper logic
  return result;
});
```

### Q: 如何自定义构建输出?

修改 `vite.config.js` 中的配置:

```javascript
export default defineConfig({
  build: {
    outDir: '../dist',  // 输出目录
    // 其他构建选项
  }
});
```

### Q: 如何在开发时热重载?

当前开发模式需要重新构建。建议使用 `npm run build` 后在浏览器中刷新页面查看修改。

## 技术栈

- **Vite** - 快速的构建工具
- **Handlebars** - 模板引擎
- **Tailwind CSS** - CSS 框架(CDN)
- **Font Awesome** - 图标库(CDN)

## 许可证

Copyright © 志文工作室
