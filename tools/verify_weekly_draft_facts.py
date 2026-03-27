"""One-off: 공직선거법 주간 클러스터 초안 vs 파이프라인 데이터 대조."""
from __future__ import annotations

import csv
import sys
from collections import defaultdict
from datetime import date, timedelta

sys.path.insert(0, ".")
from article_weekly import (  # noqa: E402
    EXCLUDE_KSIC_PREFIX,
    TODAY,
    MONTH_AGO,
    build_weekly_trigger_whitelist,
    industry_name,
    _apply_draft_fact_guard,
    _scan_draft_for_external_markers,
)
from db.client import get_client  # noqa: E402

# 사용자가 붙여 넣은 초안 (검사용)
DRAFT = r"""
**[Legiscope] 공직선거법 개정안 18건 집중 발의, 교사·공무원 정치활동 범위 재조명**

2026년 3월 한 달간 「공직선거법 일부개정법률안」이 총 18건 집중 발의되며 관련 법제도 변화에 대한 입법부의 관심이 집중되고 있다. 이는 교사와 공무원의 정치활동 범위와 헌법상 기본권 제약에 대한 논의를 재점화하는 움직임으로, 관련 이해관계자들의 법적 지위에 영향을 미칠 수 있다. 다수의 개정안 발의는 현행법의 개선 필요성에 대한 공감대가 형성되고 있음을 시사한다.

## 공직선거법 개정안 18건, 3월에 집중 발의

Legiscope·국회 의안정보시스템에 따르면, 2026년 3월에만 「공직선거법 일부개정법률안」이 18건 발의됐다. 이 중 이용우의원 등 11인이 2026년 3월 4일 발의한 법안을 포함해 김문수의원 등 10인, 이춘석의원 등 10인, 서지영의원 등 19인, 김희정의원 등 10인, 권칠승의원 등 13인, 배준영의원 등 11인, 임종득의원 등 10인이 각각 개정안을 제출했다. 이들 법안은 행정안전위원회와 정치개혁특별위원회 등 소관 위원회에 회부됐다.

## 교사·공무원 정치활동 범위 재검토 요구

집중 발의된 개정안 중 이용우의원 등 11인이 발의한 「공직선거법 일부개정법률안」의 제안이유는 현행법이 교사와 공무원의 정치활동 및 단체행동을 포괄적으로 금지하여 헌법상 기본권을 지나치게 제약한다는 비판을 명시했다. 제안이유는 OECD 가입국가 대부분이 하위직 공무원의 정당 가입 등 정치활동을 금지하지 않으며, 공무원이 지위를 이용해 선거 과정에 개입하는 행위만을 금지한다고 지적했다. 또한 국제노동기구(ILO)가 우리 정부에 교사나 공무원의 정치활동 금지 제도 개선을 거듭 요구해왔다고 밝혔다. 다만, 다른 다수 개정안의 제안이유는 현재 미수집 상태다.

이처럼 「공직선거법 일부개정법률안」에 대한 집중적인 입법 활동은 교사와 공무원의 정치적 기본권 보장과 관련한 현행 제도의 변화 가능성을 높이고 있다. 2026년 3월에만 18건의 개정안이 발의된 것은 해당 이슈에 대한 국회의 높은 관심과 제도 개선 의지를 반영한다.

이 기사는 News Epoch가 구축한 입법 추적 엔진 Legiscope를 기반으로 작성했습니다.
"""


