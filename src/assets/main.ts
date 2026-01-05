;(() => {
  if (location.host === 'lzw.me') {
    location.href = location.href.replace('https://lzw.me/x/m3u8-player', 'https://m3u8-player.lzw.me')
    return
  }

  const urlParams = (window as any).h5Utils?.getUrlParams() || {}
  const uri = urlParams.url ? decodeURIComponent(urlParams.url as string) : ''
  const urlVideoTitle = urlParams.title ? decodeURIComponent(urlParams.title as string) : ''
  const lang = (['/en/', '/ja-jp/'].find((d: string) => location.href.includes(d)) || 'zh').replace(/\//g, '')

  if (uri.startsWith('http:') && location.protocol === 'https:') {
    if (!uri.startsWith('http://localhost')) {
      ;(window as any).h5Utils?.alert(
        '由于浏览器安全限制，您访问的 https 页面下无法播放 http 协议的资源，请手动修改访问 URL 改为 http:// 格式并重新访问',
      )
    } else {
      const logo = document.querySelector('a.am-topbar-logo')
      if (logo) logo.setAttribute('href', location.href.replace('https:', 'http:'))
    }
  }

  const storage: StorageInterface = {
    save(key: string, data: StorageData[]) {
      if (!key) return
      localStorage.setItem(`mp_${key}`, JSON.stringify(data))
    },
    get(key: string): StorageData[] {
      try {
        return JSON.parse(localStorage.getItem(`mp_${key}`) || localStorage.getItem(key) || '[]')
      } catch (_e) {
        return []
      }
    },
    remove(key: string) {
      localStorage.removeItem(`mp_${key}`)
    },
  }

  const cdnPrefix = lang === 'zh' ? 'https://s4.zstatic.net/ajax/libs/' : 'https://cdnjs.cloudflare.com/ajax/libs/'

  const MP = {
    cdn: {
      m3u8Demo: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      dplayer: `${cdnPrefix}dplayer/1.26.0/DPlayer.min.js`,
      artplayer: [
        `${cdnPrefix}artplayer/5.3.0/artplayer.min.js`,
        'https://fastly.jsdelivr.net/npm/artplayer-plugin-hls-control/dist/artplayer-plugin-hls-control.min.js',
        'https://fastly.jsdelivr.net/npm/artplayer-plugin-auto-thumbnail/dist/artplayer-plugin-auto-thumbnail.min.js',
      ],
    } as CDNUrls,
    inc: {
      art: null,
      dp: null,
      hls: null,
      flvPlayer: null,
      wtClient: null,
    } as PlayerInstances,
    data: {
      playList: storage.get('playlist') as PlayListItem[],
    } as PlayerData,
    el: {
      urlInput: document.querySelector('input#urlInput') as HTMLInputElement,
      m3u8Content: document.querySelector('textarea#m3u8Content') as HTMLTextAreaElement,
      vedioSelect: document.querySelector('#vedioSelect') as HTMLInputElement,
      playBtn: document.querySelector('#playBtn') as HTMLElement,
      rotateBtn: document.querySelector('#rotateBtn') as HTMLElement,
      downloadBtn: document.querySelector('#downloadBtn') as HTMLElement,
      inputForm: document.querySelector('#inputForm') as HTMLElement,
      player: document.querySelector('#player') as HTMLElement,
      playList: document.querySelector('#playList') as HTMLElement,

      tabFav: document.getElementById('tab-fav'),
      favList: document.getElementById('fav-list'),
      tabHistory: document.getElementById('tab-history'),
      historyList: document.getElementById('history-list'),
    } as PlayerElements,

    getUrl(alertOnFail = false): string {
      let url = this.el.urlInput.value.trim() || this.cdn.m3u8Demo
      if (!url.startsWith('http')) {
        if (url.includes('http')) {
          const r = url.match(/https?:\/\/[a-z0-9\-./]+/i)
          if (r) url = r[0]
        } else url = ''
      }

      if (!url && alertOnFail) (window as any).h5Utils?.alert((window as any).translate('petc'))
      return url
    },

    async init(): Promise<void> {
      if (!this.el.urlInput) return

      this.el.urlInput.setAttribute('placeholder', this.cdn.m3u8Demo)
      this.renderList('history')
      this.renderList('fav')
      this.initEvent()

      if ((this.data.playList.length && !uri) || this.data.playList.find((d: PlayListItem) => d.url === uri)) {
        this.renderPlayList(this.data.playList)
      }

      if (uri) {
        this.el.urlInput.value = uri
        if (urlParams.autoplay !== '0') this.play(uri, undefined, undefined, urlVideoTitle)

        if (self !== window.top || urlParams.type === '1') {
          document.querySelector('body')?.classList.add('fullscreen')
          const twikooComment = document.querySelector('#twikooComment')
          if (twikooComment) twikooComment.remove()
          const main = document.querySelector('main')
          if (main) main.classList.remove('container')
          if (urlParams.showInput !== '1') this.el.inputForm.classList.add('hidden')
        }
      } else if (!this.data.playList.length && urlParams.autoplay) {
        this.play(this.cdn.m3u8Demo)
      }
    },

    initEvent(): void {
      const onPlayBtnClk = (ev: Event) => {
        let url = this.getUrl(false)
        let m3u8Str = this.el.m3u8Content.value.trim()
        let type = ''

        if (m3u8Str) {
          const isExtM3U = m3u8Str.startsWith('#EXTM3U')

          if (isExtM3U) {
            const m = /EXT-X-KEY: *METHOD=AES-\d+,URI=['"]*\//.exec(m3u8Str)
            if (m) {
              if (url.startsWith('http')) {
                m3u8Str = m3u8Str.replace(m[0] || '', `EXT-X-KEY:METHOD=AES-128,URI="${new URL(url).origin}/`)
              } else {
                return (window as any).h5Utils?.alert((window as any).translate('tmcy'))
              }
            }

            m3u8Str = m3u8Str
              .split('\n')
              .map((line: string) => {
                if (!line.startsWith('http') && (line.includes('.m3u8') || line.includes('.ts'))) line = new URL(line, url).toString()
                return line
              })
              .join('\n')

            type = 'customHls'
            url = URL.createObjectURL(new Blob([m3u8Str], { type: 'text/plain;charset=utf-8' }))
          } else if (m3u8Str.includes('.m3u8')) {
            // 支持内容为 m3u8 剧集列表
            const list: PlayListItem[] = m3u8Str
              .split('\n')
              .filter((d: string) => d.includes('.m3u8'))
              .map((d: string, i: number) => {
                const parts = d.split(/[$\s]+/)
                let url = parts[0]
                let name = `第${i + 1}集`
                if (name.startsWith('http')) [url, name] = [name, url]
                return { url, name }
              })

            if (list.length) {
              this.data.playList = list
              storage.save('playlist', list)
              url = list[0].url
            }
          }
        }

        const target = ev.target as HTMLElement
        this.play(url, type, target.getAttribute('data-player') as PlayerType)
      }

      document.querySelectorAll('.player-btn').forEach((el: Element) => el.addEventListener('click', onPlayBtnClk))

      const clearBtn = document.querySelector('#clearM3u8ContentBtn')
      if (clearBtn) {
        clearBtn.addEventListener('click', () => (this.el.m3u8Content.value = ''))
      }

      const getBtn = document.querySelector('#getAndEditBtn')
      if (getBtn) {
        getBtn.addEventListener('click', () => {
          const url = this.getUrl(true)
          if (!url) return

          fetch(url)
            .then((d) => d.text())
            .then((str) => {
              this.el.m3u8Content.value = str
              this.el.m3u8Content.setAttribute('rows', '10')
              this.addHistory(url)
              ;(window as any).h5Utils
                ?.alert((window as any).translate('sopebap'), { icon: 'success' })
                .then(() => setTimeout(() => this.el.m3u8Content.focus(), 350))
            })
            .catch((err) => (window as any).h5Utils?.alert(`Error：${(err as Error).message}`))
        })
      }

      let vedioRotate = 0
      this.el.rotateBtn.addEventListener('click', (ev: Event) => {
        ev.preventDefault()
        vedioRotate += 90
        if (vedioRotate === 360) vedioRotate = 0

        this.el.player.style.transform = `rotate(${vedioRotate}deg)`
      })

      this.el.downloadBtn.addEventListener('click', () => {
        const url = this.getUrl(true)
        if (!url) return
        if (!url.includes('.m3u8')) return (window as any).h5Utils?.alert((window as any).translate('osdv'))
        window.open(`https://m3u8-downloader.lzw.me?url=${encodeURIComponent(url)}`)
      })

      this.el.vedioSelect.addEventListener('change', (ev: Event) => {
        console.log((ev.target as HTMLInputElement).files)
        const file = (ev.target as HTMLInputElement).files?.[0]
        if (!file) return
        const url = window.URL.createObjectURL(file)

        this.play(url, file.name.includes('.m3u8') ? 'customHls' : '')
      })

      const dropzone = document.querySelector<HTMLDivElement>('main.container')
      if (dropzone) {
        dropzone.addEventListener('dragover', (event: Event) => event.preventDefault(), false)
        dropzone.addEventListener(
          'drop',
          (e: DragEvent) => {
            e.preventDefault()
            const fileList = e.dataTransfer?.files
            const file = fileList?.[0]
            if (file?.name.endsWith('.m3u8')) {
              file.text().then((m3u8Str: string) => {
                this.el.m3u8Content.value = m3u8Str
                this.el.playBtn.click()
              })
            }
            return false
          },
          false,
        )
      }

      // tab 切换
      if (this.el.tabHistory && this.el.tabFav) {
        this.el.tabHistory.onclick = () => {
          MP.el.tabHistory?.classList.add('border-blue-400', 'text-blue-300')
          MP.el.tabFav?.classList.remove('border-blue-400', 'text-blue-300')
          MP.el.historyList?.classList.remove('hidden')
          MP.el.favList?.classList.add('hidden')
        }
        this.el.tabFav.onclick = () => {
          MP.el.tabFav?.classList.add('border-blue-400', 'text-blue-300')
          MP.el.tabHistory?.classList.remove('border-blue-400', 'text-blue-300')
          MP.el.favList?.classList.remove('hidden')
          MP.el.historyList?.classList.add('hidden')
        }
      }

      // 复制、收藏、删除、清空
      document.addEventListener('click', (e: Event) => {
        const target = e.target as HTMLElement
        if (target.classList.contains('copy-btn')) {
          const url = target.dataset.url
          if (url) (window as any).h5Utils?.copy(url).then((d: unknown) => console.log(d))
          target.textContent = (window as any).translate('Copied')
          setTimeout(() => (target.textContent = (window as any).translate('Copy')), 1000)
        } else if (target.classList.contains('fav-btn')) {
          const url = target.dataset.url
          if (!url) return
          const fav = storage.get('m3u8_fav')
          if (!fav.find((i: StorageData) => i.url === url)) {
            fav.unshift({ url, time: Date.now(), name: target.dataset.name || '' })
            storage.save('m3u8_fav', fav)
            MP.renderList('fav')
            ;(window as any).h5Utils?.toast((window as any).translate('Successfully added to favorites'))
          } else (window as any).h5Utils?.toast((window as any).translate('Collected'))
        } else if (target.classList.contains('del-btn')) {
          const idx = +(target.dataset.idx || 0)
          const historyList = target.closest('#history-list')
          const type = historyList ? 'm3u8_history' : 'm3u8_fav'
          const arr = storage.get(type)
          arr.splice(idx, 1)
          storage.save(type, arr)
          MP.renderList(type === 'm3u8_history' ? 'history' : 'fav')
        } else if (target.id === 'clear-history') {
          const isHistoryHidden = MP.el.historyList?.classList.contains('hidden')
          const type = isHistoryHidden ? 'fav' : 'history'
          storage.remove(type === 'history' ? 'm3u8_history' : 'm3u8_fav')
          MP.renderList(type)
        } else if (target.classList.contains('play-btn')) {
          const url = target.dataset.url
          if (url) {
            MP.el.urlInput.value = url
            MP.el.playBtn.click()
          }
        }
      })
    },

    renderPlayList(list: PlayListItem[] = []): void {
      if (!list.length) {
        this.el.playList.classList.add('hidden')
        return
      }

      const html = list.map((item, idx) => {
        return `<button class="play-btn text-xs text-gray-100 p-1 m-1 bg-blue-600 hover:bg-blue-700 rounded" data-idx="${idx}" data-url="${item.url}">${item.name || `第${idx + 1}集`}</button>`
      })
      this.el.playList.classList.remove('hidden')
      this.el.playList.innerHTML = html.join('')
    },

    // 渲染列表
    renderList(type: ListType): void {
      const list = storage.get(type === 'history' ? 'm3u8_history' : 'm3u8_fav')
      const container = type === 'history' ? this.el.historyList : this.el.favList
      if (!container) return

      container.innerHTML = ''
      if (!list.length) {
        container.innerHTML = `<div class="text-gray-400 text-sm">${(window as any).translate(type === 'history' ? 'nohrec' : 'nofav')}</div>`
        return
      }

      const btncls = ' text-xs px-2 py-1 rounded whitespace-nowrap'

      list.forEach((item, idx) => {
        const nameHtml = item.name ? `<div class="text-sm font-bold text-gray-200 mb-1" title="${item.name}">${item.name}</div>` : ''
        container.innerHTML += `
        <div class="flex bg-gray-900 rounded px-2 md:px-3 py-2 relative">
          <div class="flex-1 min-w-0">
            ${nameHtml}
            <a href="#" class="text-blue-300 break-all hover:underline text-sm md:text-base" title="${item.url}">${item.url}</a>
            <div class="text-xs text-gray-400 mt-1">${this.formatTime(item.time)}</div>
          </div>
          <div class="flex-shrink-0 flex flex-wrap justify-end gap-1 md:gap-2 absolute right-1 bottom-1">
            <button class="del-btn bg-red-600 hover:bg-red-700${btncls}" data-idx="${idx}">${(window as any).translate('Delete')}</button>
            <button class="play-btn bg-blue-600 hover:bg-blue-700${btncls}" data-url="${item.url}">${(window as any).translate(
              'Play',
            )}</button>
            <button class="copy-btn bg-gray-700 hover:bg-gray-600${btncls}" data-url="${item.url}">${(window as any).translate(
              'Copy',
            )}</button>
            ${
              type === 'history'
                ? `<button class="fav-btn bg-yellow-600 hover:bg-yellow-700${btncls}" data-url="${item.url}" data-name="${item.name || ''}"
                >${(window as any).translate('Fav')}</button>`
                : ''
            }
          </div>
        </div>
      `
      })
    },

    addHistory(url: string, updateURI = true, name?: string): void {
      if (!url) return
      const list = (storage.get('m3u8_history') || []).filter((i: StorageData) => i.url !== url).slice(0, 199)

      list.unshift({ url, time: Date.now(), name })
      storage.save('m3u8_history', list)
      this.renderList('history')

      if (updateURI) {
        const params = new URLSearchParams(location.search)
        if (params.get(url) !== encodeURIComponent(url)) {
          params.set('url', encodeURIComponent(url))
          params.delete('name')
          window.history.replaceState({}, '', `${location.pathname}?${params.toString()}`)
        }
      }
    },

    play(url: string, type?: string, player: PlayerType = 'artplayer', name?: string) {
      if (url) url = decodeURIComponent(url)
      else return (window as any).h5Utils?.alert((window as any).translate('penterurl'))

      this.el.player.classList.remove('hidden')
      this.renderPlayList(this.data.playList.find((d: PlayListItem) => d.url === uri) ? this.data.playList : [])
      document.documentElement.scrollTo({ top: this.el.player.offsetTop - 10, behavior: 'smooth' })

      if (!url.startsWith('blob:')) {
        this.addHistory(url, true, name)

        if (this.data.playList.length) {
          const idx = this.data.playList.findIndex((i: PlayListItem) => i.url === url)
          if (idx > -1) {
            this.el.playList.querySelectorAll('button').forEach((el: Element, i: number) => {
              const button = el as HTMLElement
              if (i === idx) {
                button.classList.remove('bg-blue-600', 'hover:bg-blue-700')
                button.classList.add('bg-green-500', 'hover:bg-green-600')
              } else if (button.classList.contains('bg-green-500')) {
                button.classList.remove('bg-green-500', 'hover:bg-green-600')
                button.classList.add('bg-blue-600', 'hover:bg-blue-700')
              }
            })
          }
        }
      } else {
        ;(window as any).h5Utils?.toast((window as any).translate('Start playing the content of the editor box'))
      }

      if (!type) {
        if (url.includes('.m3u8')) {
          type = 'auto'
          if ((window as any).Hls?.isSupported()) type = 'customHls'
        } else if (url.includes('torrent') || url.includes('magnet:')) type = 'customWebTorrent'
        else if (url.includes('.ts')) type = 'customHls'
        else if (url.includes('.mp4')) type = 'mp4'
        else if (url.includes('.flv')) type = 'customFlv'
        else type = 'auto'
      }

      // bt 总使用 dplayer
      if (url.includes('torrent') || url.includes('magnet:')) player = 'dplayer'

      if (this.inc.dp) this.inc.dp.destroy()
      if (this.inc.art) this.inc.art.destroy()

      console.log('player:', player, url, type)
      if (player === 'dplayer') this.dplayer(url, type)
      else this.artplayer(url, type.replace('custom', '').toLowerCase())
    },

    // see https://artplayer.org/document/start/option.html
    async artplayer(url: string, type = ''): Promise<void> {
      let art = this.inc.art
      type = type === 'hls' ? 'm3u8' : type

      await (window as any).h5Utils?.loadJsOrCss(this.cdn.artplayer)

      const Artplayer = (window as any).Artplayer
      if (!Artplayer) return

      Artplayer.PLAYBACK_RATE = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8, 16]
      Artplayer.SEEK_STEP = 10 // 快进步长，单位秒
      Artplayer.FAST_FORWARD_VALUE = 3 // 快进倍速

      art = new Artplayer({
        container: this.el.player,
        url,
        aspectRatio: true,
        autoplay: true,
        autoOrientation: true,
        autoPlayback: true,
        fastForward: true,
        flip: true,
        fullscreen: true,
        fullscreenWeb: true,
        lock: true,
        miniProgressBar: true,
        pip: true,
        playbackRate: true,
        playsInline: true,
        screenshot: true,
        setting: true,
        theme: '#39f',
        type,
        plugins: [
          (window as any).artplayerPluginHlsControl?.({
            quality: {
              control: document.body.clientWidth > 768,
              setting: true,
              getName: (level: { height: number }) => `${level.height}P`,
              title: 'Quality',
              auto: 'Auto',
            },
            audio: {
              control: false,
              setting: true,
              getName: (track: { name: string }) => track.name,
              title: 'Audio',
              auto: 'Auto',
            },
          }),
          (window as any).artplayerPluginAutoThumbnail?.({
            width: 160,
            number: 100,
            scale: 1,
          }),
        ].filter(Boolean),
        customType: {
          m3u8: function playM3u8(video: HTMLVideoElement, url: string, art: any) {
            const Hls = (window as any).Hls
            if (Hls.isSupported()) {
              if (art.hls) art.hls.destroy()
              const hls = new Hls()
              hls.loadSource(url)
              hls.attachMedia(video)
              art.hls = hls
              art.on('destroy', () => hls.destroy())
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = url
            } else {
              art.notice.show = 'Unsupported playback format: m3u8'
            }
          },
          flv: function playFlv(video: HTMLVideoElement, url: string, art: any) {
            const flvjs = (window as any).flvjs
            if (flvjs.isSupported()) {
              if (art.flv) art.flv.destroy()
              const flv = flvjs.createPlayer({ type: 'flv', url })
              flv.attachMediaElement(video)
              flv.load()
              art.flv = flv
              art.on('destroy', () => flv.destroy())
            } else {
              art.notice.show = 'Unsupported playback format: flv'
            }
          },
          torrent: async function playTorrent(video: HTMLVideoElement, url: string, art: any) {
            const WebTorrent = (window as any).WebTorrent
            if (WebTorrent.WEBRTC_SUPPORT) {
              if (art.torrent) art.torrent.destroy()
              art.torrent = new WebTorrent()

              await navigator.serviceWorker.register('./assets/webtorrent.sw.min.js')
              art.torrent.loadWorker(navigator.serviceWorker.controller)

              art.torrent.add(url, (torrent: any) => {
                const file = torrent.files.find((file: any) => file.name.endsWith('.mp4'))
                file.streamTo(video)
              })

              art.on('destroy', () => art.torrent.destroy())
            } else {
              art.notice.show = 'Unsupported playback format: torrent'
            }
          },
        },
        contextmenu: [
          { index: 80, html: 'M3U8下载器客户端', click: () => window.open(`https://m3u8-downloader.lzw.me/portal/`, '_blank') },
          { index: 99, html: 'M3U8在线下载器', click: () => window.open(`https://m3u8-downloader.lzw.me`, '_blank') },
        ],
      })
      this.inc.art = art

      art.on('video:ended', () => {
        console.log('[artplayer]播放完毕', url)
        this.playNext(url, 'artplayer')
      })
      art.on('video:ratechange', () => {
        art.storage.set('playbackRate', art.playbackRate)
      })
      art.on('ready', () => {
        art.playbackRate = +art.storage.get('playbackRate') || 1
        art.contextmenu.remove('version')
      })
    },

    // see https://dplayer.diygod.dev/zh/guide.html
    async dplayer(url: string, type?: string): Promise<void> {
      await (window as any).h5Utils?.loadJsOrCss(this.cdn.dplayer)

      const DPlayer = (window as any).DPlayer
      if (!DPlayer) return

      this.inc.dp = new DPlayer({
        container: this.el.player,
        autoplay: true,
        airplay: true,
        theme: '#FADFA3',
        loop: true,
        lang: 'zh-cn',
        screenshot: true,
        hotkey: true,
        chromecast: true,
        preload: 'auto',
        volume: 0.7,
        playbackSpeed: [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8],
        mutex: true,
        video: {
          url,
          type,
          customType: {
            customHls: (video: HTMLVideoElement, _player: any) => {
              if (MP.inc.hls) MP.inc.hls.destroy()
              const Hls = (window as any).Hls
              MP.inc.hls = new Hls()
              MP.inc.hls.loadSource(video.src)
              MP.inc.hls.attachMedia(video)
            },
            customFlv: (video: HTMLVideoElement, _player: any) => {
              if (MP.inc.flvPlayer) MP.inc.flvPlayer.destroy()
              const flvjs = (window as any).flvjs
              MP.inc.flvPlayer = flvjs.createPlayer({
                type: 'flv',
                url: video.src,
              })
              MP.inc.flvPlayer.attachMediaElement(video)
              MP.inc.flvPlayer.load()
            },
            customWebTorrent: (video: HTMLVideoElement, player: any) => {
              player.container.classList.add('dplayer-loading')
              if (MP.inc.wtClient) MP.inc.wtClient.destroy()
              const tracker = {
                announce: [
                  'udp://explodie.org:6969',
                  'wss://tracker.btorrent.xyz:443',
                  'wss://tracker.webtorrent.dev:443',
                  'wss://tracker.ghostchu-services.top:443/announce',
                  'wss://tracker.files.fm:7073/announce',
                  'wss://tracker.webtorrent.io',
                  'wss://tracker.openwebtorrent.com',
                  'wss://tracker.fastcast.nz',
                  'ws://tracker.ghostchu-services.top:80/announce',
                  'ws://tracker.files.fm:7072/announce',
                  'https://tr.zukizuki.org:443/announce',
                  'https://tracker.yemekyedim.com:443/announce',
                  'https://tracker.moeblog.cn:443/announce',
                  'https://tracker.bt4g.com:443/announce',
                  'https://tracker.zhuqiy.top:443/announce',
                  'https://tracker.leechshield.link:443/announce',
                  'https://tracker.itscraftsoftware.my.id:443/announce',
                  'https://tracker.ghostchu-services.top:443/announce',
                  'https://tracker.gcrenwp.top:443/announce',
                  'https://tracker.expli.top:443/announce',
                  'https://tr.zukizuki.org:443/announce',
                  'https://tr.nyacat.pw:443/announce',
                  'https://sparkle.ghostchu-services.top:443/announce',
                ],
                rtcConfig: {
                  iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    { urls: 'stun:stun.services.mozilla.com' },
                    { urls: 'stun:stunserver.org' },
                    { urls: 'stun:stun.xten.com' },
                    { urls: ['turn:numb.viagenie.ca'], username: 'webrtc@live.com', credential: 'muazkh' },
                  ],
                },
              }
              const WebTorrent = (window as any).WebTorrent
              MP.inc.wtClient = new WebTorrent({ tracker })
              MP.inc.wtClient.add(video.src, { announce: tracker.announce as string[] }, (torrent: any) => {
                console.log('Torrent name:', torrent.name, torrent.files)
                const file = torrent.files.find((file: any) => file.name.endsWith('.mp4'))
                file.renderTo(video, { autoplay: player.options.autoplay }, () => player.container.classList.remove('dplayer-loading'))
              })
            },
          },
        },
        pluginOptions: {
          hls: {},
          flv: { mediaDataSource: {}, config: {} },
          webtorrent: {},
        },
        contextmenu: [{ text: '更多工具', link: 'https://lzw.me/tools' }],
      })

      this.inc.dp.on('error', (e: { message?: string }) => {
        if (e?.message) (window as any).h5Utils?.alert(`播放失败：${e.message || '请检查 URL 是否正确'}`, { icon: 'error' })
      })

      // 当播放完毕时，查找 playlist 中下一个视频播放
      this.inc.dp.on('ended', () => {
        console.log('播放完毕', url)
        this.playNext(url, 'dplayer')
      })
    },

    playNext(url: string, player: PlayerType): void {
      if (!this.data.playList.length) return

      const idx = this.data.playList.findIndex((i: PlayListItem) => i.url === url)
      if (idx > -1) {
        const item = this.data.playList[idx + 1]
        if (item) this.play(item.url, item.type, player)
      }
    },

    formatTime(ts: number | undefined): string {
      if (!ts) return ''

      const d = new Date(ts)
      const now = new Date()
      const diff = Math.floor((now.getTime() - d.getTime()) / 60000)
      if (diff < 1) return (window as any).translate('Just Now')
      if (diff < 60) return `${diff}${(window as any).translate('minute ago')}`
      return d.toLocaleString()
    },
  }

  if (!location.href.includes('download.html')) {
    ;(window as any).MP = MP
    MP.init()
  }
})()
