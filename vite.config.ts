import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
// import tailwindpostcss from '@tailwindcss/postcss'
import react from '@vitejs/plugin-react'
import autoprefixer from 'autoprefixer'
import { defineConfig, type UserConfig } from 'vite'
import { adapter, analyzer } from 'vite-bundle-analyzer'

export default defineConfig(async ({ mode }) => {
  /// biome-ignore lint/suspicious/noExplicitAny: vite plugins version
  const plugins: any[] = [react(), tailwindcss()]

  console.log('SEO_PRERENDER', process.env.SEO_PRERENDER)
  if (process.env.SEO_PRERENDER) {
    const { createVitePlugin, createPuppeteerRenderer } = await import('@lzwme/prerender-kit')
    const allRoutes = ['', 'about', 'download']
    const prerenderPlugin = createVitePlugin({
      routes: ['/', ...['', 'en/', 'ja-JP/', 'fr/', 'de/', 'pt/', 'es/'].flatMap((lang) => allRoutes.map((route) => `/${lang}${route}`))],
      renderer: createPuppeteerRenderer({
        // headless: 'false',
        launchOptions: {
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        },
      }),
      delay: 300,
      concurrency: process.env.PRENDER_CONCURRENCY ? Number(process.env.PRENDER_CONCURRENCY) : 50,
      // HTML 瘦身：等价于原 scripts/optimize-prerendered-html.ts（移除内联 SVG / 大段内联样式 / class，压缩并注入首屏 loading）
      optimize: {
        removeInlineSvg: true,
        removeInlineStyles: true,
        inlineStylesMinLength: 1000,
        removeClassAttributes: true,
        minify: true,
        loadingIndicator: { target: '<div id="app">' },
      },
    })

    plugins.push(prerenderPlugin)
  }

  // 放在最后一个位置
  if (mode === 'analyze') plugins.push(adapter(analyzer({ openAnalyzer: true })))

  return {
    plugins,
    css: {
      postcss: {
        plugins: [autoprefixer()],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    build: {
      outDir: 'dist/m3u8-player',
      emptyOutDir: true,
      target: 'es2020',
      // Vite 8 底层改用 Rolldown：manualChunks（对象形式）已不再支持，改用 codeSplitting.groups。
      // 同时把已弃用的 rollupOptions 替换为 rolldownOptions。
      rolldownOptions: {
        output: {
          codeSplitting: {
            // 正则统一使用 [\\/] 以兼容 Windows 的路径分隔符
            groups: [
              { name: 'react', test: /node_modules[\\/]react(-dom)?[\\/]/ },
              { name: 'router', test: /node_modules[\\/]react-router[\\/]/ },
              { name: 'i18n', test: /node_modules[\\/](i18next|react-i18next)[\\/]/ },
            ],
          },
        },
      },
    },
    server: {
      port: 3009,
      open: false,
    },
    preview: {
      port: 4171,
    },
  } as unknown as UserConfig
})
