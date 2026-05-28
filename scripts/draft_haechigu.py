"""단독 시리즈: 조지연 — 생활화학제품·살생물제 안전관리법 5/13~5/15 3건"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

from article_weekly import generate_article_draft, save_to_obsidian, build_weekly_trigger_whitelist
from db.client import get_client

sb = get_client()

# 조지연 3건
res = (sb.table("bills")
    .select("bill_id,bill_no,bill_name,propose_dt,rst_proposer,proposer,proposer_kind,committee,proposal_reason")
    .ilike("bill_name", "%생활화학제품 및 살생물제%")
    .gte("propose_dt", "2026-05-11").lte("propose_dt", "2026-05-17")
    .order("propose_dt").execute())
bills = res.data or []
print(f"수집: {len(bills)}건")
for b in bills:
    print(f"  {b['propose_dt']} {b['rst_proposer']} bill_no {b['bill_no']}")

key_data = (
    f"[단독 시리즈] 「생활화학제품 및 살생물제의 안전관리에 관한 법률 일부개정법률안」 "
    f"한 의원 단독 시리즈 발의 {len(bills)}건\n"
    f"[집계] 2026-05-13 ~ 2026-05-15 3일 사이, 동일 대표발의자가 같은 법의 일부개정법률안 3건을 "
    f"기후에너지환경노동위원회 소관으로 잇따라 발의했다.\n\n"
    f"[발의된 법안]\n"
)
for b in bills:
    reason = (b.get("proposal_reason") or "").strip()
    key_data += (
        f"- {b['bill_name']} ({b['propose_dt']}, 대표발의 {b['rst_proposer']}, {b['proposer_kind']})\n"
        f"  소관위원회: {b['committee']}\n"
        f"  의안번호: {b['bill_no']}\n"
        f"  제안이유 (원문): {reason}\n\n"
    )

print("\n=== SOURCE_FACTS preview ===")
print(key_data[:1200])
print("...")
print()

wl = build_weekly_trigger_whitelist(bills, {r["bill_id"]: r for r in bills})

print("초안 생성 중...")
draft = generate_article_draft(key_data, "단일 의원 시리즈 발의", name_whitelist=wl)
print("\n" + "="*78)
print(draft)
print("="*78)
save_to_obsidian("생활화학제품 단독 자동v2", draft)
