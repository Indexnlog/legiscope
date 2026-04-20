'use client'

import { useSearchParams } from 'next/navigation'
import MacroTrendCard from '@/components/MacroTrendCard'
import { useDashboard } from '@/lib/dashboard-context'

export default function MacroCardPage() {
  useSearchParams()
  const { signals, loading, error, asOf } = useDashboard()

  if (loading) {
    return (
      <div className="bg-white px-6 py-8">
        <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 h-6 w-52 animate-pulse rounded bg-slate-100" />
        <div className="mt-5 h-[420px] animate-pulse rounded bg-slate-100" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white px-6 py-8 text-sm text-rose-700">
        Legiscope 데이터를 불러오지 못했습니다.
      </div>
    )
  }

  return <MacroTrendCard signals={signals} asOf={asOf} />
}
