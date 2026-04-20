'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis, ReferenceLine, Label,
} from 'recharts'
import type { IndustrySignal } from '@/lib/types'
import { getKsicName, getSector } from '@/lib/ksic-names'

interface RiskTabProps {
  signals: IndustrySignal[]
  asOf?: string
  onDrilldown?: (code: string) => void
}

function getRiskColor(score: number, max: number) {
  const pct = max > 0 ? score / max : 0
  if (pct > 0.7) return '#dc2626'
  if (pct > 0.4) return '#ef4444'
  if (pct > 0.2) return '#f59e0b'
  return '#cbd5e1'
}

function getActivityColor(count: number, max: number) {
  const pct = max > 0 ? count / max : 0
  if (pct > 0.7) return '#1d4ed8'
  if (pct > 0.4) return '#3b82f6'
  if (pct > 0.2) return '#60a5fa'
  return '#cbd5e1'
}

function getRiskLevel(score: number) {
  if (score >= 8) return { label: 'High', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' }
  if (score >= 3) return { label: 'Mid', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' }
  if (score > 0) return { label: 'Low', bg: 'bg-blue-50', text: 'text-blue-500', border: 'border-blue-200' }
  return { label: '-', bg: 'bg-slate-50', text: 'text-slate-400', border: 'border-slate-200' }
}

function getScatterColor(risk: number, activity: number, medRisk: number, medActivity: number) {
  if (risk >= medRisk && activity >= medActivity) return '#dc2626' // 고위험+고활성 = 빨강
  if (risk >= medRisk) return '#f59e0b' // 고위험+저활성 = 주황
  if (activity >= medActivity) return '#3b82f6' // 저위험+고활성 = 파랑
  return '#cbd5e1' // 저위험+저활성 = 회색
}

function getPressureZone(risk: number, activity: number, medRisk: number, medActivity: number) {
  if (risk >= medRisk && activity >= medActivity) return { label: '즉각 대응', tone: 'text-red-600 bg-red-50 border-red-100' }
  if (risk >= medRisk) return { label: '구조적 규제', tone: 'text-amber-600 bg-amber-50 border-amber-100' }
  if (activity >= medActivity) return { label: '급등 관찰', tone: 'text-blue-600 bg-blue-50 border-blue-100' }
  return { label: '상시 관찰', tone: 'text-slate-500 bg-slate-50 border-slate-200' }
}

const ChartTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="rounded-lg px-3 py-2 text-xs bg-white border border-slate-200 shadow-lg max-w-[240px]">
      <p className="font-semibold text-slate-800 mb-1">{d?.name || d?.shortName}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-slate-500">
          {p.name}: <span className="font-medium text-slate-700">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </p>
      ))}
      {d?.reg_ratio !== undefined && (
        <p className="text-slate-500">규제 비율: <span className="font-medium text-slate-700">{d.reg_ratio.toFixed(1)}%</span></p>
      )}
    </div>
  )
}

const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const level = getRiskLevel(d.risk_score)
  const zone = d.zone
  return (
    <div className="rounded-lg px-3 py-2.5 text-xs bg-white border border-slate-200 shadow-lg">
      <p className="font-semibold text-slate-800 mb-1.5">{d.name}</p>
      <div className="space-y-0.5">
        {zone && <p className="text-slate-500">판정: <span className="font-bold text-slate-700">{zone}</span></p>}
        <p className="text-slate-500">risk_score: <span className="font-bold text-slate-700">{d.risk_score.toFixed(1)}</span></p>
        <p className="text-slate-500">90일 활성: <span className="font-bold text-slate-700">{d.recent_90d}건</span></p>
        <p className="text-slate-500">총 발의: <span className="font-medium text-slate-600">{d.total_bills.toLocaleString()}건</span></p>
        <p className="text-slate-500">규제 비율: <span className="font-medium text-slate-600">{d.reg_ratio.toFixed(1)}%</span></p>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-slate-100">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${level.bg} ${level.text}`}>{level.label} Risk</span>
      </div>
    </div>
  )
}

// 바 차트용 커스텀 레이블
const BarLabel = ({ x, y, width, height, value }: any) => {
  if (typeof value !== 'number' || value === 0) return null
  return (
    <text x={x + width + 4} y={y + height / 2} fill="#64748b" fontSize={10} dominantBaseline="central">
      {value.toFixed(1)}
    </text>
  )
}

const BarLabelInt = ({ x, y, width, height, value }: any) => {
  if (typeof value !== 'number' || value === 0) return null
  return (
    <text x={x + width + 4} y={y + height / 2} fill="#64748b" fontSize={10} dominantBaseline="central">
      {value}
    </text>
  )
}

