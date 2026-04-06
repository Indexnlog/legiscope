'use client'

import { useRouter } from 'next/navigation'
import { useDashboard } from '@/lib/dashboard-context'
import RiskTab from '@/components/RiskTab'

export default function RiskPage() {
  const { signals, asOf, loading } = useDashboard()
  const router = useRouter()

  if (loading) {
    return <LoadingSkeleton />
  }

  return (
    <RiskTab
      signals={signals}
      asOf={asOf}
      onDrilldown={(code) => router.push(`/drilldown?ksic=${code}`)}
    />
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-slate-200 rounded" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-slate-200 bg-white h-[560px]" />
        <div className="rounded-lg border border-slate-200 bg-white h-[560px]" />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white h-96" />
    </div>
  )
}
