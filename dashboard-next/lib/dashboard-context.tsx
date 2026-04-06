'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { IndustrySignal } from '@/lib/types'

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

interface DashboardState {
  signals: IndustrySignal[]
  stats: OverallStats
  loading: boolean
  error: string | null
  asOf: string
}

const DEFAULT_STATS: OverallStats = {
  bills: 0, committee_reviewed: 0, passed: 0, promulgated: 0,
  pending: 0, regulation: 0, support: 0, neutral: 0,
}

const DashboardContext = createContext<DashboardState>({
  signals: [], stats: DEFAULT_STATS, loading: true, error: null, asOf: '',
})

export function useDashboard() {
  return useContext(DashboardContext)
}

function deriveStatsFromSignals(sigs: IndustrySignal[]): OverallStats {
  const level3 = sigs.filter(s => s.ksic_level === 3)
  const totalBills = level3.reduce((sum, s) => sum + (s.total_bills ?? 0), 0)
  const passed = level3.reduce((sum, s) => sum + (s.passed_bills ?? 0), 0)
  const pending = level3.reduce((sum, s) => sum + (s.pending_bills ?? 0), 0)
  const regulation = level3.reduce((sum, s) => sum + (s.reg_count ?? 0), 0)
  const support = level3.reduce((sum, s) => sum + (s.support_count ?? 0), 0)
  const neutral = level3.reduce((sum, s) => sum + (s.neutral_count ?? 0), 0)
  return {
    bills: totalBills, passed, pending, regulation, support, neutral,
    committee_reviewed: level3.reduce((sum, s) => sum + (s.processed_bills ?? 0), 0),
    promulgated: 0,
  }
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [signals, setSignals] = useState<IndustrySignal[]>([])
  const [stats, setStats] = useState<OverallStats>(DEFAULT_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [asOf, setAsOf] = useState('')

  useEffect(() => {
    Promise.all([loadSignals(), loadStats()])
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

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
    const result = Array.from(deduped.values())
    setSignals(result)
    if (latestDate) setAsOf(latestDate)
    return result
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
    if (bills > 0) {
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
    return bills
  }

  // bills count 실패 시 signals 기반 fallback
  useEffect(() => {
    if (!loading && signals.length > 0 && stats.bills === 0) {
      const derived = deriveStatsFromSignals(signals)
      setStats(prev => ({ ...derived, promulgated: prev.promulgated }))
    }
  }, [loading, signals, stats.bills])

  return (
    <DashboardContext.Provider value={{ signals, stats, loading, error, asOf }}>
      {children}
    </DashboardContext.Provider>
  )
}
