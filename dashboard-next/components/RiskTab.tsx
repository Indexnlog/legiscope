'use client'

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ZAxis, ReferenceArea,
} from 'recharts'
import { useState } from 'react'
import type { IndustrySignal } from '@/lib/types'
import { getKsicName } from '@/lib/ksic-names'

interface RiskTabProps {
  signals: IndustrySignal[]
  asOf?: string
}

function getRiskBadge(score: number, max: number) {
  const pct = max > 0 ? score / max : 0
  if (pct > 0.5) return { label: 'High', bg: '#fee2e2', text: '#dc2626' }
  if (pct > 0.2) return { label: 'Mid', bg: '#fef9c3', text: '#b45309' }
  return { label: 'Low', bg: '#f0fdf4', text: '#15803d' }
}

function percentile(arr: number[], p: number) {
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.min(Math.floor(sorted.length * p / 100), sorted.length - 1)] ?? 0
}

const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="rounded-lg p-3 text-xs bg-white border border-gray-200 shadow-lg min-w-[160px]">
      <p className="font-bold mb-1.5" style={{ color: '#1B2745' }}>
        {getKsicName(d.code)} ({d.code})
      </p>
      <p className="text-gray-500">risk_score: <span className="font-semibold text-red-500">{d.x?.toFixed(2)}</span></p>
      <p className="text-gray-500">최근 90일: <span className="font-semibold">{d.y}건</span></p>
      <p className="text-gray-500">총 발의: {d.z?.toLocaleString()}건</p>
    </div>
  )
}

function ScatterDot(props: any) {
  const { cx, cy, payload, labelSet } = props
  if (cx == null || cy == null) return null
  const showLabel = labelSet?.has(payload.code)
  const isDanger = payload.danger
  return (
    <g>
      <circle cx={cx} cy={cy} r={isDanger ? 5 : 3.5}
        fill={isDanger ? '#f04452' : '#3182f6'}
        fillOpacity={isDanger ? 0.85 : 0.5}
      />
      {showLabel && (
        <text x={cx + 7} y={cy + 4} fontSize={9} fill="#1B2745" fontWeight="600" style={{ pointerEvents: 'none' }}>
          {getKsicName(payload.code).slice(0, 8)}
        </text>
      )}
    </g>
  )
}

