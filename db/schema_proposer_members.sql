-- Supabase SQL Editor에서 실행 후 collectors/backfill_proposer_members.py 로 기존 행 채우기
-- 발의자 문자열에서 뽑은 의원 실명 JSON 배열 (기사 화이트리스트·검증용)

alter table bills
  add column if not exists proposer_members jsonb default '[]'::jsonb;

comment on column bills.proposer_members is '의원 실명 목록 (OpenAPI PROPOSER/RST_PROPOSER 파싱, collectors/bills + backfill)';
