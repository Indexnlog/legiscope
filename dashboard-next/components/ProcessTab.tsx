'use client'

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
  active: { bg: '#3b82f6', text: '#ffffff' },
  inactive: { bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb' },
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

  return (
    <div className="space-y-6">
      {/* KPI 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: '총 발의', value: stats.bills, color: 'text-blue-600' },
          { label: '상임위 통과', value: stats.committee_reviewed, color: 'text-slate-600' },
          { label: '본회의 가결', value: stats.passed, color: 'text-green-600' },
          { label: '공포', value: stats.promulgated, color: 'text-slate-600' },
          { label: '계류중', value: stats.pending, color: 'text-amber-600' },
        ].map(item => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">{item.label}</p>
            <p className={`text-2xl font-bold ${item.color}`}>{item.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* 입법 절차 흐름도 */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">대한민국 입법 절차</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              22대 국회 기준 · 발의부터 공포까지 9단계
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" /> 수집
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-200" /> 미수집
            </span>
          </div>
        </div>

        <div className="grid grid-cols-9 gap-1 pb-2">
          {FLOW_STEPS.map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center">
              <div
                className="w-full px-1.5 py-2.5 rounded-lg text-[10px] font-medium leading-tight"
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
                <span className="text-[8px] text-slate-400 mt-0.5">{step.note}</span>
              )}
            </div>
          ))}
        </div>

        <p className="text-[11px] text-slate-400 mt-3 text-center">
          평균 발의→가결: 약 250~350일 · 상당수 법안은 임기 만료 시 자동 폐기
        </p>
      </div>

      {/* 용어 설명 */}
      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="px-5 py-3 text-sm font-semibold text-slate-900 cursor-pointer select-none hover:bg-slate-50 transition-colors">
          주요 용어 설명
        </summary>
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100">
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
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{item.def}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
