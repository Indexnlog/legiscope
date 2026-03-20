# NEWS EPOCH × Legiscope — 데이터 원천

NEWS EPOCH 기사(슬랙·Obsidian 초안·최종稿)는 **이 레포의 수집·API·DB 파이프라인이 만든 데이터**만 사실 근거로 삼는다.

- **허용되는 근거:** `collectors/` → Supabase(또는 export)·`mapper/`·`processors/`·`export_csv.py` 등 **코드로 재현 가능한 경로**의 출력. 주간 트리거 초안은 당시 넘기는 **SOURCE_FACTS(의안·위원회·제안이유 등 질의 결과)** 안의 문자열만 팩트로 취급한다.
- **금지:** LLM이 상식·학습 데이터로 **새로 만든** 기관명·통계·국제 맥락·의원·법안 내용. 필요하면 파이프라인에 필드를 추가하거나 취재로 보강한 뒤 반영한다.

편집 지침 원문은 Obsidian **`NEWS EPOCH 작성 지침.md`** §0을 따른다. Legiscope 코드 쪽 강제는 `article_weekly.py`의 `_LEGISCOPE_FACT_SYSTEM`·`SOURCE_FACTS` 래핑·사후 마커 검사로 보조한다.
