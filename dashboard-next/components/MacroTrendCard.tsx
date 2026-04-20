'use client'

import type { ReactNode } from 'react'
import type { IndustrySignal } from '@/lib/types'
import { getKsicName } from '@/lib/ksic-names'

interface MacroTrendCardProps {
  signals: IndustrySignal[]
  asOf?: string
}

type Zone = 'focus' | 'structural' | 'rising' | 'watch'

const BLUE = '#3d5afe'
const GRID = '#edf1f7'
const TEXT = '#27364a'

const ZONE_LABEL: Record<Zone, string> = {
  focus: '집중 관리',
  structural: '구조적 규제',
  rising: '급등 관찰',
  watch: '상시 관찰',
}

const ZONE_COLOR: Record<Zone, string> = {
  focus: '#ef4444',
  structural: '#f97316',
  rising: '#2563eb',
  watch: '#94a3b8',
}

function formatCount(value: number | undefined) {
  return (value ?? 0).toLocaleString('ko-KR')
}

function zoneFor(risk: number, recent: number, medianRisk: number, medianRecent: number): Zone {
  if (risk >= medianRisk && recent >= medianRecent) return 'focus'
  if (risk >= medianRisk) return 'structural'
  if (recent >= medianRecent) return 'rising'
  return 'watch'
}

