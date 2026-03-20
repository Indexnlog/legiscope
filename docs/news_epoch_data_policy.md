# NEWS EPOCH × Legiscope — 데이터 원천

NEWS EPOCH 기사(슬랙·Obsidian 초안·최종稿)는 **이 레포의 수집·API·DB 파이프라인이 만든 데이터**만 사실 근거로 삼는다.

- **허용되는 근거:** `collectors/` → Supabase(또는 export)·`mapper/`·`processors/`·`export_csv.py` 등 **코드로 재현 가능한 경로**의 출력. 주간 트리거 초안은 당시 넘기는 **SOURCE_FACTS(의안·위원회·제안이유 등 질의 결과)** 안의 문자열만 팩트로 취급한다.
- **금지:** LLM이 상식·학습 데이터로 **새로 만든** 기관명·통계·국제 맥락·의원·법안 내용. 필요하면 파이프라인에 필드를 추가하거나 취재로 보강한 뒤 반영한다.

**팩트 우선(편집·송고):** 본문은 DB·SOURCE_FACTS에 대응하는 문장(일자, 건수, 표기, 제안이유 인용 범위)을 먼저 채운 뒤, 해석은 그 안에서만 짧게 덧붙인다. 숫자·이름이 맞아도 「시사한다」「형국이다」 등 **근거 없이 분위기만 올리는 문장**은 기사의 팩트 가치를 깎는다. 팩트만으로도 읽히면 평가 문장은 생략한다.

편집 지침 원문은 Obsidian **`NEWS EPOCH 작성 지침.md`** §0을 따른다. Legiscope 코드 쪽 강제는 `article_weekly.py`의 `_LEGISCOPE_FACT_SYSTEM`·`SOURCE_FACTS` 래핑·사후 마커 검사로 보조한다.

추가로 주간 트리거 초안은 **트리거에 쓴 법안 행·DB 발의자·위원회**로 만든 **화이트리스트**와 대조해, 초안에 나온 `○○의원`·「법안명」·`…전자/…증권` 등이 데이터 밖이면 `[Legiscope 자동 검사]`에 경고를 붙인다(자동 삭제는 하지 않음).

의원 실명은 `bills.proposer_members`(JSON 배열)에 모은다. `collectors/bills.py`가 수집 시 채우고, 기존 DB는 `db/schema_proposer_members.sql` 적용 후 `python -m collectors.backfill_proposer_members` 로 일괄 반영한다. 파싱 규칙은 `utils/proposer_members.py`의 `extract_member_names`를 본다.
