'use client'

import { useState, useCallback } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import type { IndustrySignal, Bill } from '@/lib/types'
import { getKsicName } from '@/lib/ksic-names'
import { supabase } from '@/lib/supabase'

interface CompanyTabProps {
  signals: IndustrySignal[]
}

const PASS_RESULTS = new Set(['원안가결', '수정가결'])

function getBadgeStyle(type: string | null) {
  if (type === '규제') return 'bg-rose-50 text-rose-600 border-rose-100'
  if (type === '지원') return 'bg-teal-50 text-teal-600 border-teal-100'
  return 'bg-slate-50 text-slate-400 border-slate-100'
}

function getRiskLevel(score: number) {
  if (score >= 5) return { label: 'High', color: '#e11d48', bg: '#fff1f2' }
  if (score >= 2) return { label: 'Mid', color: '#d97706', bg: '#fffbeb' }
  return { label: 'Low', color: '#0d9488', bg: '#f0fdfa' }
}

const SAMPLE_COMPANIES = [
  { name: '삼성전자', ksic: '26111', desc: '반도체 제조' },
  { name: '카카오', ksic: '63120', desc: '포털·SNS' },
  { name: '현대자동차', ksic: '30100', desc: '자동차 제조' },
  { name: '셀트리온', ksic: '21201', desc: '의약품 제조' },
  { name: 'LG에너지솔루션', ksic: '27400', desc: '이차전지' },
]

