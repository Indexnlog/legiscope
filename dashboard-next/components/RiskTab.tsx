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

// log1p 스케일 변환 (0 포함 데이터에 안전)
const toLog = (v: number) => Math.log1p(v)
const fromLog = (v: number) => Math.expm1(v)

const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="rounded-lg p-3 text-xs bg-white border border-gray-200 shadow-md min-w-[160px]">
      <p className="font-bold mb-1.5" style={{ color: '#1B2745' }}>
        {getKsicName(d.code)} ({d.code})
      </p>
      <p className="text-gray-500">risk_score: <span className="font-semibold text-red-500">{d.riskRaw?.toFixed(2)}</span></p>
      <p className="text-gray-500">최근 90일: <span className="font-semibold">{d.recentRaw}건</span></p>
      <p className="text-gray-500">총 발의: {d.z?.toLocaleString()}건</p>
    </div>
  )
}

// 위험 구역 상위 N개만 레이블 표시
function ScatterDot(props: any) {
  const { cx, cy, payload, labelSet } = props
  if (cx == null || cy == null) return null
  const showLabel = labelSet?.has(payload.code)
  const isDanger = payload.danger
  return (
    <g>
      <circle
        cx={cx} cy={cy}
        r={isDanger ? 5 : 3}
        fill={isDanger ? '#f04452' : '#3182f6'}
        fillOpacity={isDanger ? 0.85 : 0.4}
      />
      {showLabel && (
        <text x={cx + 7} y={cy + 4} fontSize={9} fill="#1B2745" fontWeight="500" style={{ pointerEvents: 'none' }}>
          {getKsicName(payload.code).slice(0, 8)}
        </text>
      )}
    </g>
  )
}

