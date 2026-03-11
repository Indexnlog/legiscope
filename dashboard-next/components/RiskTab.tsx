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
  return (
    <div className="rounded-lg p-3 text-xs" style={{ background: '#0f172a', border: '1px solid #334155' }}>
      <p className="font-semibold text-slate-200 mb-1">{getKsicName(d.ksic_code)} ({d.ksic_code})</p>
      <p className="text-slate-400">발의: {d.total_bills?.toLocaleString()}건</p>
      <p className="text-slate-400">규제법안: {d.reg_count}건 ({d.reg_ratio?.toFixed(1)}%)</p>
      <p className="text-slate-400">최근 90일: {d.recent_90d_bills}건</p>
      <p className="text-red-400 font-semibold">risk_score: {d.risk_score?.toFixed(2)}</p>
    </div>
  )
}

const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="rounded-lg p-3 text-xs" style={{ background: '#0f172a', border: '1px solid #334155' }}>
      <p className="font-semibold text-slate-200">{getKsicName(d.ksic_code)} ({d.ksic_code})</p>
      <p className="text-slate-400">risk_score: {d.x?.toFixed(2)}</p>
      <p className="text-slate-400">최근 90일: {d.y}건</p>
      <p className="text-slate-400">총 발의: {d.z?.toLocaleString()}건</p>
    </div>
  )
}

export default function RiskTab({ signals }: RiskTabProps) {
  const l2 = signals.filter(s => s.ksic_level === 3)

  const topRisk = [...l2].sort((a, b) => b.risk_score - a.risk_score).slice(0, 20)
  const topRecent = [...l2].sort((a, b) => b.recent_90d_bills - a.recent_90d_bills).slice(0, 20)
  const scatterData = l2
    .filter(s => s.risk_score > 0 || s.recent_90d_bills > 0)
    .map(s => ({ x: s.risk_score, y: s.recent_90d_bills, z: s.total_bills, ksic_code: s.ksic_code }))

  const makeBarData = (arr: IndustrySignal[], valueKey: keyof IndustrySignal) =>
    arr.map(s => ({
      name: getKsicName(s.ksic_code).slice(0, 12),
      value: s[valueKey] as number,
      code: s.ksic_code,
    }))

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '분석 산업 수', value: l2.length + '개', color: '#3b82f6' },
          { label: '최고 risk_score', value: (Math.max(...l2.map(s => s.risk_score))).toFixed(2), color: '#ef4444' },
          { label: '최근 90일 최다 발의', value: (Math.max(...l2.map(s => s.recent_90d_bills))) + '건', color: '#f59e0b' },
          { label: '규제법안 있는 산업', value: l2.filter(s => s.reg_count > 0).length + '개', color: '#a855f7' },
        ].map(card => (
          <div key={card.label} className="rounded-xl p-4 text-center" style={{ background: '#1e293b', border: '1px solid #334155' }}>
            <div className="text-xs text-slate-400 mb-1">{card.label}</div>
            <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* risk_score TOP 20 */}
        <div className="rounded-xl p-5" style={{ background: '#1e293b', border: '1px solid #334155' }}>
          <h3 className="text-sm font-semibold text-slate-300 mb-1">🔴 규제 위험 TOP 20</h3>
          <p className="text-xs text-slate-500 mb-4">risk_score = 규제법안수 × 규제법안가결률 / 100</p>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={makeBarData(topRisk, 'risk_score')} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} width={100} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 최근 90일 TOP 20 */}
        <div className="rounded-xl p-5" style={{ background: '#1e293b', border: '1px solid #334155' }}>
          <h3 className="text-sm font-semibold text-slate-300 mb-1">📈 최근 90일 입법 활성 TOP 20</h3>
          <p className="text-xs text-slate-500 mb-4">최근 3개월간 발의된 법안 수</p>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={makeBarData(topRecent, 'recent_90d_bills')} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} width={100} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 산점도 */}
      <div className="rounded-xl p-5" style={{ background: '#1e293b', border: '1px solid #334155' }}>
        <h3 className="text-sm font-semibold text-slate-300 mb-1">🔵 규제 위험 vs 입법 활성도</h3>
        <p className="text-xs text-slate-500 mb-4">오른쪽 위로 갈수록 규제도 강하고 최근에도 법안이 많이 발의됨 → 주목 필요</p>
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" dataKey="x" name="risk_score" tick={{ fill: '#94a3b8', fontSize: 11 }}>
              <Label value="risk_score →" fill="#64748b" fontSize={11} position="insideBottomRight" offset={-10} />
            </XAxis>
            <YAxis type="number" dataKey="y" name="최근90일" tick={{ fill: '#94a3b8', fontSize: 11 }}>
              <Label value="최근90일 발의" fill="#64748b" fontSize={11} angle={-90} position="insideTopLeft" />
            </YAxis>
            <ZAxis type="number" dataKey="z" range={[40, 400]} />
            <Tooltip content={<ScatterTooltip />} />
            <Scatter data={scatterData} fill="#3b82f6" fillOpacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
