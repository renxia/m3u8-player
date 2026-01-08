import { useTranslation } from 'react-i18next'

export default function Footer() {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-slate-900/80 dark:bg-slate-900/80 border-t border-slate-300/50 dark:border-slate-700/50 py-4 md:py-6 transition-colors duration-300">
      <div className="container mx-auto px-2 md:px-4 text-center">
        <p className="text-slate-200 dark:text-slate-400 text-xs md:text-sm mb-1.5 md:mb-2">{t('footer.disclaimer')}</p>
        <a
          href="https://lzw.me"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-100 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-400 text-xs md:text-sm transition-colors"
        >
          Copyright © 志文工作室; 2008-{currentYear}, All Rights Reserved.
        </a>
      </div>
    </footer>
  )
}
