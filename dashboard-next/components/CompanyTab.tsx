'use client'

import { useState, useCallback } from 'react'
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
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
  if (!type) return { bg: '#f1f5f9', text: '#94a3b8' }
  if (type === '규제') return { bg: '#fee2e2', text: '#dc2626' }
  if (type === '지원') return { bg: '#dcfce7', text: '#16a34a' }
  return { bg: '#f1f5f9', text: '#64748b' }
}

function getRiskBadge(score: number) {
  if (score >= 5) return { label: 'High 🔴', bg: '#fee2e2', text: '#dc2626' }
  if (score >= 2) return { label: 'Mid 🟡', bg: '#fef9c3', text: '#b45309' }
  return { label: 'Low 🟢', bg: '#dcfce7', text: '#15803d' }
}

// 샘플 기업 예시 (입력 도우미용)
const SAMPLE_COMPANIES = [
  { name: '삼성전자', ksic: '26111', desc: '반도체 제조' },
  { name: '카카오', ksic: '63120', desc: '포털·SNS' },
  { name: '현대자동차', ksic: '30100', desc: '자동차 제조' },
  { name: '셀트리온', ksic: '21201', desc: '의약품 제조' },
  { name: 'LG에너지솔루션', ksic: '27400', desc: '이차전지·전기장치' },
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

  const riskBadge = signal ? getRiskBadge(signal.risk_score ?? 0) : null

  return (
    <div className="space-y-6">
      {/* 검색 폼 */}
      <div className="rounded-xl p-5 bg-white" className="border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">🏢 기업 산업 조회</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="기업명 (예: 삼성전자)"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            className="flex-1 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
            className="border border-slate-200"
          />
          <input
            type="text"
            placeholder="KSIC 코드 (예: 26111)"
            value={ksicInput}
            onChange={e => setKsicInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white font-mono"
            className="border border-slate-200"
          />
          <button
            onClick={() => handleSearch()}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#2563eb' }}
          >
            조회
          </button>
        </div>

        {/* 샘플 기업 */}
        <div className="mt-3">
          <p className="text-xs text-slate-400 mb-2">샘플 기업으로 바로 보기:</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_COMPANIES.map(s => (
              <button
                key={s.name}
                onClick={() => fillSample(s)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}
              >
                {s.name} <span className="text-slate-400">({s.desc})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 결과 없음 */}
      {searched && noSignal && (
        <div className="rounded-xl p-5 text-center bg-white" className="border border-slate-200">
          <p className="text-slate-500 text-sm">KSIC <span className="font-mono font-semibold">{searched.code3}</span>에 해당하는 산업 데이터가 없습니다.</p>
          <p className="text-slate-400 text-xs mt-1">5자리 코드를 입력하면 앞 3자리로 자동 매핑됩니다.</p>
        </div>
      )}

      {/* 결과 */}
      {searched && signal && (
        <>
          {/* 기업·산업 헤더 */}
          <div className="rounded-xl p-5 bg-white" className="border border-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-xs text-slate-400">기업</p>
                <p className="text-lg font-bold text-slate-800">{searched.name}</p>
              </div>
              <div className="text-slate-200 text-xl">|</div>
              <div>
                <p className="text-xs text-slate-400">산업 (KSIC 중분류)</p>
                <p className="text-base font-semibold text-slate-700">
                  [{signal.ksic_code}] {getKsicName(signal.ksic_code)}
                </p>
              </div>
              {riskBadge && (
                <span
                  className="ml-auto px-3 py-1 rounded-full text-sm font-bold"
                  style={{ background: riskBadge.bg, color: riskBadge.text }}
                >
                  규제리스크 {riskBadge.label}
                </span>
              )}
            </div>
          </div>

          {/* 지표 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: '총 발의', value: signal.total_bills.toLocaleString(), color: '#3b82f6' },
              { label: '본회의 가결', value: signal.passed_bills.toLocaleString(), color: '#22c55e' },
              { label: '가결률', value: (signal.pass_rate ?? 0).toFixed(1) + '%', color: '#10b981' },
              { label: '계류 중', value: signal.pending_bills.toLocaleString(), color: '#f59e0b' },
              { label: 'risk_score', value: (signal.risk_score ?? 0).toFixed(2), color: '#ef4444' },
            ].map(c => (
              <div key={c.label} className="rounded-xl p-4 text-center bg-white" className="border border-slate-200">
                <div className="text-xs text-slate-500 mb-1">{c.label}</div>
                <div className="text-xl font-bold" style={{ color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 규제 유형 파이 */}
            <div className="rounded-xl p-5 bg-white" className="border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">🏷️ 규제 유형 분포</h3>
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
                      contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                      formatter={(v: number) => [v.toLocaleString() + '건', '']}
                    />
                    <Legend wrapperStyle={{ color: '#64748b', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">데이터 없음</div>
              )}
            </div>

            {/* 연도별 추이 */}
            <div className="rounded-xl p-5 bg-white" className="border border-slate-200">
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

          {/* 법안 목록 */}
          <div className="rounded-xl overflow-hidden bg-white" className="border border-slate-200">
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
                  onClick={() => { const next = page + 1; setPage(next); loadBills(searched.code3, next) }}
                  disabled={loading}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium"
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