export default function CompanyTab({ signals }: CompanyTabProps) {
  const [companyName, setCompanyName] = useState('')
  const [ksicInput, setKsicInput] = useState('')
  const [searched, setSearched] = useState<{ name: string; code3: string } | null>(null)
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [noSignal, setNoSignal] = useState(false)

  const loadBills = useCallback(async (code: string, p: number) => {
    setLoading(true)
    try {
      const { data } = await supabase.rpc('bills_by_ksic3', { p_code: code, p_offset: p * 50, p_limit: 50 })
      if (!data) return
      setBills(prev => p === 0 ? (data as Bill[]) : [...prev, ...(data as Bill[])])
      setHasMore((data as Bill[]).length === 50)
    } catch (e) {
      console.error('loadBills error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleSearch(name?: string, ksic?: string) {
    const n = (name ?? companyName).trim()
    const k = (ksic ?? ksicInput).trim()
    if (!k) return
    const code3 = k.slice(0, 3)
    const sig = signals.find(s => s.ksic_code === code3 && s.ksic_level === 3)
    setNoSignal(!sig)
    setSearched({ name: n || '(기업명 미입력)', code3 })
    setPage(0)
    setBills([])
    loadBills(code3, 0)
  }

  function fillSample(s: typeof SAMPLE_COMPANIES[0]) {
    setCompanyName(s.name)
    setKsicInput(s.ksic)
    handleSearch(s.name, s.ksic)
  }

  const signal = searched
    ? signals.find(s => s.ksic_code === searched.code3 && s.ksic_level === 3)
    : null

  const regData = signal ? [
    { name: '규제', value: signal.reg_count ?? 0, color: '#e11d48' },
    { name: '지원', value: signal.support_count ?? 0, color: '#0d9488' },
    { name: '중립', value: signal.neutral_count ?? 0, color: '#cbd5e1' },
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

  const risk = signal ? getRiskLevel(signal.risk_score ?? 0) : null

  return (
    <div className="space-y-6">
      {/* 검색 */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-[11px] text-slate-400 mb-3">기업명과 KSIC 코드를 입력하세요</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="기업명"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            className="flex-1 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
          <input
            type="text"
            placeholder="KSIC 코드"
            value={ksicInput}
            onChange={e => setKsicInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
          <button
            onClick={() => handleSearch()}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-slate-800 text-white hover:bg-slate-700 transition-colors"
          >
            조회
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SAMPLE_COMPANIES.map(s => (
            <button
              key={s.name}
              onClick={() => fillSample(s)}
              className="px-2.5 py-1 rounded-md text-[11px] text-slate-500 bg-slate-50 border border-slate-150 hover:bg-slate-100 transition-colors"
            >
              {s.name} <span className="text-slate-400">{s.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 결과 없음 */}
      {searched && noSignal && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500 text-sm">KSIC <span className="font-mono font-semibold">{searched.code3}</span>에 해당하는 데이터가 없습니다.</p>
          <p className="text-slate-400 text-xs mt-1">5자리 코드 입력 시 앞 3자리(중분류)로 매핑됩니다.</p>
        </div>
      )}

      {/* 결과 */}
      {searched && signal && (
        <>
          {/* 기업 요약 카드 */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* 상단 헤더 */}
            <div className="px-6 py-5 flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold text-slate-800">{searched.name}</p>
                <p className="text-sm text-slate-400 mt-0.5">
                  [{signal.ksic_code}] {getKsicName(signal.ksic_code)}
                </p>
              </div>
              {risk && (
                <div
                  className="px-4 py-2 rounded-lg text-sm font-bold border"
                  style={{ background: risk.bg, color: risk.color, borderColor: risk.color + '30' }}
                >
                  {risk.label} Risk
                </div>
              )}
            </div>

            {/* 지표 그리드 */}
            <div className="grid grid-cols-5 border-t border-slate-100">
              {[
                { label: '총 발의', value: signal.total_bills.toLocaleString() },
                { label: '가결', value: signal.passed_bills.toLocaleString() },
                { label: '가결률', value: (signal.pass_rate ?? 0).toFixed(1) + '%' },
                { label: '계류', value: signal.pending_bills.toLocaleString() },
                { label: 'risk_score', value: (signal.risk_score ?? 0).toFixed(1) },
              ].map((c, i) => (
                <div
                  key={c.label}
                  className={`px-4 py-3 text-center ${i < 4 ? 'border-r border-slate-100' : ''}`}
                >
                  <p className="text-[10px] text-slate-400 mb-0.5">{c.label}</p>
                  <p className="text-lg font-bold text-slate-700 tabular-nums">{c.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 차트 2-col */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 규제 유형 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">규제 유형 분포</h3>
              {regData.some(d => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={regData.filter(d => d.value > 0)}
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={80}
                      paddingAngle={2} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                      labelLine={{ stroke: '#cbd5e1' }}
                    >
                      {regData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                      formatter={(v: number) => [v.toLocaleString() + '건', '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">데이터 없음</div>
              )}
            </div>

            {/* 연도별 추이 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">연도별 발의 추이</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={yearData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                    formatter={(v: number) => [v + '건', '']}
                  />
                  <Bar dataKey="count" fill="#475569" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 법안 목록 */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">관련 법안</h3>
              <span className="text-[11px] text-slate-400">{bills.length}건</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['발의일', '법안명', '소관위원회', '처리결과', '유형'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b, i) => {
                    const passed = PASS_RESULTS.has(b.proc_result_cd ?? '')
                    return (
                      <tr key={b.bill_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap font-mono text-[11px]">{b.propose_dt?.slice(0, 10) ?? '-'}</td>
                        <td className="px-3 py-2 text-slate-700 max-w-xs truncate" title={b.bill_name}>{b.bill_name}</td>
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap max-w-[140px] truncate">{b.committee ?? '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={passed ? 'text-teal-600 font-medium' : 'text-slate-400'}>
                            {b.proc_result_cd ?? '계류 중'}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded border text-[11px] font-medium ${getBadgeStyle(b.regulation_type)}`}>
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
              <div className="px-5 py-3 text-center border-t border-slate-100">
                <button
                  onClick={() => { const next = page + 1; setPage(next); loadBills(searched.code3, next) }}
                  disabled={loading}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {loading ? '불러오는 중...' : '더 보기'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
