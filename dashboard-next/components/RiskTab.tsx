'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import type { IndustrySignal } from '@/lib/types'
import { getKsicName } from '@/lib/ksic-names'

interface RiskTabProps {
  signals: IndustrySignal[]
  asOf?: string
  onDrilldown?: (code: string) => void
}

function getRiskColor(score: number, max: number) {
  const pct = max > 0 ? score / max : 0
  if (pct > 0.5) return '#ef4444'
  if (pct > 0.2) return '#f59e0b'
  return '#3b82f6'
}

function getActivityColor(count: number, max: number) {
  const pct = max > 0 ? count / max : 0
  if (pct > 0.5) return '#3b82f6'
  if (pct > 0.2) return '#60a5fa'
  return '#93c5fd'
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="rounded-lg px-3 py-2 text-xs bg-white border border-slate-200 shadow-lg">
      <p className="font-semibold text-slate-800 mb-1">{d?.name || label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-slate-500">
          {p.name}: <span className="font-medium text-slate-700">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function RiskTab({ signals, asOf, onDrilldown }: RiskTabProps) {
  const industries = signals
    .filter(s => s.ksic_level === 3 && s.total_bills > 0)

  // TOP 20 by risk_score
  const riskTop = [...industries]
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
    .slice(0, 20)
    .map(s => ({
      code: s.ksic_code,
      name: getKsicName(s.ksic_code),
      shortName: getKsicName(s.ksic_code).slice(0, 10),
      risk_score: s.risk_score ?? 0,
      total_bills: s.total_bills,
    }))

  // TOP 20 by recent_90d_bills
  const activityTop = [...industries]
    .sort((a, b) => (b.recent_90d_bills ?? 0) - (a.recent_90d_bills ?? 0))
    .slice(0, 20)
    .map(s => ({
      code: s.ksic_code,
      name: getKsicName(s.ksic_code),
      shortName: getKsicName(s.ksic_code).slice(0, 10),
      recent_90d: s.recent_90d_bills ?? 0,
      total_bills: s.total_bills,
    }))

  const maxRisk = riskTop[0]?.risk_score ?? 1
  const maxActivity = activityTop[0]?.recent_90d ?? 1

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">산업별 입법 리스크</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            KSIC 중분류 {industries.length}개 산업 기준 · risk_score = 규제건수 x 규제가결률 / 100
          </p>
        </div>
        {asOf && (
          <span className="text-[11px] text-slate-400 font-mono">{asOf.slice(0, 10)}</span>
        )}
      </div>

      {/* 2-column charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Score TOP 20 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            규제 리스크 TOP 20
          </h3>
          <ResponsiveContainer width="100%" height={520}>
            <BarChart
              data={riskTop}
              layout="vertical"
              margin={{ left: 4, right: 16, top: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="shortName"
                width={90}
                tick={{ fill: '#475569', fontSize: 11 }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="risk_score"
                name="risk_score"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: any) => onDrilldown?.(d.code)}
              >
                {riskTop.map((d, i) => (
                  <Cell key={i} fill={getRiskColor(d.risk_score, maxRisk)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Activity TOP 20 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            최근 90일 입법 활성도 TOP 20
          </h3>
          <ResponsiveContainer width="100%" height={520}>
            <BarChart
              data={activityTop}
              layout="vertical"
              margin={{ left: 4, right: 16, top: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="shortName"
                width={90}
                tick={{ fill: '#475569', fontSize: 11 }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="recent_90d"
                name="90일 발의"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: any) => onDrilldown?.(d.code)}
              >
                {activityTop.map((d, i) => (
                  <Cell key={i} fill={getActivityColor(d.recent_90d, maxActivity)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 리스크 있는 산업만 테이블 */}
      {(() => {
        const ranked = [...industries]
          .filter(s => (s.risk_score ?? 0) > 0)
          .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
        const maxR = ranked[0] ? ranked[0].risk_score ?? 1 : 1
        return (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">규제 리스크 산업 랭킹</h3>
              <span className="text-[11px] text-slate-400">
                risk_score {'>'} 0인 {ranked.length}개 산업 / 전체 {industries.length}개
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['#', '산업', 'risk_score', '총 발의', '가결', '가결률', '규제 비율', '90일 활성'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-slate-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((s, i) => {
                    const pct = maxR > 0 ? (s.risk_score ?? 0) / maxR : 0
                    return (
                      <tr
                        key={s.ksic_code}
                        className="border-b border-slate-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                        onClick={() => onDrilldown?.(s.ksic_code)}
                      >
                        <td className="px-3 py-2.5 text-slate-400 font-mono">{i + 1}</td>
                        <td className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">
                          {getKsicName(s.ksic_code)}
                          <span className="ml-1 text-slate-400 font-mono text-[10px]">{s.ksic_code}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct * 100}%`,
                                  background: getRiskColor(s.risk_score ?? 0, maxR),
                                }}
                              />
                            </div>
                            <span className="text-slate-600 font-mono">{(s.risk_score ?? 0).toFixed(1)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 font-mono">{s.total_bills.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-slate-600 font-mono">{s.passed_bills.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-slate-600 font-mono">{(s.pass_rate ?? 0).toFixed(1)}%</td>
                        <td className="px-3 py-2.5 text-slate-600 font-mono">{(s.reg_ratio ?? 0).toFixed(1)}%</td>
                        <td className="px-3 py-2.5 text-slate-600 font-mono">{s.recent_90d_bills ?? 0}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
