const i18n = {
  en: {
    sopebap: 'Successfully obtained, please edit below and play',
    petc: 'Please enter the correct m3u8 video address',
    osdv: 'Only supports downloading videos in m3u8 format',
    tmcy: 'The M3U8 content you entered is an encrypted resource. If playback fails, please also enter the URL address of the source page to try to obtain decryption information',
    nohrec: 'No historical records available',
    nofav: 'No favorites',
    penterurl: 'Please enter the URL or content of m3u8',
    // for download page
    recdl: 'Recommend downloads for your system',
    noversions: 'No version suitable for your system was detected, please select manual download below.',
  },
  zh: {
    // 中文
    Copied: '已复制',
    Copy: '复制',
    Play: '播放',
    Delete: '删除',
    Fav: '收藏',
    Collected: '已收藏',
    'Successfully added to favorites': '收藏成功',
    'Start playing the content of the editor box': '开始播放编辑框中的内容',
    sopebap: '获取成功，请在下方编辑后播放',
    petc: '请输入正确的 m3u8 视频地址',
    osdv: '仅支持下载 m3u8 格式的视频',
    'Just Now': '刚刚',
    'minute ago': '分钟前',
    tmcy: '您输入的 M3U8 内容为加密资源，若播放失败，请同时输入来源页面 URL 地址尝试获取解密信息',
    nohrec: '暂无历史记录',
    nofav: '暂无收藏',
    penterurl: '请输入 m3u8 地址或内容',
    recdl: '为您的系统推荐下载',
    'Release Date': '发布日期',
    Version: '版本',
    noversions: '未检测到适合您系统的版本，请在下方选择手动下载。',
    Size: '大小',
  },
  ja: {
    // 日文
    Copied: 'コピー済み',
    Copy: 'レプリケーション',
    Play: '再生',
    Delete: '削除',
    Fav: 'コレクション',
    Collected: 'お気に入り',
    'Successfully added to favorites': 'お気に入りに追加しました',
    'Start playing the content of the editor box': '動画の編集ボックスの内容を再生する',
    sopebap: '成功を収めました。下で編集して再生してください',
    petc: '正しく m3u8 ビデオのアドレスを入力してください',
    osdv: 'm3u8 ビデオのみをダウンロードできます',
    'Just Now': 'たった今',
    'minute ago': '分前',
    tmcy: 'あなたが入力した M3U8 コンテンツは暗号化されたリソースです。再生に失敗した場合は、ソースページの URL アドレスも入力して、復号情報を取得しようとしてください',
    nohrec: '履歴はありません',
    nofav: 'お気に入りはありません',
    penterurl: 'm3u8 アドレスまたは内容を入力してください',
    recdl: 'お使いのシステムに推奨されるダウンロード',
    'Release Date': 'リリース日',
    Version: 'バージョン',
    noversions: 'お使いのシステムに適したバージョンは見つかりません。下にある手動ダウンロードを選択してください。',
    Size: 'サイズ',
  },
};

const initLang = () => {
  let lang = navigator.language || navigator.userLanguage;
  if (lang.includes('zh')) lang = 'zh';
  if (lang.startsWith('ja')) lang = 'ja';
  if (location.pathname.includes('/ja-')) lang = 'ja';
  if (location.pathname.includes('/en')) lang = 'en';
  console.log('lang', lang);
  return lang;
};
const LANG = initLang();
window.translate = str => {
  return (i18n[LANG] || i18n['en'])[str] || i18n['en'][str] || str;
};
