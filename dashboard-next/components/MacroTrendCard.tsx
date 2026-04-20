'use client'

import Link from 'next/link'
import type { IndustrySignal } from '@/lib/types'
import { getKsicName } from '@/lib/ksic-names'

interface MacroTrendCardProps {
  signals: IndustrySignal[]
  asOf?: string
}

function formatCount(value: number | undefined) {
  return (value ?? 0).toLocaleString('ko-KR')
}

function getPressureLabel(risk: number, recent: number, medianRisk: number, medianRecent: number) {
  if (risk >= medianRisk && recent >= medianRecent) return '즉각 대응'
  if (risk >= medianRisk) return '구조적 규제'
  if (recent >= medianRecent) return '급등 관찰'
  return '상시 관찰'
}

function getPointColor(label: string) {
  if (label === '즉각 대응') return '#e11d48'
  if (label === '구조적 규제') return '#d97706'
  if (label === '급등 관찰') return '#2563eb'
  return '#94a3b8'
}

export default function MacroTrendCard({ signals, asOf }: MacroTrendCardProps) {
  const industries = signals
    .filter(s => s.ksic_level === 3 && (s.total_bills ?? 0) > 0)
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))

  const active = industries.filter(s => (s.recent_90d_bills ?? 0) > 0)
  const riskValues = industries.map(s => s.risk_score ?? 0).sort((a, b) => a - b)
  const recentValues = industries.map(s => s.recent_90d_bills ?? 0).sort((a, b) => a - b)
  const medianRisk = riskValues[Math.floor(riskValues.length / 2)] ?? 0
  const medianRecent = recentValues[Math.floor(recentValues.length / 2)] ?? 0
  const maxRisk = Math.max(1, ...industries.map(s => s.risk_score ?? 0))
  const maxRecent = Math.max(1, ...industries.map(s => s.recent_90d_bills ?? 0))

  const topPressure = industries
    .slice(0, 6)
    .map(s => ({
      ...s,
      name: getKsicName(s.ksic_code),
      pct: Math.min(100, ((s.risk_score ?? 0) / maxRisk) * 100),
    }))

  const scatter = industries
    .filter(s => (s.risk_score ?? 0) > 0 || (s.recent_90d_bills ?? 0) > 0)
    .slice(0, 48)
    .map(s => {
      const recent = s.recent_90d_bills ?? 0
      const risk = s.risk_score ?? 0
      const zone = getPressureLabel(risk, recent, medianRisk, medianRecent)
      return {
        code: s.ksic_code,
        name: getKsicName(s.ksic_code),
        risk,
        recent,
        zone,
        x: 32 + (recent / maxRecent) * 276,
        y: 192 - (risk / maxRisk) * 154,
      }
    })

  const nowZone = scatter.filter(d => d.zone === '즉각 대응').length
  const risingZone = scatter.filter(d => d.zone === '급등 관찰').length
  const totalBills = industries.reduce((sum, s) => sum + (s.total_bills ?? 0), 0)
  const recentBills = industries.reduce((sum, s) => sum + (s.recent_90d_bills ?? 0), 0)
  const avgRegRatio = industries.length
    ? industries.reduce((sum, s) => sum + (s.reg_ratio ?? 0), 0) / industries.length
    : 0

  if (industries.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Legiscope Macro</p>
        <h2 className="mt-2 text-xl font-bold text-slate-950">입법 동향 데이터가 없습니다</h2>
        <p className="mt-2 text-sm text-slate-500">최신 산업별 시그널 적재 후 MACRO 그래프가 표시됩니다.</p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Legiscope Macro</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">산업별 입법 압력 지도</h2>
            <p className="mt-1 text-sm text-slate-500">
              전체 산업의 규제 강도와 최근 입법 활성도를 함께 봅니다.
            </p>
          </div>
          <div className="w-fit rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
            {asOf ? `기준일 ${asOf.slice(0, 10)}` : '최신 데이터'}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { label: '전체 법안', value: formatCount(totalBills) },
            { label: '최근 90일', value: formatCount(recentBills) },
            { label: '관찰 산업', value: formatCount(active.length) },
            { label: '평균 규제비중', value: `${avgRegRatio.toFixed(1)}%` },
          ].map(item => (
            <div key={item.label} className="rounded-md bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold text-slate-400">{item.label}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">리스크 × 입법 활성도</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                오른쪽 위로 갈수록 MACRO 탭에서 먼저 볼 산업입니다.
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              <p>즉각 대응 {nowZone}</p>
              <p>급등 관찰 {risingZone}</p>
            </div>
          </div>

          <svg viewBox="0 0 340 220" className="h-[220px] w-full rounded-md bg-slate-50">
            <line x1="32" y1="192" x2="320" y2="192" stroke="#cbd5e1" />
            <line x1="32" y1="30" x2="32" y2="192" stroke="#cbd5e1" />
            <line
              x1={32 + (medianRecent / maxRecent) * 276}
              y1="30"
              x2={32 + (medianRecent / maxRecent) * 276}
              y2="192"
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
            <line
              x1="32"
              y1={192 - (medianRisk / maxRisk) * 154}
              x2="320"
              y2={192 - (medianRisk / maxRisk) * 154}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
            <text x="36" y="24" fontSize="10" fill="#64748b">risk_score</text>
            <text x="230" y="212" fontSize="10" fill="#64748b">최근 90일 발의</text>
            {scatter.map(d => (
              <g key={d.code}>
                <circle cx={d.x} cy={d.y} r={d.zone === '즉각 대응' ? 4.5 : 3.5} fill={getPointColor(d.zone)} opacity="0.82">
                  <title>{`${d.name} · ${d.zone} · risk ${d.risk.toFixed(1)} · 최근 ${d.recent}건`}</title>
                </circle>
              </g>
            ))}
            {scatter.slice(0, 5).map(d => (
              <text key={`${d.code}-label`} x={Math.min(292, d.x + 6)} y={Math.max(38, d.y - 5)} fontSize="9" fill="#334155">
                {d.name.slice(0, 8)}
              </text>
            ))}
          </svg>
        </div>

        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">입법 압력 TOP 6</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">누적 규제 강도 기준</p>
            </div>
            <Link
              href="/risk"
              target="_blank"
              className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
            >
              전체 보기
            </Link>
          </div>

          <div className="space-y-3">
            {topPressure.map((s, index) => {
              const zone = getPressureLabel(s.risk_score ?? 0, s.recent_90d_bills ?? 0, medianRisk, medianRecent)
              const color = getPointColor(zone)
              return (
                <div key={s.ksic_code}>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {index + 1}. {s.name}
                    </p>
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">
                      {(s.risk_score ?? 0).toFixed(1)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: color }} />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {zone} · 최근 {formatCount(s.recent_90d_bills)}건 · 규제비중 {(s.reg_ratio ?? 0).toFixed(1)}%
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
