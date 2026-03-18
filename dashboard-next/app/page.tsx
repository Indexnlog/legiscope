'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { IndustrySignal } from '@/lib/types'
import ProcessTab from '@/components/ProcessTab'
import RiskTab from '@/components/RiskTab'
import DrilldownTab from '@/components/DrilldownTab'
import CompanyTab from '@/components/CompanyTab'

const TABS = [
  { id: 'process', label: '① 입법 프로세스 이해', icon: '📚' },
  { id: 'risk', label: '② 산업별 리스크 현황', icon: '📊' },
  { id: 'drilldown', label: '③ 산업 드릴다운', icon: '🔍' },
  { id: 'company', label: '④ 기업별 조회', icon: '🏢' },
]

interface TabMeta { desc: string; pdeck?: string }
const TAB_META: Record<string, TabMeta> = {
  process: {
    desc: '한국 입법 과정의 전체 흐름(발의 → 상임위 심사 → 본회의 가결 → 공포)을 수치로 이해합니다. 42,000+ 법안 기준 단계별 현황, 규제/지원 유형 분포, 주요 용어 해설을 제공합니다.',
  },
  risk: {
    desc: 'KSIC 중분류 80개 산업별 규제 위험 지수(risk_score)와 최근 90일 입법 활성도를 비교합니다. 어느 산업에 규제 입법이 집중되는지 한눈에 파악할 수 있습니다.',
    pdeck: 'Macro > 금융 및 리스크',
  },
  drilldown: {
    desc: '산업(KSIC 중분류)을 선택해 관련 법안 목록, 규제 유형 분포, 연도별 발의 추이를 상세히 확인합니다. 특정 업종의 규제 리스크를 심층 분석할 때 사용합니다.',
    pdeck: '기업정보 > 산업정보 > Macro/Alt Data 최상단',
  },
  company: {
    desc: '기업명과 KSIC 코드를 입력해 해당 기업이 속한 산업의 입법 리스크를 조회합니다. pdeck 기업정보 페이지에서 KSIC 코드가 자동 주입됩니다.',
    pdeck: '기업정보 > 산업정보 > 규제리스크',
  },
}

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
  const [drilldownKsic, setDrilldownKsic] = useState<string | null>(null)
  const [signals, setSignals] = useState<IndustrySignal[]>([])
  const [stats, setStats] = useState<OverallStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [asOf, setAsOf] = useState<string>('')

  // URL ?ksic= 파라미터로 드릴다운 자동 이동 (pdeck 연동)
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
    // 최신 as_of_date 먼저 확인
    const { data: latest } = await supabase
      .from('industry_signals')
      .select('as_of_date')
      .order('as_of_date', { ascending: false })
      .limit(1)
      .single()
    const latestDate = latest?.as_of_date
    // 최신 스냅샷만 로드
    const { data, error } = await supabase
      .from('industry_signals')
      .select('*')
      .eq('as_of_date', latestDate ?? '')
    if (error) throw error
    // DB에 중복 row가 있을 수 있음 → (ksic_code, ksic_level) 기준 dedup, total_bills 최대값 우선
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

    const [
      { count: bills },
      { count: passed },
      { count: committee_reviewed },
      { count: regulation },
      { count: support },
      { count: neutral },
      { count: promulgated },
      { count: processedCount },
    ] = await Promise.all([
      supabase.from('bills').select('*', { count: 'exact', head: true }),
      supabase.from('bills').select('*', { count: 'exact', head: true }).in('proc_result_cd', PASSED),
      supabase.from('bills').select('*', { count: 'exact', head: true }).not('committee_result', 'is', null),
      supabase.from('bills').select('*', { count: 'exact', head: true }).eq('regulation_type', '규제'),
      supabase.from('bills').select('*', { count: 'exact', head: true }).eq('regulation_type', '지원'),
      supabase.from('bills').select('*', { count: 'exact', head: true }).eq('regulation_type', '중립'),
      supabase.from('promulgations').select('*', { count: 'exact', head: true }),
      supabase.from('bills').select('*', { count: 'exact', head: true }).in('proc_result_cd', PROCESSED),
    ])

    setStats({
      bills: bills ?? 0,
      passed: passed ?? 0,
      committee_reviewed: committee_reviewed ?? 0,
      regulation: regulation ?? 0,
      support: support ?? 0,
      neutral: neutral ?? 0,
      promulgated: promulgated ?? 0,
      pending: (bills ?? 0) - (processedCount ?? 0),
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#F4F6F8' }}>
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">데이터를 불러오는 중…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4F6F8' }}>
        <div className="rounded-xl p-6 text-center bg-white shadow-sm border border-gray-200">
          <p className="text-red-500 font-semibold mb-2">데이터 로드 실패</p>
          <p className="text-slate-500 text-xs">{error}</p>
        </div>
      </div>
    )
  }

  const meta = TAB_META[tab]

  return (
    <div className="min-h-screen" style={{ background: '#F4F6F8' }}>
      {/* 헤더 */}
      <header className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight" style={{ color: '#1B2745' }}>
            Legis<span style={{ color: '#2563eb' }}>cope</span>
          </span>
          <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
            입법 리스크 대시보드
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          {stats && (
            <>
              <span><span className="font-medium" style={{ color: '#1B2745' }}>{stats.bills.toLocaleString()}</span>건 분석</span>
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
              color: tab === t.id ? '#1B2745' : '#94a3b8',
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
        <div className="rounded-xl rounded-tl-none bg-white border border-gray-200 shadow-sm">
          {/* 탭 설명 배너 */}
          <div className="px-4 sm:px-6 py-3 border-b border-gray-200" style={{ background: '#f0f9ff' }}>
            <p className="text-xs text-slate-600 leading-relaxed">{meta.desc}</p>
            {meta.pdeck ? (
              <p className="text-xs mt-1" style={{ color: '#2563eb' }}>
                <span className="font-medium">📌 pdeck 연동 위치:</span> {meta.pdeck}
              </p>
            ) : (
              <p className="text-xs mt-1 text-slate-400">내부 팀 이해용 — pdeck 직접 연동 없음</p>
            )}
          </div>
          <div className="p-4 sm:p-6">
            {tab === 'process' && stats && <ProcessTab stats={stats} />}
            {tab === 'risk' && <RiskTab signals={signals} asOf={asOf} onDrilldown={goToDrilldown} />}
            {tab === 'drilldown' && <DrilldownTab signals={signals} initialKsic={drilldownKsic} />}
            {tab === 'company' && <CompanyTab signals={signals} />}
          </div>
        </div>
      </main>

      {/* 푸터 */}
      <footer className="px-6 py-4 text-center text-xs text-gray-400">
        데이터 출처: 국회 OpenAPI · 법제처 DRF · 정부입법지원센터 · korea.kr &nbsp;|&nbsp; Legiscope © 2026
      </footer>
    </div>
  )
}