export default function RiskTab({ signals, asOf }: RiskTabProps) {
  const [showAll, setShowAll] = useState(false)

  const l2 = signals.filter(s => s.ksic_level === 3 && (s.total_bills ?? 0) > 0)
  if (l2.length === 0) return <div className="text-center text-gray-400 py-12">데이터가 없습니다.</div>

  const maxRisk = Math.max(...l2.map(s => s.risk_score ?? 0), 0.01)
  const maxRecent = Math.max(...l2.map(s => s.recent_90d_bills ?? 0), 1)

  // 워치리스트: 전체 산업 정렬
  const watchList = [...l2].sort((a, b) => {
    const ua = (a.risk_score ?? 0) / maxRisk * 0.55 + (a.recent_90d_bills ?? 0) / maxRecent * 0.45
    const ub = (b.risk_score ?? 0) / maxRisk * 0.55 + (b.recent_90d_bills ?? 0) / maxRecent * 0.45
    return ub - ua
  })
  const displayList = showAll ? watchList.slice(0, 15) : watchList.slice(0, 4)

  // ── 매트릭스: risk_score > 0인 산업만 (의미 있는 규제 위험이 있는 산업)
  const withRisk = l2.filter(s => (s.risk_score ?? 0) > 0 && (s.recent_90d_bills ?? 0) > 0)
  const capR = percentile(withRisk.map(s => s.risk_score ?? 0), 90)
  const capN = percentile(withRisk.map(s => s.recent_90d_bills ?? 0), 90)

  const inView = withRisk.filter(s => (s.risk_score ?? 0) <= capR && (s.recent_90d_bills ?? 0) <= capN)
  const excluded = withRisk.filter(s => (s.risk_score ?? 0) > capR || (s.recent_90d_bills ?? 0) > capN)

  const xs = inView.map(s => s.risk_score ?? 0).sort((a, b) => a - b)
  const ys = inView.map(s => s.recent_90d_bills ?? 0).sort((a, b) => a - b)
  const medX = xs[Math.floor(xs.length / 2)] ?? 0
  const medY = ys[Math.floor(ys.length / 2)] ?? 0

  const scatterData = inView.map(s => {
    const isDanger = (s.risk_score ?? 0) >= medX && (s.recent_90d_bills ?? 0) >= medY
    return { x: s.risk_score ?? 0, y: s.recent_90d_bills ?? 0, z: s.total_bills ?? 0, code: s.ksic_code, danger: isDanger }
  })

  const labelSet = new Set(
    scatterData.filter(d => d.danger)
      .sort((a, b) => (b.x + b.y) - (a.x + a.y))
      .slice(0, 5).map(d => d.code)
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

      {/* 헤더 */}
      <div className="px-5 py-4" style={{ background: '#1B2745' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-white tracking-tight">산업별 입법 리스크</h2>
            <p className="text-[11px] mt-1" style={{ color: '#93c5fd' }}>
              KSIC 중분류 {l2.length}개 산업 기준 · 규제법안 누적 위험도 × 최근 입법 활성도
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] text-blue-300">Legiscope</span>
            {asOf && <p className="text-[10px] text-blue-400 mt-0.5">기준일 {asOf.slice(0, 10)}</p>}
          </div>
        </div>
      </div>

      {/* 2열 본문 */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-gray-200">

        {/* 왼쪽: 워치리스트 */}
        <div>
          <div className="px-4 py-2.5 border-b border-gray-100" style={{ background: '#f9fafb' }}>
            <p className="text-[11px] font-semibold text-gray-700">규제 리스크 워치리스트</p>
            <p className="text-[10px] text-gray-400 mt-0.5">위험도 × 최근활성도 종합 점수 기준</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100" style={{ background: '#fafafa' }}>
                <th className="px-3 py-2 text-left text-gray-400 font-medium w-8">#</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">산업명</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">등급</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">risk</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">90일</th>
              </tr>
            </thead>
            <tbody>
              {displayList.map((s, i) => {
                const badge = getRiskBadge(s.risk_score ?? 0, maxRisk)
                const rPct = Math.min((s.risk_score ?? 0) / maxRisk * 100, 100).toFixed(0)
                const nPct = Math.min((s.recent_90d_bills ?? 0) / maxRecent * 100, 100).toFixed(0)
                return (
                  <tr key={s.ksic_code} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors"
                    style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td className="px-3 py-2.5 text-gray-400 font-medium">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-800 text-[11px] leading-tight">{getKsicName(s.ksic_code)}</p>
                      <p className="text-[9px] text-gray-400 font-mono mt-0.5">{s.ksic_code}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                        style={{ background: badge.bg, color: badge.text }}>{badge.label}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-red-500 font-semibold w-7 text-right text-[11px]">
                          {(s.risk_score ?? 0).toFixed(1)}
                        </span>
                        <div className="w-10 h-1.5 bg-gray-100 rounded-full">
                          <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${rPct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-600 w-7 text-right text-[11px]">{s.recent_90d_bills ?? 0}</span>
                        <div className="w-10 h-1.5 bg-gray-100 rounded-full">
                          <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${nPct}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-gray-100" style={{ background: '#f9fafb' }}>
            <button onClick={() => setShowAll(v => !v)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-lg"
              style={{ color: '#2563eb', background: '#eff6ff' }}>
              {showAll ? '▲ 접기' : `▼ 전체 보기 (${watchList.length}개)`}
            </button>
          </div>
        </div>

        {/* 오른쪽: 리스크 매트릭스 */}
        <div>
          <div className="px-4 py-2.5 border-b border-gray-100" style={{ background: '#f9fafb' }}>
            <p className="text-[11px] font-semibold text-gray-700">리스크 매트릭스</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              규제법안 통과 이력 있는 {withRisk.length}개 산업 기준 · 오른쪽 위 = 즉각 모니터링 필요
            </p>
          </div>
          <div className="px-4 py-3">
            {excluded.length > 0 && (
              <div className="mb-2 px-3 py-1.5 rounded text-[10px] text-amber-700 flex items-start gap-1.5"
                style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
                <span className="font-medium shrink-0">⚠ 범위 초과 제외:</span>
                <span className="truncate">{excluded.map(o => getKsicName(o.ksic_code)).join(', ')}</span>
              </div>
            )}
            <div className="flex gap-3 mb-1.5 text-[10px] text-gray-400">
              <span><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: '#fee2e2' }} />주목 구역</span>
              <span>● 붉은 = 주목 산업 (상위 5개 이름 표시)</span>
              <span>● 파란 = 기타</span>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 8, right: 70, bottom: 24, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <ReferenceArea x1={medX} y1={medY} fill="#fee2e2" fillOpacity={0.3} />
                <XAxis type="number" dataKey="x" tick={{ fill: '#9ca3af', fontSize: 10 }}
                  tickFormatter={v => v.toFixed(1)}
                  label={{ value: 'risk_score →', fill: '#9ca3af', fontSize: 9, position: 'insideBottomRight', offset: -4 }} />
                <YAxis type="number" dataKey="y" tick={{ fill: '#9ca3af', fontSize: 10 }}
                  label={{ value: '최근 90일 →', fill: '#9ca3af', fontSize: 9, angle: -90, position: 'insideTopLeft', offset: 4 }} />
                <ZAxis type="number" dataKey="z" range={[30, 220]} />
                <Tooltip content={<ScatterTooltip />} />
                <ReferenceLine x={medX} stroke="#cbd5e1" strokeDasharray="3 3" />
                <ReferenceLine y={medY} stroke="#cbd5e1" strokeDasharray="3 3" />
                <Scatter data={scatterData}
                  shape={(props: any) => <ScatterDot {...props} labelSet={labelSet} />} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 푸터 */}
      <div className="px-5 py-2 border-t border-gray-100 text-right" style={{ background: '#f9fafb' }}>
        <span className="text-[10px] text-gray-400">* source: Legiscope, 국회 OpenAPI · risk_score = 규제법안수 × 규제가결률 / 100</span>
      </div>

    </div>
  )
}
