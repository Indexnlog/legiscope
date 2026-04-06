'use client'

import { useDashboard } from '@/lib/dashboard-context'
import ProcessTab from '@/components/ProcessTab'

export default function ProcessPage() {
  const { stats, loading } = useDashboard()

  if (loading) {
    return <LoadingSkeleton />
  }

  return <ProcessTab stats={stats} />
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 h-20" />
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5 h-48" />
    </div>
  )
}
