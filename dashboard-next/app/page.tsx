'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { IndustrySignal } from '@/lib/types'
import ProcessTab from '@/components/ProcessTab'
import RiskTab from '@/components/RiskTab'
import DrilldownTab from '@/components/DrilldownTab'

const TABS = [
  { id: 'process', label: '① 입법 프로세스 이해', icon: '📚' },
  { id: 'risk', label: '② 산업별 리스크 현황', icon: '📊' },
  { id: 'drilldown', label: '③ 산업 드릴다운', icon: '🔍' },
]

interface OverallStats {
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
  const [signals, setSignals] = useState<IndustrySignal[]>([])
  const [stats, setStats] = useState<OverallStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [asOf, setAsOf] = useState<string>('')

  useEffect(() => {
    Promise.all([loadSignals(), loadStats()])
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function loadSignals() {
    const { data, error } = await supabase
      .from('industry_signals')
      .select('*')
    if (error) throw error
    setSignals(data ?? [])
    if (data?.length) {
      const dates = data.map(d => d.as_of_date).filter(Boolean)
      if (dates.length) setAsOf(dates.sort().at(-1)!)
    }
  }

  async function loadStats() {
    const { data: allBills } = await supabase
      .from('bills')
      .select('proc_result_cd, committee_result, regulation_type')

    if (!allBills) return

    const PASS = new Set(['원안가결', '수정가결'])
    const PROCESSED = new Set(['원안가결', '수정가결', '폐기', '부결', '대안반영폐기', '수정안반영폐기', '철회'])

    let committee_reviewed = 0, passed = 0, pending = 0
    let regulation = 0, support = 0, neutral = 0

    for (const b of allBills) {
      if (b.committee_result) committee_reviewed++
      if (PASS.has(b.proc_result_cd)) passed++
      if (!PROCESSED.has(b.proc_result_cd ?? '')) pending++
      if (b.regulation_type === '규제') regulation++
      else if (b.regulation_type === '지원') support++
      else neutral++
    }

    const { count: promulgated } = await supabase
      .from('promulgations')
      .select('*', { count: 'exact', head: true })

    setStats({
      bills: allBills.length,
      committee_reviewed,
      passed,
      promulgated: promulgated ?? 0,
      pending,
      regulation,
      support,
      neutral,
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#f8fafc' }}>
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">데이터를 불러오는 중…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8fafc' }}>
        <div className="rounded-xl p-6 text-center bg-white" style={{ border: '1px solid #e2e8f0' }}>
          <p className="text-red-500 font-semibold mb-2">데이터 로드 실패</p>
          <p className="text-slate-500 text-xs">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      {/* 헤더 */}
      <header className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between bg-white" style={{ backdropFilter: 'blur(12px)', borderBottom: '1px solid #e2e8f0' }}>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight">
            <span style={{ color: '#2563eb' }}>Legis</span>
            <span className="text-slate-800">cope</span>
          </span>
          <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
            입법 리스크 대시보드
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          {stats && (
            <>
              <span><span className="text-slate-700 font-medium">{stats.bills.toLocaleString()}</span>건 분석</span>
              <span>|</span>
            </>
          )}
          {asOf && <span>기준일: {asOf.slice(0, 10)}</span>}
        </div>
      </header>

      {/* 탭 */}
      <nav className="px-6 pt-5 pb-0 flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-shrink-0 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors"
            style={{
              background: tab === t.id ? '#ffffff' : 'transparent',
              color: tab === t.id ? '#0f172a' : '#94a3b8',
              border: tab === t.id ? '1px solid #e2e8f0' : '1px solid transparent',
              borderBottom: tab === t.id ? '1px solid #ffffff' : '1px solid transparent',
            }}
          >
            <span className="mr-1.5">{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>

      {/* 콘텐츠 */}
      <main className="px-4 sm:px-6 py-6" style={{ marginTop: -1 }}>
        <div className="rounded-xl rounded-tl-none bg-white" style={{ border: '1px solid #e2e8f0' }}>
          <div className="p-4 sm:p-6">
            {tab === 'process' && stats && <ProcessTab stats={stats} />}
            {tab === 'risk' && <RiskTab signals={signals} />}
            {tab === 'drilldown' && <DrilldownTab signals={signals} />}
          </div>
        </div>
      </main>

      {/* 푸터 */}
      <footer className="px-6 py-4 text-center text-xs text-slate-400">
        데이터 출처: 국회 OpenAPI · 법제처 DRF · 정부입법지원센터 · korea.kr &nbsp;|&nbsp; Legiscope © 2026
      </footer>
    </div>
  )
}
