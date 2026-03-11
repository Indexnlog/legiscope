-- ③ 상임위 심사 정보 (bills 테이블에 컬럼 추가)
alter table bills add column if not exists committee_result   text;  -- 심사결과
alter table bills add column if not exists committee_dt       text;  -- 심사일
alter table bills add column if not exists proc_dt            text;  -- 최종처리일

-- ① 입법예고 테이블
create table if not exists pre_announcements (
    id              text primary key,
    law_name        text,
    ministry        text,
    law_field       text,
    announce_start  text,
    announce_end    text,
    source_type     text,   -- '부처입법예고' | '행정예고' | '지방입법예고'
    link_url        text,
    ksic_codes      text[],
    created_at      timestamp with time zone default now()
);

-- ⑥ 시행령·시행규칙 테이블
create table if not exists admin_laws (
    id              text primary key,
    law_name        text,
    law_type        text,   -- '시행령' | '시행규칙' | '고시' | '훈령'
    ministry        text,
    announce_start  text,
    announce_end    text,
    link_url        text,
    ksic_codes      text[],
    created_at      timestamp with time zone default now()
);

-- ⑦ 정책브리핑 테이블
create table if not exists policy_briefs (
    id              text primary key,    -- RSS guid 또는 link 해시
    title           text,
    ministry        text,
    summary         text,
    pub_date        text,
    link_url        text,
    ksic_codes      text[],
    created_at      timestamp with time zone default now()
);

-- ⑤ 공포 법령 테이블
create table if not exists promulgations (
    id              text primary key,   -- 공포번호
    law_name        text,
    promulgate_no   text,               -- 공포번호
    promulgate_dt   text,               -- 공포일
    enforce_dt      text,               -- 시행일
    ministry        text,
    bill_id         text,               -- bills.bill_id 연결
    ksic_codes      text[],
    created_at      timestamp with time zone default now()
);