function ToolbarButton({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      className={[
        'flex h-8 min-w-9 items-center justify-center rounded border px-2 text-xs font-medium',
        active ? 'border-slate-300 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-500',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export default function MacroTrendCard({ signals, asOf }: MacroTrendCardProps) {
  const industries = signals
    .filter(signal => signal.ksic_level === 3 && (signal.total_bills ?? 0) > 0)
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))

  if (industries.length === 0) {
    return (
      <section className="bg-white px-6 py-8">
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: TEXT }}>
          입법·규제 리스크
        </h2>
        <p className="mt-3 text-sm text-slate-500">
          최신 산업별 입법 신호를 불러오는 중입니다.
        </p>
      </section>
    )
  }

  const riskValues = industries.map(signal => signal.risk_score ?? 0).sort((a, b) => a - b)
  const recentValues = industries.map(signal => signal.recent_90d_bills ?? 0).sort((a, b) => a - b)
  const medianRisk = riskValues[Math.floor(riskValues.length / 2)] ?? 0
  const medianRecent = recentValues[Math.floor(recentValues.length / 2)] ?? 0
  const maxRisk = Math.max(1, ...industries.map(signal => signal.risk_score ?? 0))
  const maxRecent = Math.max(1, ...industries.map(signal => signal.recent_90d_bills ?? 0))
  const totalBills = industries.reduce((sum, signal) => sum + (signal.total_bills ?? 0), 0)
  const recentBills = industries.reduce((sum, signal) => sum + (signal.recent_90d_bills ?? 0), 0)
  const activeIndustries = industries.filter(signal => (signal.recent_90d_bills ?? 0) > 0).length
  const regulatoryShare = industries.length
    ? industries.reduce((sum, signal) => sum + (signal.reg_ratio ?? 0), 0) / industries.length
    : 0

  const scatter = industries
    .filter(signal => (signal.risk_score ?? 0) > 0 || (signal.recent_90d_bills ?? 0) > 0)
    .slice(0, 70)
    .map(signal => {
      const risk = signal.risk_score ?? 0
      const recent = signal.recent_90d_bills ?? 0
      const zone = zoneFor(risk, recent, medianRisk, medianRecent)

      return {
        code: signal.ksic_code,
        name: getKsicName(signal.ksic_code),
        risk,
        recent,
        zone,
        x: 72 + (recent / maxRecent) * 860,
        y: 350 - (risk / maxRisk) * 284,
      }
    })

  const topPressure = industries.slice(0, 7).map((signal, index) => {
    const risk = signal.risk_score ?? 0
    const recent = signal.recent_90d_bills ?? 0
    const zone = zoneFor(risk, recent, medianRisk, medianRecent)

    return {
      rank: index + 1,
      code: signal.ksic_code,
      name: getKsicName(signal.ksic_code),
      risk,
      recent,
      regRatio: signal.reg_ratio ?? 0,
      zone,
      width: Math.max(3, (risk / maxRisk) * 100),
    }
  })

  const zoneCounts = scatter.reduce<Record<Zone, number>>(
    (acc, item) => {
      acc[item.zone] += 1
      return acc
    },
    { focus: 0, structural: 0, rising: 0, watch: 0 },
  )

  return (
    <section className="bg-white px-6 py-8 text-slate-800">
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: TEXT }}>
            입법·규제 리스크
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            산업별 규제 강도와 최근 발의 흐름을 함께 보는 정책 리스크 지수입니다.
          </p>
        </div>
        <p className="mt-1 shrink-0 text-xs text-slate-400">
          {asOf ? `* ${asOf.slice(0, 10)} 기준` : '* 최신 기준'}
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-8 overflow-hidden rounded-full border border-slate-200 bg-white text-sm">
          <button type="button" className="w-16 text-slate-300">
            All
          </button>
          <button type="button" className="w-16 rounded-full text-white" style={{ background: BLUE }}>
            10Y
          </button>
        </div>

        <div className="flex items-center gap-2">
          <ToolbarButton>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 13.5H15" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M4 11L7 8L10 9.5L14 5.5" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="4" y="12" width="2" height="2" fill="#64748b" />
              <rect x="8" y="10.5" width="2" height="3.5" fill="#64748b" />
              <rect x="12" y="8" width="2" height="6" fill="#64748b" />
            </svg>
          </ToolbarButton>
          <ToolbarButton active>기본</ToolbarButton>
          <ToolbarButton>
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
              <path d="M3 4H14L9.5 8.8V13L7.3 14V8.8L3 4Z" stroke="#64748b" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </ToolbarButton>
          <ToolbarButton>
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
              <rect x="3" y="4" width="11" height="9" rx="1" stroke="#64748b" strokeWidth="1.1" />
              <path d="M3 7H14M3 10H14M6.6 4V13M10.3 4V13" stroke="#64748b" strokeWidth="1" />
            </svg>
          </ToolbarButton>
        </div>
      </div>

      <div className="mb-2 text-xs text-slate-400">단위: 건, risk_score</div>

      <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
        <div>
          <h3 className="mb-3 text-center text-lg font-medium" style={{ color: TEXT }}>
            입법 압력 매트릭스
          </h3>
          <svg viewBox="0 0 1000 410" className="h-[420px] w-full">
            {[0, 1, 2, 3, 4].map(index => {
              const y = 350 - index * 70

              return (
                <g key={index}>
                  <line x1="72" y1={y} x2="950" y2={y} stroke={GRID} strokeDasharray="2 2" />
                  <text x="52" y={y + 4} textAnchor="end" fontSize="12" fill="#334155">
                    {((maxRisk / 4) * index).toFixed(0)}
                  </text>
                </g>
              )
            })}
            {[0, 1, 2, 3, 4].map(index => {
              const x = 72 + index * 215

              return (
                <g key={index}>
                  <line x1={x} y1="66" x2={x} y2="350" stroke={GRID} strokeDasharray="2 2" />
                  <text x={x} y="374" textAnchor="middle" fontSize="12" fill="#64748b">
                    {Math.round((maxRecent / 4) * index)}
                  </text>
                </g>
              )
            })}
            <line x1="72" y1="350" x2="950" y2="350" stroke="#9aa4b2" strokeWidth="1.2" />
            <line x1="72" y1="66" x2="72" y2="350" stroke="#9aa4b2" strokeWidth="1.2" />
            <line
              x1={72 + (medianRecent / maxRecent) * 860}
              y1="66"
              x2={72 + (medianRecent / maxRecent) * 860}
              y2="350"
              stroke="#cbd5e1"
              strokeDasharray="5 5"
            />
            <line
              x1="72"
              y1={350 - (medianRisk / maxRisk) * 284}
              x2="950"
              y2={350 - (medianRisk / maxRisk) * 284}
              stroke="#cbd5e1"
              strokeDasharray="5 5"
            />
            <text x="72" y="42" fontSize="12" fill="#64748b">
              규제 강도
            </text>
            <text x="843" y="394" fontSize="12" fill="#64748b">
              최근 90일 발의
            </text>
            {scatter.map(item => (
              <circle
                key={item.code}
                cx={item.x}
                cy={item.y}
                r={item.zone === 'focus' ? 5 : 4}
                fill={ZONE_COLOR[item.zone]}
                opacity="0.82"
              >
                <title>{`${item.name} · ${ZONE_LABEL[item.zone]} · risk ${item.risk.toFixed(1)} · 최근 ${item.recent}건`}</title>
              </circle>
            ))}
            {scatter.slice(0, 7).map(item => (
              <text
                key={`${item.code}-label`}
                x={Math.min(880, item.x + 8)}
                y={Math.max(78, item.y - 7)}
                fontSize="11"
                fill="#27364a"
              >
                {item.name.slice(0, 9)}
              </text>
            ))}
          </svg>

          <div className="mt-1 flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs text-slate-700">
            {(['focus', 'structural', 'rising', 'watch'] as Zone[]).map(zone => (
              <span key={zone} className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ZONE_COLOR[zone] }} />
                {ZONE_LABEL[zone]} {zoneCounts[zone]}
              </span>
            ))}
          </div>
        </div>

        <aside className="pt-10">
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-slate-100 pb-5">
            {[
              { label: '전체 법안', value: formatCount(totalBills) },
              { label: '최근 90일', value: formatCount(recentBills) },
              { label: '관찰 산업', value: formatCount(activeIndustries) },
              { label: '평균 규제비중', value: `${regulatoryShare.toFixed(1)}%` },
            ].map(item => (
              <div key={item.label}>
                <p className="text-xs text-blue-600">{item.label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: TEXT }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <h4 className="text-base font-bold" style={{ color: TEXT }}>
              정책 리스크 상위 산업
            </h4>
            <div className="mt-4 space-y-3">
              {topPressure.map(item => (
                <div key={item.code}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-slate-700">
                      {item.rank}. {item.name}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-700">{item.risk.toFixed(1)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${item.width}%`, background: ZONE_COLOR[item.zone] }} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {ZONE_LABEL[item.zone]} · 최근 {formatCount(item.recent)}건 · 규제비중 {item.regRatio.toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="mt-6 flex justify-end text-xs text-slate-400">
        * source: Pitchdeck, Legiscope, 국회 의안정보
      </div>
    </section>
  )
}