def load_bills():
    with open("output/bills_by_ksic.csv", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def trigger_cluster(bills):
    recent = [
        b
        for b in bills
        if b.get("propose_dt", "") >= str(MONTH_AGO)
        and b["ksic_code"][:3] not in EXCLUDE_KSIC_PREFIX
    ]
    seen_id = set()
    deduped = []
    for b in recent:
        if b["bill_id"] not in seen_id:
            seen_id.add(b["bill_id"])
            deduped.append(b)
    cluster = defaultdict(list)
    for b in deduped:
        key = b["bill_name"][:15].strip()
        cluster[key].append(b)
    hits = {k: v for k, v in cluster.items() if len(v) >= 3}
    return dict(sorted(hits.items(), key=lambda x: len(x[1]), reverse=True))


def main():
    print(f"TODAY={TODAY} MONTH_AGO={MONTH_AGO}")
    bills = load_bills()
    clusters = trigger_cluster(bills)
    first_key = next(iter(clusters))
    first_group = clusters[first_key]
    print(f"\n[클러스터 키] {first_key!r}  전체 {len(first_group)}건 (30일 창)")

    march = "2026-03"
    march_bills = [b for b in first_group if (b.get("propose_dt") or "").startswith(march)]
    print(f"[2026-03 발의만] {len(march_bills)}건 (초안 '3월에만 18건'과 비교)")

    db = get_client()
    ids = [b["bill_id"] for b in first_group if b.get("bill_id")]
    rows = (
        db.table("bills")
        .select(
            "bill_id,bill_name,propose_dt,proposer,rst_proposer,committee,proposal_reason"
        )
        .in_("bill_id", ids)
        .execute()
        .data
        or []
    )
    by_id = {r["bill_id"]: r for r in rows}

    slice_bills = list(first_group[:8])
    first_key15 = first_key[:15]
    ind = industry_name(first_group[0]["ksic_code"])
    key_data = f"[{ind}] '{first_key15}…' 관련 법안 {len(first_group)}건 집중 발의\n"
    for b in slice_bills:
        detail = by_id.get(b.get("bill_id"), {})
        reason = detail.get("proposal_reason") or ""
        reason_summary = reason[:300].replace("\n", " ") if reason else "제안이유 미수집"
        committee = detail.get("committee") or b.get("committee", "")
        key_data += (
            f"- {b['bill_name']} ({b['propose_dt']}, {detail.get('proposer', '')})\n"
            f"  소관위원회: {committee}\n"
            f"  제안이유: {reason_summary}\n"
        )

    name_wl = build_weekly_trigger_whitelist(slice_bills, by_id if by_id else None)
    guarded = _apply_draft_fact_guard(DRAFT.strip(), key_data, name_whitelist=name_wl)

    print("\n[SOURCE_FACTS 요약 — 초안에 쓰인 key_data 앞 1200자]")
    print(key_data[:1200])
    if len(key_data) > 1200:
        print("...")

    ext = _scan_draft_for_external_markers(DRAFT.strip(), key_data)
    print("\n[외부 마커 — key_data에 없는 것]", ext or "(없음)")

    print("\n[자동 검사 결과 — 초안 끝]")
    if "[Legiscope 자동 검사]" in guarded:
        print(guarded[guarded.index("[Legiscope 자동 검사]") :])
    else:
        print("(경고 블록 없음 — 마커/화이트리스트 통과)")

    # OECD/ILO: 제안이유에 실제 포함되는지
    print("\n[제안이유에 OECD 또는 국제노동기구/ILO 포함 여부 — 클러스터 전체]")
    for b in first_group[:20]:
        d = by_id.get(b.get("bill_id"), {})
        pr = (d.get("proposal_reason") or "")[:800]
        has_oecd = "OECD" in pr or "oecd" in pr.lower()
        has_ilo = "ILO" in pr or "국제노동기구" in pr
        if has_oecd or has_ilo:
            print(f"  bill_id={b.get('bill_id')} propose={b.get('propose_dt')} OECD={has_oecd} ILO/국제노동기구={has_ilo}")

    # 의원명이 proposer에 있는지 샘플
    names = ["이용우", "김문수", "이춘석", "서지영", "김희정", "권칠승", "배준영", "임종득"]
    print("\n[초안에 나온 대표발의 표기 vs DB proposer/rst (클러스터 내 일치 검색)]")
    text_blob = " ".join(
        (by_id.get(b["bill_id"], {}).get("proposer") or "")
        + " "
        + (by_id.get(b["bill_id"], {}).get("rst_proposer") or "")
        for b in first_group
        if b.get("bill_id")
    )
    for n in names:
        print(f"  {n}: {'있음' if n in text_blob else '없음'}")

    print("\n[송고 판단 요약]")
    issues = []
    if len(march_bills) != 18:
        issues.append(f"3월 발의 건수: DB+CSV 기준 {len(march_bills)}건, 초안은 18건")
    if "국회 의안정보시스템" in DRAFT and "의안정보" not in key_data.casefold():
        issues.append("출처에 '국회 의안정보시스템' — SOURCE_FACTS(키 데이터)에 없음")
    if ext:
        issues.append(f"외부 마커가 SOURCE_FACTS에 없음: {ext}")
    if "[Legiscope 자동 검사]" in guarded:
        issues.append("초안 끝에 Legiscope 자동 검사 경고 있음 — 원문 확인")
    if issues:
        for i in issues:
            print(f"  - {i}")
        print("\n=> 자동 검증만 보면 '그대로 송고'는 비추. 인용·건수·출처 정리 후 편집 권고.")
    else:
        print("  - 건수·마커 이슈 없음(스크립트 기준). 그래도 해석 문장은 편집 판단.")


if __name__ == "__main__":
    main()
