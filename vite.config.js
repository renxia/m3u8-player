import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 读取多语言配置
function loadLocales() {
  const localesDir = path.resolve(__dirname, 'src/locales');
  const locales = {};

  if (fs.existsSync(localesDir)) {
    const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));
    files.forEach(file => {
      const lang = file.replace('.json', '');
      const content = fs.readFileSync(path.join(localesDir, file), 'utf-8');
      locales[lang] = JSON.parse(content);
    });
  }

  return locales;
}

// 注册 Handlebars helpers
function registerHelpers() {
  // 获取翻译
  Handlebars.registerHelper('t', function (key, context) {
    const lang = context.data.root.lang || 'zh-CN';
    const locales = context.data.root.locales || {};
    const keys = key.split('.');
    let value = locales[lang];

    keys.forEach(k => {
      if (value && typeof value === 'object') {
        value = value[k];
      }
    });

    return value || key;
  });

  // 条件判断
  Handlebars.registerHelper('eq', function (a, b, options) {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  // 循环
  Handlebars.registerHelper('times', function (n, block) {
    let accum = '';
    for (let i = 0; i < n; ++i) {
      accum += block.fn(i);
    }
    return accum;
  });

  // URL 拼接
  Handlebars.registerHelper('url', function (path) {
    const lang = this.lang || 'zh-CN';
    const langPrefix = lang === 'zh-CN' ? '' : `${lang}/`;
    return langPrefix + path;
  });
}

registerHelpers();

// 递归复制目录的公共函数
function copyDirectoryRecursively(sourceDir, emitFileFn, fileNamePrefix = '', fileFilter = null) {
  if (!fs.existsSync(sourceDir)) return;

  const copy = (dir, prefix = '') => {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        copy(filePath, `${prefix}${file}/`);
      } else {
        // 应用文件过滤
        if (fileFilter && !fileFilter(file)) return;

        const content = fs.readFileSync(filePath);
        emitFileFn({
          type: 'asset',
          fileName: `${fileNamePrefix}${prefix}${file}`,
          source: content
        });
      }
    });
  };
  copy(sourceDir);
}

// 自定义 Vite 插件: Handlebars 构建器
function handlebarsPlugin() {
  return {
    name: 'handlebars-builder',
    enforce: 'post',

    // 将 ESM 转换为 IIFE 格式
    generateBundle(options, bundle) {
      const locales = loadLocales();
      const langs = Object.keys(locales);
      const srcDir = path.resolve(__dirname, 'src');
      const pagesDir = path.join(srcDir, 'pages');
      const layoutsDir = path.join(srcDir, 'layouts');
      const partialsDir = path.join(srcDir, 'partials');

      // 加载布局模板
      const layouts = {};
      if (fs.existsSync(layoutsDir)) {
        const layoutFiles = fs.readdirSync(layoutsDir).filter(f => f.endsWith('.hbs'));
        layoutFiles.forEach(file => {
          const name = file.replace('.hbs', '');
          const content = fs.readFileSync(path.join(layoutsDir, file), 'utf-8');
          layouts[name] = Handlebars.compile(content);
        });
      }

      // 注册 partials
      if (fs.existsSync(partialsDir)) {
        const partialFiles = fs.readdirSync(partialsDir).filter(f => f.endsWith('.hbs'));
        partialFiles.forEach(file => {
          const name = file.replace('.hbs', '');
          const content = fs.readFileSync(path.join(partialsDir, file), 'utf-8');
          Handlebars.registerPartial(name, content);
        });
      }

      // 读取页面文件
      const pages = fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir).filter(f => f.endsWith('.hbs')) : [];

      // 为每种语言生成页面
      langs.forEach(lang => {
        const langData = locales[lang] || {};

        pages.forEach(pageFile => {
          const pageName = pageFile.replace('.hbs', '.html');
          const pagePath = path.join(pagesDir, pageFile);
          const pageContent = fs.readFileSync(pagePath, 'utf-8');

          // 准备模板数据
          const data = {
            lang,
            locales,
            ...langData,
            page: {
              name: pageName.replace('.html', '')
            }
          };

          // 渲染页面内容
          const compiledPage = Handlebars.compile(pageContent);
          const bodyContent = compiledPage(data);

          // 使用布局渲染完整 HTML
          const layoutName = data.layout || 'default';
          if (layouts[layoutName]) {
            data.content = bodyContent;
            const fullHtml = layouts[layoutName](data);

            // 确定输出路径
            let outputPath = pageName;
            if (lang !== 'zh-CN') {
              outputPath = `${lang}/${pageName}`;
            }

            // 写入文件
            this.emitFile({
              type: 'asset',
              fileName: outputPath,
              source: fullHtml
            });
          }
        });
      });

      // 复制静态资源（排除 .ts 文件，因为 Vite 会自动处理）
      copyDirectoryRecursively(
        path.join(srcDir, 'assets'),
        this.emitFile.bind(this),
        'assets/',
        file => !file.endsWith('.ts')
      );

      // 复制 public 目录下的所有内容
      copyDirectoryRecursively(
        path.join(__dirname, 'public'),
        this.emitFile.bind(this)
      );
    },

    // 将 ESM 转换为 IIFE 格式
    renderChunk(code, chunk, options) {
      let newCode = code;

      // 移除 await __vitePreload(...) 整个调用
      newCode = newCode.replace(
        /await\s+__vitePreload\([^)]*\),?\s*/g,
        ''
      );

      // 移除静态 import 语句
      newCode = newCode.replace(
        /import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\s*/g,
        ''
      );

      // 移除 export default
      newCode = newCode.replace(
        /export default\s*\(/g,
        'module.exports = function ('
      );

      // 移除其他 export 语句
      newCode = newCode.replace(
        /export\s+\{[^}]+\};?\s*/g,
        ''
      );

      return { code: newCode };
    }
  };
}

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist/m3u8-player',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'main': path.resolve(__dirname, 'src/assets/main.ts'),
        'i18n.main': path.resolve(__dirname, 'src/assets/i18n.main.ts'),
        'dl.main': path.resolve(__dirname, 'src/assets/dl.main.ts'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.ts')) {
            return 'assets/[name].[hash].js';
          }
          return 'assets/[name].[ext]';
        }
      }
    },
    copyPublicDir: true,
    target: 'es2015',
    minify: false
  },
  plugins: [
    handlebarsPlugin(),
    {
      name: 'transform-dynamic-imports',
      enforce: 'pre',
      transform(code, id) {
        if (id.includes('main.ts') || id.includes('dl.main.ts')) {
          // 将动态 import('./i18n.main.ts') 转换为静态加载
          return code.replace(
            /await\s+import\(['"]\.\/i18n\.main\.ts['"]\)/g,
            'await (async () => { /* i18n loaded via separate script */ })()'
          );
        }
        return null;
      }
    }
  ],
  server: {
    port: 3000,
    open: true
  }
});
