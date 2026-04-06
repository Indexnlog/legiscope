import type { Bill } from '@/lib/types'

export function downloadBillsCsv(bills: Bill[], filename: string = 'legiscope_bills.csv') {
  const headers = ['발의일', '법안명', '소관위원회', '처리결과', '규제유형']
  const rows = bills.map(b => [
    b.propose_dt?.slice(0, 10) ?? '',
    `"${(b.bill_name ?? '').replace(/"/g, '""')}"`,
    b.committee ?? '',
    b.proc_result_cd ?? '계류 중',
    b.regulation_type ?? '미분류',
  ])

  const bom = '\uFEFF'
  const csv = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
