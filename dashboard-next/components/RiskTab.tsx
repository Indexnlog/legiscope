'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, Label,
} from 'recharts'
import type { IndustrySignal } from '@/lib/types'
import { getKsicName } from '@/lib/ksic-names'

interface RiskTabProps {
  signals: IndustrySignal[]
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const code = d.ksic_code ?? d.code ?? ''
  return (
    <div className="rounded-lg p-3 text-xs bg-white border border-gray-200 shadow-md">
      <p className="font-bold mb-1" style={{ color: '#1B2745' }}>{getKsicName(code)} ({code})</p>
      <p className="text-gray-500">발의: {d.total_bills?.toLocaleString()}건</p>
      <p className="text-gray-500">규제법안: {d.reg_count}건 ({d.reg_ratio?.toFixed(1)}%)</p>
      <p className="text-gray-500">최근 90일: {d.recent_90d_bills}건</p>
      <p className="font-semibold" style={{ color: '#f04452' }}>risk_score: {d.risk_score?.toFixed(2)}</p>
    </div>
  )
}

const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="rounded-lg p-3 text-xs bg-white border border-gray-200 shadow-md">
      <p className="font-bold" style={{ color: '#1B2745' }}>{getKsicName(d.ksic_code)} ({d.ksic_code})</p>
      <p className="text-gray-500">risk_score: {d.x?.toFixed(2)}</p>
      <p className="text-gray-500">최근 90일: {d.y}건</p>
      <p className="text-gray-500">총 발의: {d.z?.toLocaleString()}건</p>
    </div>
  )
}

export default function RiskTab({ signals }: RiskTabProps) {
  const l2 = signals.filter(s => s.ksic_level === 3)

  if (l2.length === 0) {
    return <div className="text-center text-gray-400 py-12">데이터가 없습니다.</div>
  }

  const topRisk = [...l2].sort((a, b) => b.risk_score - a.risk_score).slice(0, 20)
  const topRecent = [...l2].sort((a, b) => b.recent_90d_bills - a.recent_90d_bills).slice(0, 20)
  const scatterData = l2
    .filter(s => s.risk_score > 0 || s.recent_90d_bills > 0)
    .map(s => ({ x: s.risk_score, y: s.recent_90d_bills, z: s.total_bills, ksic_code: s.ksic_code }))

  const makeBarData = (arr: IndustrySignal[], valueKey: keyof IndustrySignal) =>
    arr.map(s => ({
      name: getKsicName(s.ksic_code).slice(0, 12),
      value: (s[valueKey] as number) ?? 0,
      code: s.ksic_code,
    }))

  const maxRisk = Math.max(...l2.map(s => s.risk_score ?? 0), 0)
  const maxRecent = Math.max(...l2.map(s => s.recent_90d_bills ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '분석 산업 수', value: l2.length + '개', color: '#3182f6' },
          { label: '최고 risk_score', value: maxRisk.toFixed(2), color: '#f04452' },
          { label: '최근 90일 최다 발의', value: maxRecent + '건', color: '#f59e0b' },
          { label: '규제법안 있는 산업', value: l2.filter(s => s.reg_count > 0).length + '개', color: '#a855f7' },
        ].map(card => (
          <div key={card.label} className="rounded-xl p-4 text-center bg-white border border-gray-200 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* risk_score TOP 20 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-1">
            <h3 className="text-[15px] font-bold tracking-tight" style={{ color: '#1B2745' }}>규제 위험 TOP 20</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">risk_score = 규제법안수 × 규제법안가결률 / 100</p>
          </div>
          <div className="px-5 pb-5 pt-3">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={makeBarData(topRisk, 'risk_score')} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#374151', fontSize: 10 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill="#f04452" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="px-5 pb-3 text-right">
            <span className="text-[11px] text-gray-400">* source: Legiscope, 국회 OpenAPI</span>
          </div>
        </div>

        {/* 최근 90일 TOP 20 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-1">
            <h3 className="text-[15px] font-bold tracking-tight" style={{ color: '#1B2745' }}>최근 90일 입법 활성 TOP 20</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">최근 3개월간 발의된 법안 수 기준</p>
          </div>
          <div className="px-5 pb-5 pt-3">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={makeBarData(topRecent, 'recent_90d_bills')} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#374151', fontSize: 10 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill="#3182f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="px-5 pb-3 text-right">
            <span className="text-[11px] text-gray-400">* source: Legiscope, 국회 OpenAPI</span>
          </div>
        </div>
      </div>

      {/* 산점도 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-1">
          <h3 className="text-[15px] font-bold tracking-tight" style={{ color: '#1B2745' }}>규제 위험 vs 입법 활성도</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">오른쪽 위 → 규제 강도 높고 최근 발의도 많은 산업 (주목 필요)</p>
        </div>
        <div className="px-5 pb-5 pt-3">
          <ResponsiveContainer width="100%" height={360}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" dataKey="x" name="risk_score" tick={{ fill: '#9ca3af', fontSize: 11 }}>
                <Label value="risk_score →" fill="#9ca3af" fontSize={11} position="insideBottomRight" offset={-10} />
              </XAxis>
              <YAxis type="number" dataKey="y" name="최근90일" tick={{ fill: '#9ca3af', fontSize: 11 }}>
                <Label value="최근90일 발의" fill="#9ca3af" fontSize={11} angle={-90} position="insideTopLeft" />
              </YAxis>
              <ZAxis type="number" dataKey="z" range={[40, 400]} />
              <Tooltip content={<ScatterTooltip />} />
              <Scatter data={scatterData} fill="#3182f6" fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="px-5 pb-3 text-right">
          <span className="text-[11px] text-gray-400">* source: Legiscope, 국회 OpenAPI · 기준일: 최신 스냅샷</span>
        </div>
      </div>
    </div>
  )
}
