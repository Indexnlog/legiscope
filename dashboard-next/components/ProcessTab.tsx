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
  { label: '상임위 심사', key: 'committee_reviewed', icon: '🔍', desc: '소관 상임위원회에서 법안을 심도 있게 검토' },
  { label: '본회의 가결', key: 'passed', icon: '✅', desc: '전체 의원이 참여하는 본회의에서 의결' },
  { label: '공포', key: 'promulgated', icon: '📜', desc: '대통령이 서명하여 법률로 확정' },
  { label: '계류 중', key: 'pending', icon: '⏳', desc: '아직 처리되지 않고 심사 중인 법안' },
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
            <div className="text-xs text-slate-500 mb-1 leading-tight">{s.label}</div>
            <div className="text-2xl font-bold" style={{ color: STAGE_COLORS[i] }}>
              {(stats[s.key as keyof typeof stats] ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-1 leading-tight">{s.desc.slice(0, 18)}…</div>
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

        {/* 규제 유형 파이 */}
        <div className="rounded-xl p-5 bg-white" style={{ border: '1px solid #e2e8f0' }}>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            🏷️ 규제 유형 분포
            <span className="ml-2 text-xs font-normal text-slate-400">(전체 발의 기준)</span>
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={regData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
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
          <p className="text-center text-xs text-slate-400 mt-1">가결률 {passRate}% (발의 대비)</p>
        </div>
      </div>

      {/* 입법 절차 흐름도 */}
      <div className="rounded-xl p-5 bg-white" style={{ border: '1px solid #e2e8f0' }}>
        <h3 className="text-sm font-semibold text-slate-700 mb-4">🗺️ 입법 절차 흐름</h3>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          {[
            '정부·의원 입법예고',
            '법률안 발의',
            '소관 상임위 접수',
            '상임위 법안심사소위',
            '상임위 전체회의',
            '법제사법위원회',
            '본회의 심의·의결',
            '정부 이송',
            '대통령 공포',
          ].map((step, i, arr) => (
            <span key={i} className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                {step}
              </span>
              {i < arr.length - 1 && <span className="text-slate-300">→</span>}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3 text-center">
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