export default function RiskTab({ signals, asOf, onDrilldown }: RiskTabProps) {
  const industries = signals
    .filter(s => s.ksic_level === 3 && s.total_bills > 0)

  // KPI 계산
  const highRiskCount = industries.filter(s => (s.risk_score ?? 0) >= 8).length
  const activeCount = industries.filter(s => (s.recent_90d_bills ?? 0) >= 10).length
  const avgRegRatio = industries.length > 0
    ? industries.reduce((sum, s) => sum + (s.reg_ratio ?? 0), 0) / industries.length
    : 0
  const totalRegBills = industries.reduce((sum, s) => sum + (s.reg_count ?? 0), 0)
  const totalRecentBills = industries.reduce((sum, s) => sum + (s.recent_90d_bills ?? 0), 0)

  // TOP 20 by risk_score
  const riskTop = [...industries]
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
    .slice(0, 20)
    .map(s => ({
      code: s.ksic_code,
      name: getKsicName(s.ksic_code),
      shortName: getKsicName(s.ksic_code).slice(0, 12),
      risk_score: s.risk_score ?? 0,
      total_bills: s.total_bills,
      reg_ratio: s.reg_ratio ?? 0,
    }))

  // TOP 20 by recent_90d_bills
  const activityTop = [...industries]
    .sort((a, b) => (b.recent_90d_bills ?? 0) - (a.recent_90d_bills ?? 0))
    .slice(0, 20)
    .map(s => ({
      code: s.ksic_code,
      name: getKsicName(s.ksic_code),
      shortName: getKsicName(s.ksic_code).slice(0, 12),
      recent_90d: s.recent_90d_bills ?? 0,
      total_bills: s.total_bills,
      reg_ratio: s.reg_ratio ?? 0,
    }))

  // 산점도 데이터
  const scatterData = industries
    .filter(s => (s.risk_score ?? 0) > 0 || (s.recent_90d_bills ?? 0) > 0)
    .map(s => ({
      code: s.ksic_code,
      name: getKsicName(s.ksic_code),
      sector: getSector(s.ksic_code),
      risk_score: s.risk_score ?? 0,
      recent_90d: s.recent_90d_bills ?? 0,
      total_bills: s.total_bills,
      reg_ratio: s.reg_ratio ?? 0,
    }))

  const medRisk = scatterData.length > 0
    ? [...scatterData].sort((a, b) => a.risk_score - b.risk_score)[Math.floor(scatterData.length / 2)].risk_score
    : 0
  const medActivity = scatterData.length > 0
    ? [...scatterData].sort((a, b) => a.recent_90d - b.recent_90d)[Math.floor(scatterData.length / 2)].recent_90d
    : 0

  const maxRisk = riskTop[0]?.risk_score ?? 1
  const maxActivity = activityTop[0]?.recent_90d ?? 1
  const enrichedScatterData = scatterData.map(d => ({
    ...d,
    zone: getPressureZone(d.risk_score, d.recent_90d, medRisk, medActivity).label,
  }))

  const watchList = [...industries]
    .map(s => {
      const risk = s.risk_score ?? 0
      const activity = s.recent_90d_bills ?? 0
      const regRatio = s.reg_ratio ?? 0
      const pressure = risk * 2 + activity * 0.25 + regRatio * 0.12
      return {
        code: s.ksic_code,
        name: getKsicName(s.ksic_code),
        sector: getSector(s.ksic_code),
        risk,
        activity,
        regRatio,
        pressure,
        zone: getPressureZone(risk, activity, medRisk, medActivity),
      }
    })
    .filter(s => s.risk > 0 || s.activity > 0)
    .sort((a, b) => b.pressure - a.pressure)
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase text-blue-600">Legislative Pressure Map</p>
          <h2 className="text-2xl font-bold text-slate-900 mt-1">입법 압력 지도</h2>
          <p className="text-sm text-slate-500 mt-1">
            규제 강도와 최근 입법 활동을 함께 놓고, 지금 대응해야 할 산업을 먼저 봅니다.
          </p>
        </div>
        {asOf && (
          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-mono text-[11px] font-medium">
            {asOf.slice(0, 10)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-red-100 bg-red-50/50 p-4">
          <p className="text-[10px] text-red-400 font-medium uppercase tracking-wider">고위험 산업</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{highRiskCount}</p>
          <p className="text-[10px] text-red-400 mt-0.5">risk_score ≥ 8</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
          <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wider">활성 산업</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{activeCount}</p>
          <p className="text-[10px] text-blue-400 mt-0.5">90일 발의 ≥ 10건</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-4">
          <p className="text-[10px] text-amber-500 font-medium uppercase tracking-wider">최근 90일</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{totalRecentBills.toLocaleString()}</p>
          <p className="text-[10px] text-amber-500 mt-0.5">산업 매핑 발의</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">규제 법안</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{totalRegBills.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">평균 규제 비율 {avgRegRatio.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">리스크 × 입법 활성도</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                우상단은 규제 강도와 최근 발의가 동시에 높은 산업입니다. 버블 크기는 누적 발의 건수입니다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              {[
                ['bg-red-600', '즉각 대응'],
                ['bg-amber-500', '구조적 규제'],
                ['bg-blue-500', '급등 관찰'],
                ['bg-slate-300', '상시 관찰'],
              ].map(([color, label]) => (
                <span key={label} className="flex items-center gap-1 text-slate-500 whitespace-nowrap">
                  <span className={`w-2 h-2 rounded-full ${color}`} />{label}
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={430}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 28, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                type="number" dataKey="risk_score" name="risk_score"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
              >
                <Label value="규제 강도 risk_score →" position="bottom" offset={8} style={{ fill: '#64748b', fontSize: 11 }} />
              </XAxis>
              <YAxis
                type="number" dataKey="recent_90d" name="90일 발의"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
              >
                <Label value="최근 90일 입법 활성도 →" angle={-90} position="insideLeft" offset={10} style={{ fill: '#64748b', fontSize: 11 }} />
              </YAxis>
              <ZAxis type="number" dataKey="total_bills" range={[36, 420]} />
              <ReferenceLine x={medRisk} stroke="#cbd5e1" strokeDasharray="4 4" />
              <ReferenceLine y={medActivity} stroke="#cbd5e1" strokeDasharray="4 4" />
              <Tooltip content={<ScatterTooltip />} />
              <Scatter data={enrichedScatterData} cursor="pointer" onClick={(d: any) => onDrilldown?.(d.code)}>
                {enrichedScatterData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={getScatterColor(d.risk_score, d.recent_90d, medRisk, medActivity)}
                    fillOpacity={0.72}
                    stroke={getScatterColor(d.risk_score, d.recent_90d, medRisk, medActivity)}
                    strokeOpacity={0.95}
                    strokeWidth={1}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-3">
            {[
              ['즉각 대응', '규제 강도와 발의 속도가 같이 높습니다.'],
              ['급등 관찰', '최근 발의가 빠르게 쌓이고 있습니다.'],
              ['구조적 규제', '규제 압력이 이미 높은 산업입니다.'],
              ['상시 관찰', '현재는 낮은 강도로 추적합니다.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-700">{title}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-900">지금 주목할 산업</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">압력 점수 기준 TOP 5</p>
          </div>
          <div className="divide-y divide-slate-100">
            {watchList.map((item, i) => (
              <button
                key={item.code}
                onClick={() => onDrilldown?.(item.code)}
                className="w-full text-left px-4 py-3 hover:bg-blue-50/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] text-slate-400 font-mono">#{i + 1} · {item.code} · {item.sector}</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5 leading-snug">{item.name}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${item.zone.tone}`}>
                    {item.zone.label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="rounded bg-slate-50 py-1.5">
                    <p className="text-[9px] text-slate-400">risk</p>
                    <p className="text-xs font-bold text-slate-700">{item.risk.toFixed(1)}</p>
                  </div>
                  <div className="rounded bg-slate-50 py-1.5">
                    <p className="text-[9px] text-slate-400">90일</p>
                    <p className="text-xs font-bold text-slate-700">{item.activity}</p>
                  </div>
                  <div className="rounded bg-slate-50 py-1.5">
                    <p className="text-[9px] text-slate-400">규제율</p>
                    <p className="text-xs font-bold text-slate-700">{item.regRatio.toFixed(1)}%</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* 2-column bar charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Score TOP 20 */}
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">규제 리스크 TOP 20</h3>
          <p className="text-[11px] text-slate-400 mb-4">클릭 시 해당 산업 드릴다운</p>
          <ResponsiveContainer width="100%" height={520}>
            <BarChart
              data={riskTop}
              layout="vertical"
              margin={{ left: 4, right: 40, top: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="shortName"
                width={110}
                tick={{ fill: '#475569', fontSize: 11 }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="risk_score"
                name="risk_score"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: any) => onDrilldown?.(d.code)}
                label={<BarLabel />}
              >
                {riskTop.map((d, i) => (
                  <Cell key={i} fill={getRiskColor(d.risk_score, maxRisk)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Activity TOP 20 */}
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">최근 90일 입법 활성도 TOP 20</h3>
          <p className="text-[11px] text-slate-400 mb-4">클릭 시 해당 산업 드릴다운</p>
          <ResponsiveContainer width="100%" height={520}>
            <BarChart
              data={activityTop}
              layout="vertical"
              margin={{ left: 4, right: 40, top: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="shortName"
                width={110}
                tick={{ fill: '#475569', fontSize: 11 }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="recent_90d"
                name="90일 발의"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: any) => onDrilldown?.(d.code)}
                label={<BarLabelInt />}
              >
                {activityTop.map((d, i) => (
                  <Cell key={i} fill={getActivityColor(d.recent_90d, maxActivity)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 리스크 산업 랭킹 테이블 */}
      {(() => {
        const ranked = [...industries]
          .filter(s => (s.risk_score ?? 0) > 0)
          .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
        const maxR = ranked[0] ? ranked[0].risk_score ?? 1 : 1
        return (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">규제 리스크 산업 랭킹</h3>
              <span className="text-[11px] text-slate-500">
                risk_score {'>'} 0인 {ranked.length}개 산업 / 전체 {industries.length}개
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['#', '산업', '등급', 'risk_score', '총 발의', '가결', '가결률', '규제 비율', '90일 활성'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-slate-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((s, i) => {
                    const pct = maxR > 0 ? (s.risk_score ?? 0) / maxR : 0
                    const level = getRiskLevel(s.risk_score ?? 0)
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
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${level.bg} ${level.text} ${level.border}`}>
                            {level.label}
                          </span>
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
