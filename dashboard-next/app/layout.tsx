import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Legiscope — 입법 리스크 대시보드',
  description: '국회 입법 활동 및 산업별 규제 리스크 현황',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
