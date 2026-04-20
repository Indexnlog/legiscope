'use client'

import { useSearchParams } from 'next/navigation'
import MacroCompanyCard from '@/components/MacroCompanyCard'
import { useDashboard } from '@/lib/dashboard-context'

export default function MacroCardPage() {
  const searchParams = useSearchParams()
  const { signals, loading, error, asOf } = useDashboard()
  const name = searchParams.get('name')
  const ksic = searchParams.get('ksic')

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 h-6 w-52 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-16 animate-pulse rounded bg-slate-100" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-100 bg-rose-50 p-5 text-sm text-rose-700">
        Legiscope 데이터를 불러오지 못했습니다.
      </div>
    )
  }

  return (
    <MacroCompanyCard
      signals={signals}
      companyName={name}
      ksic={ksic}
      asOf={asOf}
    />
  )
}
