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
    const { default: seoPrerender } = await import('vite-plugin-seo-prerender')
    const allRoutes = ['', 'about', 'download', 'feedback', 'settings']
    const seoPrerenderPlugin = seoPrerender({
      routes: ['/', ...['', 'en/', 'ja-JP/'].flatMap((lang) => allRoutes.map((route) => `/${lang}${route}`))],
      puppeteer: {
        // headless: 'false',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      },
      delay: 300,
      concurrency: process.env.PRENDER_CONCURRENCY ? Number(process.env.PRENDER_CONCURRENCY) : 50,
    })

    plugins.push(seoPrerenderPlugin)
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
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist/m3u8-player',
      emptyOutDir: true,
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            router: ['react-router'],
            i18n: ['react-i18next'],
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
  } as UserConfig
})
