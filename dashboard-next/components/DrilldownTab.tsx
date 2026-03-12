'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import type { IndustrySignal, Bill } from '@/lib/types'
import { getKsicName } from '@/lib/ksic-names'
import { supabase } from '@/lib/supabase'

interface DrilldownTabProps {
  signals: IndustrySignal[]
}

const PASS_RESULTS = new Set(['원안가결', '수정가결'])

function getBadgeStyle(type: string | null) {
  if (!type) return { bg: '#f1f5f9', text: '#94a3b8' }
  if (type === '규제') return { bg: '#fee2e2', text: '#dc2626' }
  if (type === '지원') return { bg: '#dcfce7', text: '#16a34a' }
  return { bg: '#f1f5f9', text: '#64748b' }
}

export default function DrilldownTab({ signals }: DrilldownTabProps) {
  const industries = signals
    .filter(s => s.ksic_level === 3)
    .sort((a, b) => b.total_bills - a.total_bills)

  const [selected, setSelected] = useState(industries[0]?.ksic_code ?? '')
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const loadBills = useCallback(async (code: string, p: number) => {
    if (!code) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('bills')
        .select('bill_id, bill_name, committee, propose_dt, proc_result_cd, regulation_type, ksic_codes')
        .contains('ksic_codes', [code])
        .order('propose_dt', { ascending: false })
        .range(p * 50, (p + 1) * 50 - 1)
      if (!data) return
      setBills(prev => p === 0 ? (data as Bill[]) : [...prev, ...(data as Bill[])])
      setHasMore(data.length === 50)
    } catch (e) {
      console.error('loadBills error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selected) return
    setPage(0)
    setBills([])
    loadBills(selected, 0)
  }, [selected, loadBills])

  const signal = signals.find(s => s.ksic_code === selected)

  const regData = signal ? [
    { name: '규제', value: signal.reg_count ?? 0, color: '#ef4444' },
    { name: '지원', value: signal.support_count ?? 0, color: '#22c55e' },
    { name: '중립', value: signal.neutral_count ?? 0, color: '#94a3b8' },
  ] : []

  const yearMap = new Map<string, number>()
  for (const b of bills) {
    if (!b.propose_dt) continue
    const y = b.propose_dt.slice(0, 4)
    yearMap.set(y, (yearMap.get(y) ?? 0) + 1)
  }
  const yearData = Array.from(yearMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, count]) => ({ year, count }))

  if (industries.length === 0) {
    return <div className="text-center text-slate-400 py-12">데이터가 없습니다.</div>
  }

  return (
    <div className="space-y-6">
      {/* 산업 선택 */}
      <div className="rounded-xl p-4 bg-white" style={{ border: '1px solid #e2e8f0' }}>
        <label className="block text-xs text-slate-500 mb-2 font-medium">산업 선택 (KSIC 중분류)</label>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-700 bg-white"
          style={{ border: '1px solid #e2e8f0' }}
        >
          {industries.map(s => (
            <option key={s.ksic_code} value={s.ksic_code}>
              [{s.ksic_code}] {getKsicName(s.ksic_code)} — {s.total_bills.toLocaleString()}건
            </option>
          ))}
        </select>
      </div>

      {signal && (
        <>
          {/* 지표 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: '총 발의', value: signal.total_bills.toLocaleString(), color: '#3b82f6' },
              { label: '본회의 가결', value: signal.passed_bills.toLocaleString(), color: '#22c55e' },
              { label: '가결률', value: (signal.pass_rate ?? 0).toFixed(1) + '%', color: '#10b981' },
              { label: '계류 중', value: signal.pending_bills.toLocaleString(), color: '#f59e0b' },
              { label: 'risk_score', value: (signal.risk_score ?? 0).toFixed(2), color: '#ef4444' },
            ].map(c => (
              <div key={c.label} className="rounded-xl p-4 text-center bg-white" style={{ border: '1px solid #e2e8f0' }}>
                <div className="text-xs text-slate-500 mb-1">{c.label}</div>
                <div className="text-xl font-bold" style={{ color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 규제 유형 파이 */}
            <div className="rounded-xl p-5 bg-white" style={{ border: '1px solid #e2e8f0' }}>
              <h3 className="text-sm font-semibold text-slate-700 mb-4">🏷️ 규제 유형 분포</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={regData.filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                  >
                    {regData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                    formatter={(v: number) => [v.toLocaleString() + '건', '']}
                  />
                  <Legend wrapperStyle={{ color: '#64748b', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 연도별 발의 추이 */}
            <div className="rounded-xl p-5 bg-white" style={{ border: '1px solid #e2e8f0' }}>
              <h3 className="text-sm font-semibold text-slate-700 mb-4">📅 연도별 발의 추이 (최근 50건 기준)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={yearData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                    formatter={(v: number) => [v + '건', '']}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 법안 목록 테이블 */}
          <div className="rounded-xl overflow-hidden bg-white" style={{ border: '1px solid #e2e8f0' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <h3 className="text-sm font-semibold text-slate-700">📋 관련 법안 목록</h3>
              <span className="text-xs text-slate-400">{bills.length}건 표시</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs bg-white">
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['발의일', '법안명', '소관위원회', '처리결과', '유형'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-slate-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b, i) => {
                    const badge = getBadgeStyle(b.regulation_type)
                    const passed = PASS_RESULTS.has(b.proc_result_cd ?? '')
                    return (
                      <tr key={b.bill_id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{b.propose_dt?.slice(0, 10) ?? '-'}</td>
                        <td className="px-3 py-2 text-slate-700 max-w-xs truncate" title={b.bill_name}>{b.bill_name}</td>
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap max-w-[140px] truncate">{b.committee ?? '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span style={{ color: passed ? '#16a34a' : b.proc_result_cd ? '#94a3b8' : '#cbd5e1' }}>
                            {b.proc_result_cd ?? '계류 중'}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: badge.bg, color: badge.text }}>
                            {b.regulation_type ?? '미분류'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="px-5 py-3 text-center" style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <button
                  onClick={() => { const next = page + 1; setPage(next); loadBills(selected, next) }}
                  disabled={loading}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: '#2563eb', color: '#fff', opacity: loading ? 0.5 : 1 }}
                >
                  {loading ? '불러오는 중…' : '더 보기 (+50건)'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
