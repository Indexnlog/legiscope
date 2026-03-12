-- Supabase SQL Editor에서 실행하세요
-- DrilldownTab: 3자리 KSIC 코드로 법안 조회 (5자리 코드 prefix 매칭)
-- bills.ksic_codes는 5자리 코드 ["58221", "62010"] 형태
-- industry_signals.ksic_code는 3자리 prefix "582" 형태 → 정확한 contains() 불가

CREATE OR REPLACE FUNCTION bills_by_ksic3(
  p_code   text,
  p_offset int DEFAULT 0,
  p_limit  int DEFAULT 50
)
RETURNS TABLE (
  bill_id         text,
  bill_name       text,
  committee       text,
  propose_dt      text,
  proc_result_cd  text,
  regulation_type text,
  ksic_codes      text[]
)
LANGUAGE sql STABLE
AS $$
  SELECT
    bill_id,
    bill_name,
    committee,
    propose_dt,
    proc_result_cd,
    regulation_type,
    ksic_codes
  FROM bills
  WHERE EXISTS (
    SELECT 1 FROM unnest(ksic_codes) AS k
    WHERE k LIKE p_code || '%'
  )
  ORDER BY propose_dt DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;