export default function RiskTab({ signals, asOf }: RiskTabProps) {
  const [showAll, setShowAll] = useState(false)

  const l2 = signals.filter(s => s.ksic_level === 3 && (s.total_bills ?? 0) > 0)

  if (l2.length === 0) {
    return <div className="text-center text-gray-400 py-12">데이터가 없습니다.</div>
  }

  const maxRisk = Math.max(...l2.map(s => s.risk_score ?? 0), 0.01)
  const maxRecent = Math.max(...l2.map(s => s.recent_90d_bills ?? 0), 1)

  // log 변환된 산점도 데이터
  const scatterData = l2.map(s => ({
    x: toLog(s.risk_score ?? 0),
    y: toLog(s.recent_90d_bills ?? 0),
    z: s.total_bills ?? 0,
    riskRaw: s.risk_score ?? 0,
    recentRaw: s.recent_90d_bills ?? 0,
    code: s.ksic_code,
    danger: false, // 아래에서 설정
  }))

  // log 공간의 중앙값
  const xs = scatterData.map(d => d.x).sort((a, b) => a - b)
  const ys = scatterData.map(d => d.y).sort((a, b) => a - b)
  const medX = xs[Math.floor(xs.length / 2)] ?? 0
  const medY = ys[Math.floor(ys.length / 2)] ?? 0

  // 위험 구역 = log 공간 우상단
  const dangerItems = scatterData.filter(d => d.x >= medX && d.y >= medY)
  dangerItems.forEach(d => { d.danger = true })

  // 레이블: 위험 구역 내 상위 5개 (log x+y 합산 기준)
  const labelSet = new Set(
    [...dangerItems]
      .sort((a, b) => (b.x + b.y) - (a.x + a.y))
      .slice(0, 5)
      .map(d => d.code)
  )

  // 워치리스트
  const watchList = [...l2]
    .sort((a, b) => {
      const ua = (a.risk_score ?? 0) / maxRisk * 0.55 + (a.recent_90d_bills ?? 0) / maxRecent * 0.45
      const ub = (b.risk_score ?? 0) / maxRisk * 0.55 + (b.recent_90d_bills ?? 0) / maxRecent * 0.45
      return ub - ua
    })

  const displayList = showAll ? watchList.slice(0, 15) : watchList.slice(0, 4)
  const topRecentIndustry = [...l2].sort((a, b) => (b.recent_90d_bills ?? 0) - (a.recent_90d_bills ?? 0))[0]

  // X/Y 축 log 틱 표시값
  const xTickFormatter = (v: number) => fromLog(v).toFixed(1)
  const yTickFormatter = (v: number) => Math.round(fromLog(v)).toString()

  return (
    <div className="space-y-5">

      {/* 위젯 헤더 */}
      <div className="rounded-xl px-5 py-4" style={{ background: '#1B2745' }}>
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

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '분석 산업 수', value: l2.length + '개', color: '#3182f6' },
          { label: '최고 risk_score', value: maxRisk.toFixed(2), color: '#f04452' },
          { label: '주목 산업', value: dangerItems.length + '개', color: '#f59e0b', sub: '위험高 + 활성高' },
          {
            label: '최근 90일 최다',
            value: (topRecentIndustry?.recent_90d_bills ?? 0) + '건',
            color: '#a855f7',
            sub: getKsicName(topRecentIndustry?.ksic_code).slice(0, 9),
          },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4 text-center bg-white border border-gray-200 shadow-sm">
            <div className="text-[11px] text-gray-500 mb-1">{c.label}</div>
            <div className="text-xl font-bold" style={{ color: c.color }}>{c.value}</div>
            {c.sub && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* 워치리스트 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3" style={{ background: '#1B2745' }}>
          <div>
            <h3 className="text-sm font-semibold text-white">규제 리스크 워치리스트</h3>
            <p className="text-[10px] mt-0.5" style={{ color: '#93c5fd' }}>위험도 × 최근활성도 종합 점수 기준</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200" style={{ background: '#f9fafb' }}>
                {['순위', '산업명 (KSIC)', '위험등급', 'risk_score', '최근 90일', '가결률'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayList.map((s, i) => {
                const badge = getRiskBadge(s.risk_score ?? 0, maxRisk)
                const riskPct = Math.min(((s.risk_score ?? 0) / maxRisk * 100), 100).toFixed(0)
                const recentPct = Math.min(((s.recent_90d_bills ?? 0) / maxRecent * 100), 100).toFixed(0)
                return (
                  <tr
                    key={s.ksic_code}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    style={{ background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}
                  >
                    <td className="px-3 py-2.5 text-gray-400 font-medium w-10">#{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-gray-800">{getKsicName(s.ksic_code)}</span>
                      <span className="ml-1.5 text-gray-400 font-mono text-[10px]">{s.ksic_code}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold" style={{ background: badge.bg, color: badge.text }}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-red-500 w-10 text-right">{(s.risk_score ?? 0).toFixed(2)}</span>
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full">
                          <div className="h-1.5 rounded-full" style={{ width: `${riskPct}%`, background: '#f04452' }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700 w-10 text-right">{s.recent_90d_bills ?? 0}</span>
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full">
                          <div className="h-1.5 rounded-full" style={{ width: `${recentPct}%`, background: '#3182f6' }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                      {(s.pass_rate ?? 0).toFixed(1)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 flex items-center justify-between border-t border-gray-100" style={{ background: '#f9fafb' }}>
          <button
            onClick={() => setShowAll(v => !v)}
            className="text-[11px] font-medium px-3 py-1 rounded-lg transition-colors"
            style={{ color: '#2563eb', background: '#eff6ff' }}
          >
            {showAll ? '▲ 접기' : `▼ 전체 보기 (${watchList.length}개 산업)`}
          </button>
          <span className="text-[11px] text-gray-400">* source: Legiscope, 국회 OpenAPI</span>
        </div>
      </div>

      {/* 4분면 리스크 매트릭스 — log scale */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <h3 className="text-[15px] font-bold tracking-tight" style={{ color: '#1B2745' }}>리스크 매트릭스</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            오른쪽 위 붉은 구역 = 규제위험 높고 최근 입법도 활발한 산업 · 점선 = 중앙값 · 로그 스케일
          </p>
        </div>
        <div className="px-5 pb-2 pt-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[10px] text-gray-500">
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: '#fee2e2' }} />주목 필요 구역</span>
            <span>● 붉은 점 = 주목 산업 (상위 5개 이름 표시)</span>
            <span>○ 파란 점 = 기타 산업</span>
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <ScatterChart margin={{ top: 10, right: 80, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <ReferenceArea x1={medX} y1={medY} fill="#fee2e2" fillOpacity={0.3} />
              <XAxis
                type="number" dataKey="x" name="risk_score"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={xTickFormatter}
                label={{ value: 'risk_score →', fill: '#9ca3af', fontSize: 10, position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis
                type="number" dataKey="y" name="최근90일"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={yTickFormatter}
                label={{ value: '최근 90일 →', fill: '#9ca3af', fontSize: 10, angle: -90, position: 'insideTopLeft', offset: 5 }}
              />
              <ZAxis type="number" dataKey="z" range={[30, 250]} />
              <Tooltip content={<ScatterTooltip />} />
              <ReferenceLine x={medX} stroke="#cbd5e1" strokeDasharray="4 3" />
              <ReferenceLine y={medY} stroke="#cbd5e1" strokeDasharray="4 3" />
              <Scatter
                data={scatterData}
                shape={(props: any) => <ScatterDot {...props} labelSet={labelSet} />}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="px-5 pb-3 text-right">
          <span className="text-[11px] text-gray-400">* source: Legiscope, 국회 OpenAPI · 축: log(1+값) 변환 적용</span>
        </div>
      </div>

    </div>
  )
}
