'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { DashboardProvider, useDashboard } from '@/lib/dashboard-context'

const TABS = [
  { href: '/process', label: '입법 프로세스' },
  { href: '/risk', label: '산업별 리스크' },
  { href: '/drilldown', label: '산업 드릴다운' },
  { href: '/company', label: '기업 조회' },
]

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const embed = searchParams.get('embed') === 'true'
  const { stats, asOf, loading } = useDashboard()

  if (embed) {
    return <div className="p-2">{children}</div>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/process" className="text-lg font-bold tracking-tight text-slate-900">
              Legis<span className="text-blue-600">cope</span>
            </Link>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              입법 리스크 대시보드
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {!loading && stats.bills > 0 && (
              <span className="font-medium text-slate-600">{stats.bills.toLocaleString()}건</span>
            )}
            {asOf && (
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-mono text-[11px] font-medium">
                {asOf.slice(0, 10)}
              </span>
            )}
          </div>
        </div>

        <nav className="max-w-7xl mx-auto px-6 flex gap-6 overflow-x-auto border-t border-slate-100">
          {TABS.map(t => (
            <Link
              key={t.href}
              href={t.href}
              className={`px-0.5 py-3 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
                pathname === t.href
                  ? 'text-blue-600 border-blue-600'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-6 text-center text-[11px] text-slate-300">
        국회 OpenAPI · 법제처 DRF · 정부입법지원센터 · korea.kr &nbsp;|&nbsp; Legiscope 2026
      </footer>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <Suspense fallback={
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      }>
        <DashboardShell>{children}</DashboardShell>
      </Suspense>
    </DashboardProvider>
  )
}
