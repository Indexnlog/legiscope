-- schema_v6 (2026-09-10): 판정 품질 열 + 카드 노출 뷰. Supabase SQL Editor에서 적용 완료.
-- qc_flags: research/exposure_v1/qc_rules.py 결과(1층 규칙 검사, ''=미검출)
-- review_status: 사람 검수(구글 시트) → unreviewed / ok / x / unsure
alter table bill_exposure
  add column if not exists qc_flags text not null default '',
  add column if not exists review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed','ok','x','unsure'));

-- 카드가 읽는 뷰: 1층 미검출 + 사람 X 아님 + confidence medium 이상
create or replace view v_bill_exposure_card as
select e.bill_id, e.nature, e.all_industry, e.summary, e.stage_hint, e.prompt_version,
       t.seq, t.label, t.ksic5, t.role, t.direction, t.path, t.condition, t.intensity_m, t.confidence
from bill_exposure e
join bill_exposure_targets t on t.bill_id = e.bill_id
where e.qc_flags = ''
  and e.review_status <> 'x'
  and t.confidence in ('high','medium');

grant select on v_bill_exposure_card to anon, authenticated;
