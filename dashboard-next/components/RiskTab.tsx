'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis, ReferenceLine, Label,
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
  return (
    <div className="rounded-lg px-3 py-2.5 text-xs bg-white border border-slate-200 shadow-lg">
      <p className="font-semibold text-slate-800 mb-1.5">{d.name}</p>
      <div className="space-y-0.5">
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

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">산업별 입법 리스크</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            KSIC 중분류 {industries.length}개 산업 · risk_score = 규제건수 × 규제가결률 / 100
          </p>
        </div>
        {asOf && (
          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-mono text-[11px] font-medium">
            {asOf.slice(0, 10)}
          </span>
        )}
      </div>

      {/* KPI 카드 */}
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
          <p className="text-[10px] text-amber-500 font-medium uppercase tracking-wider">규제 법안</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{totalRegBills.toLocaleString()}</p>
          <p className="text-[10px] text-amber-500 mt-0.5">전체 산업 합산</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">평균 규제 비율</p>
          <p className="text-2xl font-bold text-slate-700 mt-1">{avgRegRatio.toFixed(1)}%</p>
          <p className="text-[10px] text-slate-400 mt-0.5">규제 / (규제+지원)</p>
        </div>
      </div>

      {/* 산점도: 리스크 × 활성도 */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">리스크 × 활성도 매트릭스</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              우상단 = 고위험 + 고활성 (즉각 주의) · 버블 크기 = 총 발의 건수
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600" />고위험+고활성</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />고위험</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />고활성</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" />관찰</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              type="number" dataKey="risk_score" name="risk_score"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            >
              <Label value="risk_score →" position="bottom" offset={0} style={{ fill: '#94a3b8', fontSize: 11 }} />
            </XAxis>
            <YAxis
              type="number" dataKey="recent_90d" name="90일 발의"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            >
              <Label value="90일 활성도 →" angle={-90} position="insideLeft" offset={10} style={{ fill: '#94a3b8', fontSize: 11 }} />
            </YAxis>
            <ZAxis type="number" dataKey="total_bills" range={[40, 400]} />
            <ReferenceLine x={medRisk} stroke="#e2e8f0" strokeDasharray="3 3" />
            <ReferenceLine y={medActivity} stroke="#e2e8f0" strokeDasharray="3 3" />
            <Tooltip content={<ScatterTooltip />} />
            <Scatter data={scatterData} cursor="pointer" onClick={(d: any) => onDrilldown?.(d.code)}>
              {scatterData.map((d, i) => (
                <Cell
                  key={i}
                  fill={getScatterColor(d.risk_score, d.recent_90d, medRisk, medActivity)}
                  fillOpacity={0.7}
                  stroke={getScatterColor(d.risk_score, d.recent_90d, medRisk, medActivity)}
                  strokeOpacity={0.9}
                  strokeWidth={1}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
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
