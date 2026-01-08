const CDN_CONFIG = {
  artplayer: [
    'artplayer/5.3.0/artplayer.min.js',
    'https://fastly.jsdelivr.net/npm/artplayer-plugin-hls-control/dist/artplayer-plugin-hls-control.min.js',
    // 'https://fastly.jsdelivr.net/npm/artplayer-plugin-auto-thumbnail/dist/artplayer-plugin-auto-thumbnail.min.js',
  ],
  dplayer: 'dplayer/1.26.0/DPlayer.min.js',
  'hls.js': 'hls.js/1.5.18/hls.min.js',
  'flv.js': 'flv.js/1.6.2/flv.min.js',
  webtorrent: 'webtorrent/1.9.7/webtorrent.min.js',
  twikoo: 'twikoo/1.6.44/twikoo.all.min.js',
}

/** CDN 前缀 */
function getUrlWithCdnPrefix(url: string, lang = navigator.language): string {
  if (url.startsWith('https://')) return url

  if (url.startsWith('/')) url = url.slice(1)
  return `${lang === 'zh-CN' ? 'https://s4.zstatic.net/ajax/libs/' : 'https://cdnjs.cloudflare.com/ajax/libs/'}${url}`
}

export function getCdnUrls(urls: string | string[], lang = navigator.language): string[] {
  if (!Array.isArray(urls)) urls = [urls]

  const fixedUrls: string[] = []

  for (const url of urls) {
    if (url in CDN_CONFIG) {
      const curls = CDN_CONFIG[url as keyof typeof CDN_CONFIG]
      if (Array.isArray(curls)) fixedUrls.push(...curls.map((url) => getUrlWithCdnPrefix(url, lang)))
      else fixedUrls.push(getUrlWithCdnPrefix(curls, lang))
    } else {
      fixedUrls.push(getUrlWithCdnPrefix(url, lang))
    }
  }

  return fixedUrls
}
