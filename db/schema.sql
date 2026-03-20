-- Supabase SQL Editor에 붙여넣고 실행하세요

create table if not exists bills (
    bill_id         text primary key,
    bill_no         text,
    bill_name       text,
    proposer         text,
    rst_proposer     text,
    proposer_kind    text,
    proposer_members jsonb default '[]'::jsonb,  -- 의원 실명 배열 (schema_proposer_members.sql)
    committee       text,
    propose_dt      text,
    pass_gubun      text,
    proc_result_cd  text,
    age             text,
    link_url        text,
    created_at      timestamp with time zone default now()
);
