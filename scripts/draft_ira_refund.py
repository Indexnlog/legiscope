"""단독 톱 초안: 고동진안 — 국가전략기술 세액공제 현금환급/제3자 양도 (IRA식)"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

from article_weekly import generate_article_draft, save_to_obsidian, build_weekly_trigger_whitelist
from db.client import get_client

sb = get_client()

# 고동진안 본문 — 법안명·일자·대표발의자로 정확히 매칭
main = (sb.table("bills")
    .select("bill_id,bill_no,bill_name,propose_dt,rst_proposer,proposer,proposer_kind,committee,proposal_reason")
    .ilike("bill_name", "%조세특례제한법%")
    .eq("propose_dt", "2026-05-06")
    .eq("rst_proposer", "고동진")
    .limit(1).execute())
m = main.data[0]
print(f"[메인] {m['propose_dt']} {m['rst_proposer']} {m['bill_name']} (bill_no {m['bill_no']})")

# 같은 5/4 주(5/4~5/10) 조세특례 10건 — 컨텍스트
ctx = (sb.table("bills")
    .select("bill_id,bill_no,bill_name,propose_dt,rst_proposer,proposer,committee,proposal_reason")
    .ilike("bill_name", "%조세특례제한법%")
    .gte("propose_dt", "2026-05-04").lte("propose_dt", "2026-05-10")
    .order("propose_dt").execute())

# SOURCE_FACTS 텍스트 빌드 — 메인을 헤더에, 컨텍스트는 분포로
key_data = (
    f"[단독 보도] 조세특례제한법 일부개정법률안 — 국가전략기술 세액공제 직접 현금 환급·제3자 양도 신설\n"
    f"[집계] 2026-05-04~2026-05-10 한 주간 「조세특례제한법 일부개정법률안」 {len(ctx.data)}건이 재정경제기획위원회 소관으로 발의됐다. "
    f"이 중 본 보도가 다루는 안건은 2026-05-06 고동진의원 등이 발의한 1건이다.\n\n"
    f"[메인 법안]\n"
    f"- {m['bill_name']} ({m['propose_dt']}, 대표발의 {m['rst_proposer']}, {m['proposer_kind']})\n"
    f"  소관위원회: {m['committee']}\n"
    f"  의안번호: {m['bill_no']}\n"
    f"  제안이유 (원문): {m['proposal_reason'].strip()}\n\n"
    f"[같은 주 발의된 「조세특례제한법 일부개정법률안」 분포 — 시즌 컨텍스트]\n"
)
for b in ctx.data:
    key_data += f"- {b['propose_dt']} {b['rst_proposer']} ({b['committee']}) bill_no {b['bill_no']}\n"

print("\n=== SOURCE_FACTS preview ===")
print(key_data[:1500])
print("...")
print()

# 화이트리스트: 본문에 등장한 이름·기관만 허용
wl = build_weekly_trigger_whitelist(ctx.data, {r["bill_id"]: r for r in ctx.data})

print("초안 생성 중...")
draft = generate_article_draft(key_data, "단일 법안 단독 보도", name_whitelist=wl)
print("\n" + "="*78)
print(draft)
print("="*78)
save_to_obsidian("국가전략기술 현금환급 단독", draft)
