'use client'

import { useSearchParams } from 'next/navigation'
import { useDashboard } from '@/lib/dashboard-context'
import DrilldownTab from '@/components/DrilldownTab'

export default function DrilldownPage() {
  const { signals, loading } = useDashboard()
  const searchParams = useSearchParams()
  const ksic = searchParams.get('ksic')

  if (loading) {
    return <LoadingSkeleton />
  }

  return <DrilldownTab signals={signals} initialKsic={ksic} />
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="bg-white rounded-lg border border-slate-200 p-4 h-20" />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-lg border border-slate-200 h-72" />
        <div className="bg-white rounded-lg border border-slate-200 h-72" />
      </div>
    </div>
  )
}
