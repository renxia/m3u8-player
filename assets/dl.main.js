const ghproxy = navigator.language === 'zh-CN' ? 'https://gh-proxy.com/' : '';
const DL = {
  // 系统类型检测
  detectOS() {
    const ua = navigator.userAgent;
    if (/windows nt/i.test(ua)) return 'windows';
    if (/macintosh|mac os x/i.test(ua)) return 'macos';
    if (/linux/i.test(ua)) return 'linux';
    return '';
  },
  getArch(filename) {
    if (/arm/i.test(filename)) return 'arm';
    if (/x64|amd64/i.test(filename)) return 'x64';
    if (/x86/i.test(filename)) return 'x86';
    return '';
  },
  getOSAsset(assets, os) {
    // 优先顺序: win->exe, mac->dmg/pkg/zip, linux->AppImage/tar.gz
    if (os === 'windows') {
      return assets.find(a => /\.exe$/i.test(a.name)) || assets.find(a => /\.zip$/i.test(a.name));
    }
    if (os === 'macos') {
      return (
        assets.find(a => /\.dmg$/i.test(a.name)) || assets.find(a => /\.pkg$/i.test(a.name)) || assets.find(a => /\.zip$/i.test(a.name))
      );
    }
    if (os === 'linux') {
      return assets.find(a => /\.AppImage$/i.test(a.name)) || assets.find(a => /\.tar\.gz$/i.test(a.name));
    }
    return null;
  },
  assetIcon(name) {
    if (/\.exe$/i.test(name)) return '🪟';
    if (/\.dmg$/i.test(name)) return '🍎';
    if (/\.pkg$/i.test(name)) return '📦';
    if (/\.AppImage$/i.test(name)) return '🐧';
    if (/\.tar\.gz$/i.test(name)) return '🗜️';
    if (/\.zip$/i.test(name)) return '🗜️';
    return '📄';
  },
  formatSize(size) {
    if (size > 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB';
    if (size > 1024) return (size / 1024).toFixed(1) + ' KB';
    return size + ' B';
  },
  formatDate(str) {
    return str ? str.slice(0, 10) : '';
  },
  renderReleaseList(rel, os) {
    const list = document.getElementById('release-list');
    list.innerHTML = `
        <div class="border-b pb-2 mb-2">
          <div class="font-bold text-lg">${rel.name || rel.tag_name} <span class="text-xs text-gray-400">(${this.formatDate(
      rel.published_at
    )})</span></div>
          <div class="flex flex-col gap-2 mt-2">
            ${rel.assets
              .map(
                a => `
              <a href="${ghproxy}${
                  a.browser_download_url
                }" target="_blank" class="inline-flex items-center px-2 py-1 border rounded hover:bg-blue-50 text-sm"
                title="${a.name}">
                <span class="mr-1">${this.assetIcon(a.name)}</span>${a.name}
                <span class="ml-2 text-gray-400">${this.formatSize(a.size)}</span>
              </a>
            `
              )
              .join('')}
          </div></div>
        `;
  },
  renderBestDownload(latest, os) {
    if (!latest || !latest.assets) return;

    const bestDiv = document.getElementById('best-download');
    const asset = this.getOSAsset(latest.assets, os);
    if (!asset) {
      bestDiv.innerHTML = `<div class="text-gray-500 text-center">${translate('noversions')}</div>`;
      return;
    }
    bestDiv.innerHTML = `
        <div class="highlight-download rounded-lg p-6 flex flex-col items-center max-w-md w-full">
          <div class="text-lg mb-2">${translate('recdl')} :</div>
          <a href="${ghproxy}${asset.browser_download_url}" target="_blank"
            class="text-xl font-bold text-indigo-700 hover:text-indigo-500 underline flex items-center mb-2">
            <span class="mr-2 text-2xl">${this.assetIcon(asset.name)}</span>${asset.name}
          </a>
          <div class="text-gray-500 text-sm">${translate('Version')}: ${latest.name || latest.tag_name} | ${translate(
      'Release Date'
    )}: ${this.formatDate(latest.published_at)} | ${translate('Size')}：${this.formatSize(asset.size)}</div>
        </div>
      `;
  },
  async fetchLatestVersion(url) {
    let versionInfo = localStorage.getItem('versionInfo');
    if (versionInfo && versionInfo.data && versionInfo.t < Date.now() - 1000 * 60 * 60 * 24) {
      return versionInfo.data;
    }

    versionInfo = { t: Date.now(), data: null };

    if (!url) url = `https://api.github.com/repos/lzwme/m3u8-dl/releases/latest`;
    try {
      const r = await fetch(url).then(d => d.json());
      if (r) versionInfo.data = r;
    } catch (err) {
      let lurl = `${lang === 'zh' ? '' : '../'}data/version.json?_=${Date.now()}`;
      if (url !== lurl) {
        const r = await this.fetchLatestVersion(lurl);
        if (r) versionInfo.data = r;
      } else {
        h5Utils.alert(`get Version Error: ${err.message}`);
      }
    }

    if (versionInfo.data) {
      localStorage.setItem('versionInfo', JSON.stringify(versionInfo));
      return versionInfo.data;
    }
  },
  async init() {
    await import('./i18n.main.js');
    const os = this.detectOS();
    let lang = location.pathname.includes('/en') ? 'en' : location.pathname.includes('/ja') ? 'ja' : 'zh';

    // https://api.github.com/repos/lzwme/m3u8-dl/releases/latest
    const r = await this.fetchLatestVersion();
    if (r) {
      this.renderBestDownload(r, os);
      this.renderReleaseList(r, os);
    }
  }
};

DL.init();

