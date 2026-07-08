"""
주간 자동 수집 스크립트
매주 실행: 발의 → 상임위 → 입법예고 → 행정예고 → 정책브리핑 → 공포법령 → KSIC 태깅 → 규제분류 → 산업별 지표 → CSV 내보내기

Windows 작업 스케줄러 등록 방법:
  1. 시작 → 작업 스케줄러 검색 → 실행
  2. 작업 만들기
     - 이름: LegiscopeWeekly
     - 트리거: 매주 금요일 오전 7:00
     - 동작: 프로그램/스크립트 → python
             인수: C:/Users/ekapr/legiscope/run_weekly.py
             시작 위치: C:/Users/ekapr/legiscope
  3. 저장

또는 관리자 PowerShell에서:
  schtasks /create /tn "LegiscopeWeekly" /tr "C:/Users/ekapr/Documents/GitHub/legiscope/run_weekly.bat" /sc weekly /d FRI /st 07:00 /rl HIGHEST

또는 아래 배치 파일(run_weekly.bat)을 작업 스케줄러에 등록하세요.
"""

import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# Windows 콘솔(cp949)에서 유니코드 문자(em dash 등)가 깨지지 않도록
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = Path(__file__).parent
LOG_DIR = BASE / "output" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

STEPS = [
    ("발의 수집",     ["python", "-m", "collectors.bills"]),
    ("상임위 보강",   ["python", "-m", "collectors.committee"]),
    ("입법예고",      ["python", "-m", "collectors.pre_announcements"]),
    ("행정입법예고",  ["python", "-m", "collectors.admin_laws"]),
    # 정책브리핑(collectors.policy_briefs) 폐기 — 2026-07-08.
    # korea.kr RSS 전 엔드포인트 404(사실상 서비스 폐지), moef/mss도 HTML 반환.
    # policy_briefs 테이블은 하류 소비자 0 (5/25 수집 중단을 6주간 아무도 인지 못함).
    # 기존 203건은 테이블에 보존. 필요 기사가 생기면 그때 구체 용도 갖고 재구축.
    ("공포법령",      ["python", "-m", "collectors.promulgations"]),
    ("KSIC 태깅",     ["python", "-m", "mapper.apply_ksic"]),
    ("규제분류",      ["python", "-m", "mapper.regulation_type", "--apply"]),
    ("공포법령 규제분류", ["python", "-m", "mapper.regulation_type", "--apply-promulgations"]),
    ("산업별 지표",   ["python", "-m", "processors.industry_signals"]),
    ("CSV 내보내기",  ["python", "export_csv.py"]),
    ("법안 제안이유 보강", ["python", "-m", "collectors.bill_enricher", "--limit", "100"]),
    ("주간 기사 브리프", ["python", "article_weekly.py"]),
]


def run():
    now = datetime.now()
    log_path = LOG_DIR / f"{now.strftime('%Y-%m-%d')}.log"

    def log(msg: str):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}"
        print(line)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")

    log(f"=== Legiscope 주간 수집 시작 ({now.strftime('%Y-%m-%d %H:%M')}) ===")

    from db.client import health_check
    log("--- Supabase 헬스체크 ---")
    if not health_check(notify_on_fail=True):
        log("[중단] Supabase 접근 불가 — 슬랙 알림 발송됨. 전체 단계 스킵.")
        return
    log("  OK")

    ok_count = 0

    for name, cmd in STEPS:
        log(f"\n--- {name} ---")
        try:
            result = subprocess.run(
                cmd,
                cwd=str(BASE),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=600,
                env={
                    **os.environ,
                    "PYTHONPATH": str(BASE),
                    # Windows: 파이프 캡처 시 콘솔 cp949로 이모지/UTF-8 출력이 깨지지 않게
                    "PYTHONIOENCODING": "utf-8",
                },
            )
            if result.stdout:
                for line in result.stdout.strip().splitlines():
                    log(f"  {line}")
            if result.returncode != 0:
                log(f"  [오류] returncode={result.returncode}")
                if result.stderr:
                    for line in result.stderr.strip().splitlines()[:5]:
                        log(f"  STDERR: {line}")
            else:
                log(f"  완료")
                ok_count += 1
        except subprocess.TimeoutExpired:
            log(f"  [타임아웃] 10분 초과")
        except Exception as e:
            log(f"  [예외] {e}")

        time.sleep(1)

    log(f"\n=== 완료 ({ok_count}/{len(STEPS)}단계 성공) → 로그: {log_path} ===")


if __name__ == "__main__":
    run()
