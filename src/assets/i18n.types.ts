export interface I18nMessages extends Record<string, string> {
  sopebap: string
  petc: string
  osdv: string
  tmcy: string
  nohrec: string
  nofav: string
  penterurl: string
  recdl: string
  noversions: string
  // 'Release Date': string;
  // Version: string;
  // Size: string;
}

export type Lang = 'en' | 'zh' | 'ja'
export type I18nData = Record<Lang, I18nMessages>
