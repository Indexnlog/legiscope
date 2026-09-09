-- schema_v5: 법안 → 구조화 노출 (노출 엔진 v1, 2026-09-07 설계)
-- 출처: research/exposure_v1/extract_exposure.py 출력(JSON). 법안 1건 → bill_exposure 1행 + bill_exposure_targets N행.
-- 적용은 Supabase SQL Editor에서 수동 (anon key로는 DDL 불가).

create table if not exists bill_exposure (
  bill_id        text primary key references bills(bill_id) on delete cascade,
  nature         text not null check (nature in ('규제신설강화','규제완화','지원혜택','절차행정','조직예산','중립기타')),
  all_industry   boolean not null default false,
  summary        text,
  stage_hint     text,
  model          text not null,          -- 예: claude-opus-5
  prompt_version text not null,          -- 예: v1.0
  extracted_at   timestamptz not null default now(),
  in_tok int, out_tok int, cache_read int
);

create table if not exists bill_exposure_targets (
  id             bigserial primary key,
  bill_id        text not null references bill_exposure(bill_id) on delete cascade,
  seq            smallint not null,
  label          text not null,
  ksic5          text[] not null default '{}',
  role           text not null check (role in ('규제대상','수혜대상','간접영향')),
  direction      text not null check (direction in ('부담','수혜','혼합')),
  path           text not null check (path in ('고지보고기록','안전품질보안','가격수수료거래','허가시장접근','데이터이용','지원세제조달','고객대응수요','공급망경쟁')),
  condition      text,
  intensity_m    smallint not null check (intensity_m between 1 and 5),
  confidence     text not null check (confidence in ('high','medium','low')),
  human_ok       boolean,                -- 사람 검수 결과 (null = 미검수)
  unique (bill_id, seq)
);
create index if not exists bill_exposure_targets_ksic5_gin on bill_exposure_targets using gin (ksic5);
create index if not exists bill_exposure_targets_direction on bill_exposure_targets (direction, intensity_m);

-- KSIC5 × 방향 집계 뷰 (industry_signals v2의 원형): 법안 단계·통과확률은 bills와 조인해 계산
create or replace view v_industry_exposure as
select
  k.ksic5,
  t.direction,
  count(distinct t.bill_id)                                        as bills,
  count(distinct t.bill_id) filter (where b.proc_result_cd in ('원안가결','수정가결')) as enacted,
  avg(t.intensity_m)                                               as avg_m,
  sum(case when t.confidence = 'high' then 1 else 0 end)           as high_conf
from bill_exposure_targets t
cross join lateral unnest(t.ksic5) as k(ksic5)
join bills b on b.bill_id = t.bill_id
group by k.ksic5, t.direction;
