'use client'

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine, ZAxis, ReferenceArea,
} from 'recharts'
import { useState } from 'react'
import type { IndustrySignal } from '@/lib/types'
import { getKsicName } from '@/lib/ksic-names'

interface RiskTabProps {
  signals: IndustrySignal[]
  asOf?: string
}

// ── 툴팁 컴포넌트 ──────────────────────────────────────────
function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1 cursor-help">
      <span className="text-gray-400 text-[13px] leading-none select-none">ⓘ</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2.5
        text-[11px] text-white bg-gray-800 rounded-lg shadow-xl
        opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50
        leading-relaxed text-left whitespace-normal">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </span>
    </span>
  )
}

// ── 헬퍼 ──────────────────────────────────────────────────
function getRiskBadge(score: number, max: number) {
  const pct = max > 0 ? score / max : 0
  if (pct > 0.5) return { label: 'High', bg: '#fee2e2', text: '#dc2626' }
  if (pct > 0.2) return { label: 'Mid', bg: '#fef9c3', text: '#b45309' }
  return { label: 'Low', bg: '#f0fdf4', text: '#15803d' }
}

// ── Scatter ───────────────────────────────────────────────
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

// ── 메인 컴포넌트 ─────────────────────────────────────────
export default function RiskTab({ signals, asOf }: RiskTabProps) {
  const [showAll, setShowAll] = useState(false)

  const l2 = signals.filter(s => s.ksic_level === 3 && (s.total_bills ?? 0) > 0)
  if (l2.length === 0) return <div className="text-center text-gray-400 py-12">데이터가 없습니다.</div>

  const maxRisk = Math.max(...l2.map(s => s.risk_score ?? 0), 0.01)
  const maxRecent = Math.max(...l2.map(s => s.recent_90d_bills ?? 0), 1)

  // 워치리스트
  const watchList = [...l2].sort((a, b) => {
    const ua = (a.risk_score ?? 0) / maxRisk * 0.55 + (a.recent_90d_bills ?? 0) / maxRecent * 0.45
    const ub = (b.risk_score ?? 0) / maxRisk * 0.55 + (b.recent_90d_bills ?? 0) / maxRecent * 0.45
    return ub - ua
  })
  const displayList = showAll ? watchList.slice(0, 15) : watchList.slice(0, 4)

  // 매트릭스: risk_score > 0인 산업 전체 표시 (데이터 정화 후 cap 불필요)
  const withRisk = l2.filter(s => (s.risk_score ?? 0) > 0)

  const xs = withRisk.map(s => s.risk_score ?? 0).sort((a, b) => a - b)
  const ys = withRisk.map(s => s.recent_90d_bills ?? 0).sort((a, b) => a - b)
  const medX = xs[Math.floor(xs.length / 2)] ?? 0
  const medY = ys[Math.floor(ys.length / 2)] ?? 0

  const scatterData = withRisk.map(s => {
    const isDanger = (s.risk_score ?? 0) >= medX && (s.recent_90d_bills ?? 0) >= medY
    return { x: s.risk_score ?? 0, y: s.recent_90d_bills ?? 0, z: s.total_bills ?? 0, code: s.ksic_code, danger: isDanger }
  })
  const labelSet = new Set(
    scatterData.filter(d => d.danger).sort((a, b) => (b.x + b.y) - (a.x + a.y)).slice(0, 5).map(d => d.code)
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

      {/* 제목 행 — pdeck 스타일 */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-gray-100">
        <h2 className="text-[17px] font-bold text-gray-900 flex items-center">
          산업별 입법 리스크
          <InfoTooltip text="KSIC 중분류 산업별 규제법안 누적 위험도(risk_score)와 최근 90일 입법 활성도를 분석합니다. 오른쪽 위 산업일수록 즉각 모니터링이 필요합니다." />
        </h2>
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          {asOf && <span>기준일: {asOf.slice(0, 10)}</span>}
          <span className="text-gray-300">|</span>
          <span className="flex items-center font-medium text-gray-500">
            Legiscope
            <InfoTooltip text="국회 OpenAPI, 법제처 DRF 등에서 수집한 42,000건+ 법안 데이터를 KSIC 산업분류에 매핑해 규제 리스크를 정량화하는 입법 모니터링 서비스입니다." />
          </span>
        </div>
      </div>

      {/* 2열 본문 */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-gray-200">

        {/* 워치리스트 */}
        <div>
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center">
            <span className="text-[12px] font-semibold text-gray-700">규제 리스크 워치리스트</span>
            <InfoTooltip text="위험도(risk_score)와 최근 90일 활성도를 종합한 점수로 산업을 순위화합니다. risk_score = 규제법안수 × 규제가결률 / 100" />
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-3 py-2 text-left text-gray-400 font-medium w-7">#</th>
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
                  <tr key={s.ksic_code}
                    className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors"
                    style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td className="px-3 py-2.5 text-gray-400 font-medium">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-800 text-[11px] leading-snug">{getKsicName(s.ksic_code)}</p>
                      <p className="text-[9px] text-gray-400 font-mono">{s.ksic_code}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: badge.bg, color: badge.text }}>{badge.label}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-red-500 font-semibold w-8 text-right text-[11px]">
                          {(s.risk_score ?? 0).toFixed(1)}
                        </span>
                        <div className="w-10 h-1.5 bg-gray-100 rounded-full">
                          <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${rPct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-600 w-8 text-right text-[11px]">{s.recent_90d_bills ?? 0}</span>
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
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50">
            <button onClick={() => setShowAll(v => !v)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-lg"
              style={{ color: '#2563eb', background: '#eff6ff' }}>
              {showAll ? '▲ 접기' : `▼ 전체 보기 (${watchList.length}개)`}
            </button>
          </div>
        </div>

        {/* 매트릭스 */}
        <div>
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center">
            <span className="text-[12px] font-semibold text-gray-700">리스크 매트릭스</span>
            <InfoTooltip text={`X축: 누적 규제 위험도(risk_score), Y축: 최근 90일 발의 건수. 오른쪽 위 붉은 구역 = 규제 강도 높고 현재 입법 활동도 활발한 산업. 규제법안 통과 이력이 있는 ${withRisk.length}개 산업 기준.`} />
          </div>
          <div className="px-4 py-3">
            <div className="flex gap-3 mb-1 text-[10px] text-gray-400">
              <span><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: '#fee2e2' }} />주목 구역</span>
              <span>● 붉은 = 주목 (상위 5개 이름 표시)</span>
              <span>● 파란 = 기타</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 8, right: 70, bottom: 24, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <ReferenceArea x1={medX} y1={medY} fill="#fee2e2" fillOpacity={0.3} />
                <XAxis type="number" dataKey="x" tick={{ fill: '#9ca3af', fontSize: 10 }}
                  tickFormatter={v => v.toFixed(1)}
                  label={{ value: 'risk_score →', fill: '#9ca3af', fontSize: 9, position: 'insideBottomRight', offset: -4 }} />
                <YAxis type="number" dataKey="y" tick={{ fill: '#9ca3af', fontSize: 10 }}
                  label={{ value: '최근 90일 →', fill: '#9ca3af', fontSize: 9, angle: -90, position: 'insideTopLeft', offset: 4 }} />
                <ZAxis type="number" dataKey="z" range={[30, 220]} />
                <RechartsTooltip content={<ScatterTooltip />} />
                <ReferenceLine x={medX} stroke="#cbd5e1" strokeDasharray="3 3" />
                <ReferenceLine y={medY} stroke="#cbd5e1" strokeDasharray="3 3" />
                <Scatter data={scatterData}
                  shape={(props: any) => <ScatterDot {...props} labelSet={labelSet} />} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 출처 */}
      <div className="px-5 py-2 border-t border-gray-100 text-right">
        <span className="text-[10px] text-gray-400">* source: Legiscope, 국회 OpenAPI</span>
      </div>

    </div>
  )
}
