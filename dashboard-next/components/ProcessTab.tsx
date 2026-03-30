'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

interface ProcessTabProps {
  stats: {
    bills: number
    committee_reviewed: number
    passed: number
    promulgated: number
    pending: number
    regulation: number
    support: number
    neutral: number
  }
}

const FLOW_COLORS = {
  active: { bg: '#1e293b', text: '#ffffff' },
  inactive: { bg: '#f8fafc', text: '#94a3b8', border: '#e2e8f0' },
}

function fmt(n: number) { return n > 0 ? `${n.toLocaleString()}건` : null }

function buildFlowSteps(stats: ProcessTabProps['stats']) {
  return [
    { label: '정부·의원 입법예고', hasData: true, count: null as string | null, note: '정부입법지원센터' },
    { label: '법률안 발의', hasData: true, count: fmt(stats.bills), note: '국회 OpenAPI' },
    { label: '소관 상임위 접수', hasData: false, count: null, note: undefined },
    { label: '상임위 법안심사소위', hasData: false, count: null, note: undefined },
    { label: '상임위 전체회의', hasData: true, count: fmt(stats.committee_reviewed), note: '국회 OpenAPI' },
    { label: '법제사법위원회', hasData: false, count: null, note: undefined },
    { label: '본회의 심의·의결', hasData: true, count: fmt(stats.passed), note: '국회 OpenAPI' },
    { label: '정부 이송', hasData: false, count: null, note: undefined },
    { label: '대통령 공포', hasData: true, count: fmt(stats.promulgated), note: '법제처 DRF' },
  ]
}

export default function ProcessTab({ stats }: ProcessTabProps) {
  const FLOW_STEPS = buildFlowSteps(stats)
  const passRate = stats.bills > 0 ? ((stats.passed / stats.bills) * 100).toFixed(1) : '0'

  const funnelData = [
    { name: '발의', value: stats.bills, color: '#3b82f6' },
    { name: '상임위 심사', value: stats.committee_reviewed, color: '#6366f1' },
    { name: '본회의 가결', value: stats.passed, color: '#10b981' },
    { name: '공포', value: stats.promulgated, color: '#0ea5e9' },
  ]

  const regData = [
    { name: '규제', value: stats.regulation, color: '#ef4444' },
    { name: '지원', value: stats.support, color: '#22c55e' },
    { name: '중립', value: stats.neutral, color: '#94a3b8' },
  ]

  return (
    <div className="space-y-6">
      {/* KPI 카드 — 핵심 숫자만 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: '총 발의', value: stats.bills, color: '#3b82f6' },
          { label: '상임위 심사', value: stats.committee_reviewed, color: '#6366f1' },
          { label: '본회의 가결', value: stats.passed, color: '#10b981' },
          { label: '공포', value: stats.promulgated, color: '#0ea5e9' },
          { label: '계류 중', value: stats.pending, color: '#f59e0b' },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] text-slate-400 mb-1">{c.label}</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: c.color }}>
              {c.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* 차트 2-col */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 퍼널 바 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">입법 단계별 법안 수</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={funnelData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => v.toLocaleString()} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#475569', fontSize: 12 }} width={80} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                formatter={(v: number) => [v.toLocaleString() + '건', '']}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {funnelData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 규제 유형 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">
            규제 유형 분포
            <span className="ml-2 text-xs font-normal text-slate-400">(전체 발의 기준)</span>
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={regData}
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
              <Legend wrapperStyle={{ color: '#64748b', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-center text-[11px] text-slate-400">가결률 {passRate}%</p>
        </div>
      </div>

      {/* 입법 절차 스텝퍼 */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-slate-700">입법 절차 흐름</h3>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-800" /> 수집
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-200" /> 미수집
            </span>
          </div>
        </div>

        <div className="flex items-start justify-between overflow-x-auto gap-0.5 pb-2">
          {FLOW_STEPS.map((step, i) => (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center min-w-[72px]">
                <div
                  className="px-2 py-2 rounded-lg text-[11px] font-medium text-center leading-tight w-full"
                  style={step.hasData
                    ? { background: FLOW_COLORS.active.bg, color: FLOW_COLORS.active.text }
                    : { background: FLOW_COLORS.inactive.bg, color: FLOW_COLORS.inactive.text, border: `1px solid ${FLOW_COLORS.inactive.border}` }
                  }
                >
                  {step.label}
                </div>
                {step.count && (
                  <span className="text-[10px] font-semibold text-blue-600 mt-1">{step.count}</span>
                )}
                {step.note && (
                  <span className="text-[9px] text-slate-400 mt-0.5">{step.note}</span>
                )}
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <span className="text-slate-300 text-[10px] mx-0.5 flex-shrink-0">→</span>
              )}
            </div>
          ))}
        </div>

        <p className="text-[11px] text-slate-400 mt-3 text-center">
          평균 발의→가결: 약 250~350일 · 상당수 법안은 임기 만료 시 자동 폐기
        </p>
      </div>

      {/* 용어 설명 — 접기 가능 */}
      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="px-5 py-3 text-sm font-semibold text-slate-700 cursor-pointer select-none hover:bg-slate-50 transition-colors">
          주요 용어 설명
        </summary>
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { term: '입법예고', def: '법안 발의 전 국민의 의견을 수렴하는 절차. 공표 후 20일 이상 의견 접수.' },
            { term: '소관 상임위', def: '법안의 내용과 관련된 분야를 담당하는 위원회.' },
            { term: '규제 법안', def: '기업이나 개인의 행위를 제한·금지하는 내용을 담은 법안.' },
            { term: '지원 법안', def: '보조금, 세제 혜택, 규제 완화 등 사업 활동을 장려하는 법안.' },
            { term: '원안가결', def: '발의 내용 그대로 통과. 수정안반영폐기/대안반영폐기는 내용이 다른 법안에 흡수된 것.' },
            { term: 'KSIC', def: '한국표준산업분류. 산업을 체계적으로 분류한 코드 체계.' },
            { term: 'risk_score', def: '규제 법안 수 x 규제법안 가결률 / 100. 높을수록 규제 통과 빈도 높음.' },
          ].map(item => (
            <div key={item.term} className="rounded-lg p-3 bg-slate-50 border border-slate-100">
              <span className="text-sm font-semibold text-blue-600">{item.term}</span>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.def}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
