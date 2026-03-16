"""
regulation_type 분류 룰 검증 스크립트

DB에서 법안 샘플링 → Claude API로 정답 레이블 생성 → 현행 classify()와 비교
결과: 오분류 패턴 파악 후 REGULATION/SUPPORT 키워드 개선

실행:
    PYTHONPATH=. python mapper/validate_regulation_type.py
"""

import sys, io, random, json
sys.path.insert(0, '.')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from db.client import get_client
from mapper.regulation_type import classify
import anthropic
import os
from dotenv import load_dotenv
load_dotenv()


# ── 설정 ───────────────────────────────────────────────────────────────
SAMPLE_PER_TYPE = 15   # 규제/지원/중립 각 15건 = 총 45건
MODEL = "claude-haiku-4-5-20251001"  # 검증용 — Haiku로 비용 절감


SYSTEM_PROMPT = """당신은 한국 국회 입법 전문가입니다.
법안명만 보고 해당 법안이 기업 활동에 미치는 영향을 분류하세요.

분류 기준:
- 규제: 기업에 금지·제한·처벌·의무 부과 등 부담을 주는 법안
- 지원: 기업에 보조금·세제혜택·규제완화·인프라 지원 등 혜택을 주는 법안
- 중립: 조직법·절차법·정의변경 등 기업 부담/혜택이 불분명한 법안

응답 형식 (JSON only):
{"result": "규제" | "지원" | "중립", "reason": "한 줄 이유"}"""


def get_claude_label(bill_names: list[str]) -> list[dict]:
    """Claude API로 법안 목록 일괄 분류"""
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    prompt_lines = "\n".join(
        f"{i+1}. {name}" for i, name in enumerate(bill_names)
    )

    message = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": (
                f"다음 법안들을 각각 분류하세요. 순서대로 JSON 배열로 응답하세요.\n\n"
                f"{prompt_lines}\n\n"
                f"응답: [{{'result': '...', 'reason': '...'}}] 형식의 JSON 배열"
            )
        }]
    )

    text = message.content[0].text.strip()
    # JSON 추출
    start = text.find('[')
    end = text.rfind(']') + 1
    if start == -1:
        return []
    return json.loads(text[start:end])


def main():
    db = get_client()

    # 현행 분류 기준으로 각 타입에서 샘플링
    print("샘플 수집 중...")
    samples = []

    for reg_type in ["규제", "지원", "중립"]:
        # 여러 페이지에서 랜덤 샘플링
        r = db.table("bills").select("bill_id, bill_name, regulation_type") \
            .eq("regulation_type", reg_type) \
            .range(0, 999).execute()
        rows = r.data
        if len(rows) > SAMPLE_PER_TYPE:
            rows = random.sample(rows, SAMPLE_PER_TYPE)
        samples.extend(rows)

    print(f"총 {len(samples)}건 샘플 → Claude 검증 시작")
    print()

    # Claude 분류 (10건씩 배치)
    all_names = [s["bill_name"] for s in samples]
    claude_results = []

    BATCH = 10
    for i in range(0, len(all_names), BATCH):
        batch = all_names[i:i+BATCH]
        results = get_claude_label(batch)
        claude_results.extend(results)
        print(f"  배치 {i//BATCH + 1} 완료 ({i+len(batch)}/{len(all_names)}건)")

    print()

    # 비교 분석
    match = 0
    mismatch_details = []

    for i, (sample, claude) in enumerate(zip(samples, claude_results)):
        current = sample["regulation_type"]  # 현행 DB 값
        new_classify = classify(sample["bill_name"])  # 수정된 룰 적용
        claude_label = claude.get("result", "중립")

        # 수정된 classify vs Claude 비교
        ok = (new_classify == claude_label)
        if ok:
            match += 1
        else:
            mismatch_details.append({
                "name": sample["bill_name"],
                "db_current": current,
                "new_rule": new_classify,
                "claude": claude_label,
                "reason": claude.get("reason", "")
            })

    total = len(samples)
    accuracy = match / total * 100
    print(f"=== 검증 결과 (수정된 룰 vs Claude) ===")
    print(f"일치: {match}/{total} ({accuracy:.1f}%)")
    print()

    if mismatch_details:
        print(f"=== 불일치 {len(mismatch_details)}건 ===")
        for d in mismatch_details:
            print(f"  [룰:{d['new_rule']} | Claude:{d['claude']}] {d['name'][:55]}")
            print(f"    → Claude 이유: {d['reason']}")
            print()

    # 타입별 정확도
    from collections import defaultdict
    by_claude = defaultdict(lambda: {"correct": 0, "total": 0})
    for i, (sample, claude) in enumerate(zip(samples, claude_results)):
        new_classify = classify(sample["bill_name"])
        claude_label = claude.get("result", "중립")
        by_claude[claude_label]["total"] += 1
        if new_classify == claude_label:
            by_claude[claude_label]["correct"] += 1

    print("=== 타입별 정확도 ===")
    for t in ["규제", "지원", "중립"]:
        d = by_claude[t]
        if d["total"] > 0:
            print(f"  {t}: {d['correct']}/{d['total']} ({d['correct']/d['total']*100:.0f}%)")


if __name__ == "__main__":
    main()
