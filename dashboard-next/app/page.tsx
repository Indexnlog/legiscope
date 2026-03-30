'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { IndustrySignal } from '@/lib/types'
import ProcessTab from '@/components/ProcessTab'
import RiskTab from '@/components/RiskTab'
import DrilldownTab from '@/components/DrilldownTab'
import CompanyTab from '@/components/CompanyTab'

const TABS = [
  { id: 'process', label: '입법 프로세스', service: '' },
  { id: 'risk', label: '산업별 리스크', service: 'pdeck Macro > 금융 및 리스크' },
  { id: 'drilldown', label: '산업 드릴다운', service: 'pdeck 기업정보 > 산업정보' },
  { id: 'company', label: '기업 조회', service: 'pdeck 기업정보 > 규제리스크' },
]

export interface OverallStats {
  bills: number
  committee_reviewed: number
  passed: number
  promulgated: number
  pending: number
  regulation: number
  support: number
  neutral: number
}

export default function Dashboard() {
  const [tab, setTab] = useState('process')
  const [drilldownKsic, setDrilldownKsic] = useState<string | null>(null)
  const [signals, setSignals] = useState<IndustrySignal[]>([])
  const [stats, setStats] = useState<OverallStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [asOf, setAsOf] = useState<string>('')

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get('ksic')
    if (k) { setDrilldownKsic(k); setTab('drilldown') }
  }, [])

  useEffect(() => {
    Promise.all([loadSignals(), loadStats()])
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  function goToDrilldown(code: string) {
    setDrilldownKsic(code)
    setTab('drilldown')
  }

  async function loadSignals() {
    const { data: latest } = await supabase
      .from('industry_signals')
      .select('as_of_date')
      .order('as_of_date', { ascending: false })
      .limit(1)
      .single()
    const latestDate = latest?.as_of_date
    const { data, error } = await supabase
      .from('industry_signals')
      .select('*')
      .eq('as_of_date', latestDate ?? '')
    if (error) throw error
    const raw = data ?? []
    const deduped = new Map<string, typeof raw[0]>()
    for (const s of raw) {
      const key = `${s.ksic_code}_${s.ksic_level}`
      const prev = deduped.get(key)
      if (!prev || (s.total_bills ?? 0) > (prev.total_bills ?? 0)) deduped.set(key, s)
    }
    setSignals(Array.from(deduped.values()))
    if (latestDate) setAsOf(latestDate)
  }

  async function loadStats() {
    const PASSED = ['원안가결', '수정가결']
    const PROCESSED = ['원안가결', '수정가결', '폐기', '부결', '대안반영폐기', '수정안반영폐기', '철회']

    const [r0, r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
      supabase.from('bills').select('*', { count: 'exact', head: true }),
      supabase.from('bills').select('*', { count: 'exact', head: true }).in('proc_result_cd', PASSED),
      supabase.from('bills').select('*', { count: 'exact', head: true }).not('committee_result', 'is', null),
      supabase.from('bills').select('*', { count: 'exact', head: true }).eq('regulation_type', '규제'),
      supabase.from('bills').select('*', { count: 'exact', head: true }).eq('regulation_type', '지원'),
      supabase.from('bills').select('*', { count: 'exact', head: true }).eq('regulation_type', '중립'),
      supabase.from('promulgations').select('*', { count: 'exact', head: true }),
      supabase.from('bills').select('*', { count: 'exact', head: true }).in('proc_result_cd', PROCESSED),
    ])

    const bills = r0.count ?? 0
    setStats({
      bills,
      passed: r1.count ?? 0,
      committee_reviewed: r2.count ?? 0,
      regulation: r3.count ?? 0,
      support: r4.count ?? 0,
      neutral: r5.count ?? 0,
      promulgated: r6.count ?? 0,
      pending: bills - (r7.count ?? 0),
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="rounded-xl p-6 text-center border border-gray-100">
          <p className="text-red-500 font-semibold mb-2">데이터 로드 실패</p>
          <p className="text-slate-400 text-xs">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight text-slate-900">
              Legis<span className="text-blue-600">cope</span>
            </span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              입법 리스크 대시보드
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {stats && (
              <span className="font-medium text-slate-600">{stats.bills.toLocaleString()}건</span>
            )}
            {asOf && (
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-mono text-[11px]">
                {asOf.slice(0, 10)}
              </span>
            )}
          </div>
        </div>

        {/* 탭 */}
        <nav className="max-w-7xl mx-auto px-6 flex gap-1.5 overflow-x-auto pt-1 pb-2">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                tab === t.id
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {(() => {
          const current = TABS.find(t => t.id === tab)
          return current?.service ? (
            <p className="text-[11px] text-slate-400 mb-4">
              <span className="text-blue-500 font-medium">서비스 노출:</span> {current.service}
            </p>
          ) : null
        })()}
        {tab === 'process' && stats && <ProcessTab stats={stats} />}
        {tab === 'risk' && <RiskTab signals={signals} asOf={asOf} onDrilldown={goToDrilldown} />}
        {tab === 'drilldown' && <DrilldownTab signals={signals} initialKsic={drilldownKsic} />}
        {tab === 'company' && <CompanyTab signals={signals} />}
      </main>

      {/* 푸터 */}
      <footer className="max-w-7xl mx-auto px-6 py-6 text-center text-[11px] text-slate-300">
        국회 OpenAPI · 법제처 DRF · 정부입법지원센터 · korea.kr &nbsp;|&nbsp; Legiscope 2026
      </footer>
    </div>
  )
}
