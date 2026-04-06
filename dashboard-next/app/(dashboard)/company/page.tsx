'use client'

import { useSearchParams } from 'next/navigation'
import { useDashboard } from '@/lib/dashboard-context'
import CompanyTab from '@/components/CompanyTab'

export default function CompanyPage() {
  const { signals, loading } = useDashboard()
  const searchParams = useSearchParams()
  const embed = searchParams.get('embed') === 'true'
  const name = searchParams.get('name')
  const ksic = searchParams.get('ksic')

  if (loading) {
    return <LoadingSkeleton />
  }

  return (
    <CompanyTab
      signals={signals}
      initialName={name}
      initialKsic={ksic}
      hidesamples={embed}
    />
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="rounded-lg border border-slate-200 bg-white p-5 h-32" />
    </div>
  )
}
