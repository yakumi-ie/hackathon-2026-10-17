import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import stylesheet from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'よりみち — 動画のつづきは、街で。' },
      { name: 'description', content: '近くの動画から、今日のよりみちを見つけよう。' },
    ],
    links: [{ rel: 'stylesheet', href: stylesheet }],
  }),
  shellComponent: Document,
})

function Document({ children }: { children: ReactNode }) {
  return <html lang="ja"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
}
