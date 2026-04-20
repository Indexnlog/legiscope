'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Bill, IndustrySignal } from '@/lib/types'
import { getKsicName } from '@/lib/ksic-names'
import { supabase } from '@/lib/supabase'

interface MacroCompanyCardProps {
  signals: IndustrySignal[]
  companyName?: string | null
  ksic?: string | null
  asOf?: string
}

function getRiskLevel(score: number) {
  if (score >= 5) return { label: 'High', color: '#e11d48', bg: '#fff1f2', border: '#fecdd3' }
  if (score >= 2) return { label: 'Mid', color: '#d97706', bg: '#fffbeb', border: '#fde68a' }
  return { label: 'Low', color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4' }
}

function formatCount(value: number | undefined) {
  return (value ?? 0).toLocaleString('ko-KR')
}

function getMessage(company: string, industry: string, signal: IndustrySignal) {
  const riskScore = signal.risk_score ?? 0
  const recent = signal.recent_90d_bills ?? 0
  const regRatio = signal.reg_ratio ?? 0

  if (riskScore >= 5 && recent >= 20) {
    return `${company}가 속한 ${industry}은 규제 강도와 최근 입법 활성도가 모두 높습니다. MACRO 탭에서는 정책 리스크를 우선 점검하는 구간입니다.`
  }
  if (riskScore >= 5) {
    return `${industry}은 누적 규제 압력이 높은 산업입니다. 새 법안보다 계류 법안의 진행 여부가 더 중요합니다.`
  }
  if (recent >= 20) {
    return `${industry}은 최근 90일 입법 움직임이 빠르게 늘었습니다. 아직 고위험은 아니지만 변곡점 관찰이 필요합니다.`
  }
  if (regRatio >= 30) {
    return `${industry}은 발의 규모는 크지 않아도 규제성 법안 비중이 높습니다. 개별 법안의 내용을 확인해야 합니다.`
  }
  return `${industry}은 현재 입법 리스크가 낮은 편입니다. 정기 모니터링 수준으로 충분합니다.`
}

export default function MacroCompanyCard({ signals, companyName, ksic, asOf }: MacroCompanyCardProps) {
  const [bills, setBills] = useState<Bill[]>([])
  const [loadingBills, setLoadingBills] = useState(false)
  const company = companyName?.trim() || '선택 기업'
  const code3 = ksic?.trim().slice(0, 3) || ''

  const signal = useMemo(
    () => signals.find(s => s.ksic_code === code3 && s.ksic_level === 3) ?? null,
    [code3, signals],
  )

  useEffect(() => {
    if (!code3 || !signal) {
      setBills([])
      return
    }

    let ignore = false
    async function loadRecentBills() {
      setLoadingBills(true)
      try {
        const { data } = await supabase.rpc('bills_by_ksic3', { p_code: code3, p_offset: 0, p_limit: 3 })
        if (!ignore) setBills((data ?? []) as Bill[])
      } catch {
        if (!ignore) setBills([])
      } finally {
        if (!ignore) setLoadingBills(false)
      }
    }

    loadRecentBills()

    return () => {
      ignore = true
    }
  }, [code3, signal])

  if (!code3) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Legiscope for Macro</p>
        <h2 className="mt-2 text-lg font-bold text-slate-900">KSIC 코드가 필요합니다</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          기업정보의 산업분류 코드를 넘기면 MACRO 탭 안에서 해당 산업의 입법 압력을 바로 요약합니다.
        </p>
      </div>
    )
  }

  if (!signal) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Legiscope for Macro</p>
        <h2 className="mt-2 text-lg font-bold text-slate-900">{company}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          KSIC {code3}에 매칭되는 입법 시그널이 아직 없습니다. 5자리 KSIC를 넘겨도 앞 3자리 중분류 기준으로 조회합니다.
        </p>
      </div>
    )
  }

  const industry = getKsicName(signal.ksic_code)
  const risk = getRiskLevel(signal.risk_score ?? 0)
  const fullHref = `/company?name=${encodeURIComponent(company)}&ksic=${encodeURIComponent(ksic ?? code3)}&embed=true`
  const pressure = Math.min(100, ((signal.risk_score ?? 0) / 10) * 100)

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Legiscope for Macro</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">{company}</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            [{signal.ksic_code}] {industry}
          </p>
        </div>
        <div
          className="w-fit rounded-md border px-3 py-1.5 text-sm font-bold"
          style={{ background: risk.bg, color: risk.color, borderColor: risk.border }}
        >
          {risk.label} Risk
        </div>
      </div>

      <div className="p-5">
        <p className="text-sm leading-relaxed text-slate-800">
          {getMessage(company, industry, signal)}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: '입법 노출', value: formatCount(signal.total_bills) },
            { label: '최근 90일', value: formatCount(signal.recent_90d_bills) },
            { label: '규제 비중', value: `${(signal.reg_ratio ?? 0).toFixed(1)}%` },
          ].map(item => (
            <div key={item.label} className="rounded-md bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold text-slate-400">{item.label}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>risk_score</span>
            <span className="text-slate-700">{(signal.risk_score ?? 0).toFixed(1)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${pressure}%`, background: risk.color }} />
          </div>
        </div>

        <div className="mt-4 rounded-md border border-slate-100 bg-slate-50/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">최근 관련 법안</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-800" title={bills[0]?.bill_name}>
            {loadingBills ? '불러오는 중...' : bills[0]?.bill_name ?? '최근 법안 없음'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {bills[0]?.committee ?? '소관위 미확정'} · {bills[0]?.propose_dt?.slice(0, 10) ?? asOf?.slice(0, 10) ?? '기준일 없음'}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">
            {asOf ? `기준일 ${asOf.slice(0, 10)}` : 'Legiscope'}
          </p>
          <Link
            href={fullHref}
            target="_blank"
            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
          >
            상세 보기
          </Link>
        </div>
      </div>
    </section>
  )
}
