'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import type { IndustrySignal, Bill } from '@/lib/types'
import { getKsicName } from '@/lib/ksic-names'
import { supabase } from '@/lib/supabase'
import { downloadBillsCsv } from '@/lib/csv-export'

interface DrilldownTabProps {
  signals: IndustrySignal[]
  initialKsic?: string | null
}

const PASS_RESULTS = new Set(['원안가결', '수정가결'])

function getBadgeStyle(type: string | null) {
  if (!type) return { bg: '#f1f5f9', text: '#94a3b8' }
  if (type === '규제') return { bg: '#fee2e2', text: '#dc2626' }
  if (type === '지원') return { bg: '#dcfce7', text: '#16a34a' }
  return { bg: '#f1f5f9', text: '#64748b' }
}

export default function DrilldownTab({ signals, initialKsic }: DrilldownTabProps) {
  const industries = signals
    .filter(s => s.ksic_level === 3)
    .sort((a, b) => b.total_bills - a.total_bills)

  const [selected, setSelected] = useState(initialKsic ?? industries[0]?.ksic_code ?? '')

  useEffect(() => {
    if (initialKsic) setSelected(initialKsic)
  }, [initialKsic])
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const loadBills = useCallback(async (code: string, p: number) => {
    if (!code) return
    setLoading(true)
    try {
      const { data } = await supabase.rpc('bills_by_ksic3', {
        p_code: code,
        p_offset: p * 50,
        p_limit: 50,
      })
      if (!data) return
      setBills(prev => p === 0 ? (data as Bill[]) : [...prev, ...(data as Bill[])])
      setHasMore((data as Bill[]).length === 50)
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

  const [searchQuery, setSearchQuery] = useState('')
  const [regFilter, setRegFilter] = useState<string>('all')

  const signal = signals.find(s => s.ksic_code === selected)

  const regData = signal ? [
    { name: '규제', value: signal.reg_count ?? 0, color: '#f04452' },
    { name: '지원', value: signal.support_count ?? 0, color: '#22c55e' },
    { name: '중립', value: signal.neutral_count ?? 0, color: '#9ca3af' },
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
    return <div className="text-center text-gray-400 py-12">데이터가 없습니다.</div>
  }

  return (
    <div className="space-y-5">
      {/* 산업 선택 */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <label className="block text-xs text-slate-600 mb-2 font-medium">산업 선택 (KSIC 중분류)</label>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm font-medium bg-white border border-slate-200"
          style={{ color: '#0f172a' }}
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
              { label: '총 발의', value: signal.total_bills.toLocaleString(), color: 'text-blue-600' },
              { label: '본회의 가결', value: signal.passed_bills.toLocaleString(), color: 'text-green-600' },
              { label: '가결률', value: (signal.pass_rate ?? 0).toFixed(1) + '%', color: 'text-teal-600' },
              { label: '계류 중', value: signal.pending_bills.toLocaleString(), color: 'text-amber-600' },
              { label: 'risk_score', value: (signal.risk_score ?? 0).toFixed(2), color: 'text-red-600' },
            ].map(c => (
              <div key={c.label} className="rounded-lg p-4 text-center bg-white border border-slate-200">
                <div className="text-xs text-slate-600 mb-1">{c.label}</div>
                <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 규제 유형 파이 */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-5 pt-5 pb-1">
                <h3 className="text-sm font-bold tracking-tight text-slate-900">규제 유형 분포</h3>
              </div>
              <div className="px-5 pb-3 pt-2">
                {regData.some(d => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={regData.filter(d => d.value > 0)}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={85}
                        paddingAngle={2} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                      >
                        {regData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                        formatter={(v: number) => [v.toLocaleString() + '건', '']}
                      />
                      <Legend wrapperStyle={{ color: '#6b7280', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">데이터 없음</div>
                )}
              </div>
              <div className="px-5 pb-3 text-right">
                <span className="text-[11px] text-gray-400">* source: Legiscope, 국회 OpenAPI</span>
              </div>
            </div>

            {/* 연도별 발의 추이 */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-5 pt-5 pb-1">
                <h3 className="text-sm font-bold tracking-tight text-slate-900">연도별 발의 추이</h3>
                <p className="text-xs text-slate-500 mt-0.5">최근 50건 기준</p>
              </div>
              <div className="px-5 pb-3 pt-2">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={yearData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                      formatter={(v: number) => [v + '건', '']}
                    />
                    <Bar dataKey="count" fill="#3182f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="px-5 pb-3 text-right">
                <span className="text-[11px] text-gray-400">* source: Legiscope, 국회 OpenAPI</span>
              </div>
            </div>
          </div>

          {/* 법안 목록 테이블 */}
          {(() => {
            const filtered = bills.filter(b => {
              const matchSearch = !searchQuery || (b.bill_name ?? '').includes(searchQuery)
              const matchReg = regFilter === 'all' || (b.regulation_type ?? '미분류') === regFilter
              return matchSearch && matchReg
            })
            return (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">관련 법안 목록</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{filtered.length}건 {filtered.length !== bills.length && `/ ${bills.length}건`}</span>
                  <button
                    onClick={() => downloadBillsCsv(filtered, `legiscope_${selected}.csv`)}
                    className="px-2.5 py-1 rounded text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    CSV 다운로드
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="법안명 검색..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 rounded px-2.5 py-1.5 text-xs text-slate-700 bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
                <select
                  value={regFilter}
                  onChange={e => setRegFilter(e.target.value)}
                  className="rounded px-2.5 py-1.5 text-xs text-slate-700 bg-white border border-slate-200"
                >
                  <option value="all">전체 유형</option>
                  <option value="규제">규제</option>
                  <option value="지원">지원</option>
                  <option value="중립">중립</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs bg-white">
                <thead>
                  <tr className="border-b border-gray-200" style={{ background: '#f9fafb' }}>
                    {['발의일', '법안명', '소관위원회', '처리결과', '유형'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b, i) => {
                    const badge = getBadgeStyle(b.regulation_type)
                    const passed = PASS_RESULTS.has(b.proc_result_cd ?? '')
                    return (
                      <tr key={b.bill_id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors" style={{ background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                        <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{b.propose_dt?.slice(0, 10) ?? '-'}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={b.bill_name}>{b.bill_name}</td>
                        <td className="px-3 py-2 text-gray-400 whitespace-nowrap max-w-[140px] truncate">{b.committee ?? '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span style={{ color: passed ? '#16a34a' : b.proc_result_cd ? '#9ca3af' : '#d1d5db' }}>
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
              <div className="px-5 py-3 text-center border-t border-gray-100" style={{ background: '#f9fafb' }}>
                <button
                  onClick={() => { const next = page + 1; setPage(next); loadBills(selected, next) }}
                  disabled={loading}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity"
                  style={{ background: '#1B2745', opacity: loading ? 0.5 : 1 }}
                >
                  {loading ? '불러오는 중…' : '더 보기 (+50건)'}
                </button>
              </div>
            )}
            <div className="px-5 py-2 text-right border-t border-gray-100">
              <span className="text-[11px] text-gray-400">* source: Legiscope, 국회 OpenAPI</span>
            </div>
          </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
