-- ─────────────────────────────────────────────────────────────────
-- schema_v3.sql  — 규제/지원 분류 + 지표 컬럼 추가
-- Supabase SQL Editor에서 실행
-- ─────────────────────────────────────────────────────────────────

-- bills 테이블에 규제/지원 분류 컬럼 추가
alter table bills add column if not exists regulation_type text;  -- '규제' | '지원' | '중립'

-- 인덱스 (빠른 집계용)
create index if not exists idx_bills_regulation_type on bills(regulation_type);
create index if not exists idx_bills_propose_dt      on bills(propose_dt);
create index if not exists idx_bills_committee        on bills(committee);
