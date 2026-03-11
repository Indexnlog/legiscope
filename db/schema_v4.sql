-- 산업별 입법활성도 + 규제리스크 지표 테이블
-- processors/industry_signals.py 가 매주 upsert

create table if not exists industry_signals (
    ksic_code           text not null,          -- KSIC 코드 (1자리 or 3자리)
    ksic_level          int  not null,          -- 1=대분류, 3=중분류
    total_bills         int  default 0,         -- 총 발의 건수
    passed_bills        int  default 0,         -- 가결 건수 (원안+수정)
    processed_bills     int  default 0,         -- 처리 완료 건수 (가결+폐기+부결 등)
    pending_bills       int  default 0,         -- 계류 건수
    pass_rate           numeric(5,1) default 0, -- 가결률 (%)
    recent_90d_bills    int  default 0,         -- 최근 90일 발의 건수
    avg_days_to_pass    int,                    -- 평균 가결 소요일 (null=데이터 없음)
    reg_count           int  default 0,         -- 규제 법안 건수
    support_count       int  default 0,         -- 지원 법안 건수
    neutral_count       int  default 0,         -- 중립 법안 건수
    reg_ratio           numeric(5,1) default 0, -- 규제 비율 (%)
    reg_pass_rate       numeric(5,1) default 0, -- 규제 법안 가결률 (%)
    risk_score          numeric(8,1) default 0, -- 규제리스크 점수 (reg_count × reg_pass_rate / 100)
    updated_at          timestamp with time zone default now(),
    primary key (ksic_code, ksic_level)
);
