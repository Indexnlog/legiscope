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

const STAGE_COLORS = ['#6366f1', '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b']

const STAGES = [
  { label: '법률안 발의', key: 'bills', icon: '📝', desc: '의원 또는 정부가 법안을 제출하는 단계' },
  { label: '상임위 심사', key: 'committee_reviewed', icon: '🔍', desc: '소관 상임위원회에서 심도 있게 검토' },
  { label: '본회의 가결', key: 'passed', icon: '✅', desc: '전체 의원이 참여하는 본회의에서 의결' },
  { label: '공포', key: 'promulgated', icon: '📜', desc: '대통령이 서명하여 법률로 확정' },
  { label: '계류 중', key: 'pending', icon: '⏳', desc: '아직 처리되지 않고 심사 중인 법안' },
]

// 입법 절차 흐름 — Legiscope 데이터 수집 여부 표시
const FLOW_STEPS = [
  { label: '정부·의원\n입법예고', hasData: true, count: '229건', note: '정부입법지원센터' },
  { label: '법률안\n발의', hasData: true, count: '42,736건', note: '국회 OpenAPI' },
  { label: '소관\n상임위 접수', hasData: false },
  { label: '상임위\n법안심사소위', hasData: false },
  { label: '상임위\n전체회의', hasData: true, count: '11,774건', note: '국회 OpenAPI' },
  { label: '법제사법\n위원회', hasData: false },
  { label: '본회의\n심의·의결', hasData: true, count: '4,058건 가결', note: '국회 OpenAPI' },
  { label: '정부\n이송', hasData: false },
  { label: '대통령\n공포', hasData: true, count: '6,640건', note: '법제처 DRF' },
]

const TERM_GLOSSARY = [
  { term: '입법예고', def: '법안을 발의하기 전에 국민의 의견을 수렴하는 절차. 공표 후 20일 이상 의견 접수.' },
  { term: '소관 상임위', def: '법안의 내용과 관련된 분야를 담당하는 위원회. 예) 산업통상자원중소벤처기업위원회' },
  { term: '규제 법안', def: '기업이나 개인의 행위를 제한·금지하는 내용을 담은 법안.' },
  { term: '지원 법안', def: '보조금, 세제 혜택, 규제 완화 등 사업 활동을 장려하는 내용을 담은 법안.' },
  { term: '원안가결', def: '발의된 내용 그대로 통과. 수정안반영폐기/대안반영폐기는 내용이 다른 법안에 흡수된 것.' },
  { term: 'KSIC', def: '한국표준산업분류(Korean Standard Industrial Classification). 산업을 체계적으로 분류한 코드 체계.' },
  { term: 'risk_score', def: '규제 법안 수 × 규제법안 가결률 / 100. 높을수록 규제가 실제 통과된 빈도가 높음.' },
]

export default function ProcessTab({ stats }: ProcessTabProps) {
  const funnelData = [
    { name: '발의', value: stats.bills },
    { name: '상임위 심사', value: stats.committee_reviewed },
    { name: '본회의 가결', value: stats.passed },
    { name: '공포', value: stats.promulgated },
  ]

  const regData = [
    { name: '규제', value: stats.regulation, color: '#ef4444' },
    { name: '지원', value: stats.support, color: '#22c55e' },
    { name: '중립', value: stats.neutral, color: '#94a3b8' },
  ]

  const passRate = stats.bills > 0 ? ((stats.passed / stats.bills) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-8">
      {/* 핵심 수치 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {STAGES.map((s, i) => (
          <div key={s.key} className="rounded-xl p-4 text-center bg-white" style={{ border: '1px solid #e2e8f0' }}>
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-xs text-slate-500 mb-1 leading-tight font-medium">{s.label}</div>
            <div className="text-2xl font-bold" style={{ color: STAGE_COLORS[i] }}>
              {(stats[s.key as keyof typeof stats] ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-1 leading-snug">{s.desc}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 단계별 법안 수 막대 */}
        <div className="rounded-xl p-5 bg-white" style={{ border: '1px solid #e2e8f0' }}>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">📊 입법 단계별 법안 수</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnelData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => v.toLocaleString()} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} width={70} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                labelStyle={{ color: '#0f172a' }}
                formatter={(v: number) => [v.toLocaleString() + '건', '']}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {funnelData.map((_, i) => (
                  <Cell key={i} fill={STAGE_COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 규제 유형 파이 — 라벨 잘림 방지: cy 높이고 outerRadius 줄임 */}
        <div className="rounded-xl p-5 bg-white" style={{ border: '1px solid #e2e8f0' }}>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            🏷️ 규제 유형 분포
            <span className="ml-2 text-xs font-normal text-slate-400">(전체 발의 기준)</span>
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={regData}
                cx="50%"
                cy="52%"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                labelLine={{ stroke: '#cbd5e1' }}
              >
                {regData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                formatter={(v: number) => [v.toLocaleString() + '건', '']}
              />
              <Legend wrapperStyle={{ color: '#64748b', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-center text-xs text-slate-400 -mt-1">가결률 {passRate}% (발의 대비)</p>
        </div>
      </div>

      {/* 입법 절차 흐름도 — 데이터 수집 범위 표시 */}
      <div className="rounded-xl p-5 bg-white" style={{ border: '1px solid #e2e8f0' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">🗺️ 입법 절차 흐름</h3>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#1B2745' }} />
              Legiscope 수집
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-gray-100 border border-gray-200" />
              미수집
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-center gap-1.5">
          {FLOW_STEPS.map((step, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="flex flex-col items-center">
                <span
                  className="px-2.5 py-2 rounded-lg text-xs font-medium text-center leading-snug whitespace-pre-line"
                  style={step.hasData
                    ? { background: '#1B2745', color: '#ffffff', minWidth: 68 }
                    : { background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0', minWidth: 68 }
                  }
                >
                  {step.label}
                </span>
                {step.hasData && step.count && (
                  <span className="text-[10px] mt-1 font-semibold" style={{ color: '#2563eb' }}>
                    {step.count}
                  </span>
                )}
                {step.hasData && step.note && (
                  <span className="text-[9px] text-gray-400 mt-0.5">{step.note}</span>
                )}
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <span className="text-slate-300 text-xs mt-2">→</span>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400 mt-4 text-center">
          * 평균 발의→가결 소요기간: 약 250~350일 / 상당수 법안은 임기 만료 시 자동 폐기
        </p>
      </div>

      {/* 용어 사전 */}
      <div className="rounded-xl p-5 bg-white" style={{ border: '1px solid #e2e8f0' }}>
        <h3 className="text-sm font-semibold text-slate-700 mb-4">📖 주요 용어 설명</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TERM_GLOSSARY.map((item) => (
            <div key={item.term} className="rounded-lg p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span className="text-blue-600 font-semibold text-sm">{item.term}</span>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.def}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
