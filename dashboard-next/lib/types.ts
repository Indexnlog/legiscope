export interface IndustrySignal {
  ksic_code: string
  ksic_level: number
  total_bills: number
  passed_bills: number
  processed_bills: number
  pending_bills: number
  pass_rate: number
  recent_90d_bills: number
  avg_days_to_pass: number | null
  reg_count: number
  support_count: number
  neutral_count: number
  reg_ratio: number
  reg_pass_rate: number
  risk_score: number
  as_of_date?: string
}

export interface Bill {
  bill_id: string
  bill_name: string
  committee: string | null
  propose_dt: string | null
  proc_result_cd: string | null
  proc_dt: string | null
  committee_result: string | null
  committee_dt: string | null
  regulation_type: string | null
  ksic_codes: string[] | null
}

export interface FunnelStats {
  pre_announcements: number
  bills: number
  committee_reviewed: number
  passed: number
  promulgated: number
}
