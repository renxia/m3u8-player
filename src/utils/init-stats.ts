export function initStats({ gaId = '', baiduId = '' } = {}) {
  if (location.hostname.includes('localhost')) return

  // 初始化百度统计
  const win = window as unknown as { _hmt: unknown[] }
  if (!Array.isArray(win._hmt) || win._hmt.length === 0) {
    win._hmt = []
    if (!baiduId) baiduId = import.meta.env.MD_BAIDU_ID || '70e1b27b04035b8343fc3143c21a6790'
    window.h5Utils.loadJsOrCss(`https://hm.baidu.com/hm.js?${baiduId}`, { async: true })
  }

  // 初始化 Google Analytics (GA4)
  if (!gaId) gaId = import.meta.env.MD_GA_ID || 'G-Q8G8YS30ZX'
  window.h5Utils.loadJsOrCss(`https://www.googletagmanager.com/gtag/js?id=${gaId}`, {
    async: true,
  })

  // 初始化 gtag
  const script2 = document.createElement('script')
  script2.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${gaId}');
    `
  document.head.appendChild(script2)
}
