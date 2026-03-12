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

또는 아래 배치 파일(run_weekly.bat)을 작업 스케줄러에 등록하세요.
"""

import os
import subprocess
import time
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).parent
LOG_DIR = BASE / "output" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

STEPS = [
    ("발의 수집",     ["python", "-m", "collectors.bills"]),
    ("상임위 보강",   ["python", "-m", "collectors.committee"]),
    ("입법예고",      ["python", "-m", "collectors.pre_announcements"]),
    ("행정입법예고",  ["python", "-m", "collectors.admin_laws"]),
    ("정책브리핑",    ["python", "-m", "collectors.policy_briefs"]),
    ("공포법령",      ["python", "-m", "collectors.promulgations"]),
    ("KSIC 태깅",     ["python", "-m", "mapper.apply_ksic"]),
    ("규제분류",      ["python", "-m", "mapper.regulation_type", "--apply"]),
    ("공포법령 규제분류", ["python", "-m", "mapper.regulation_type", "--apply-promulgations"]),
    ("산업별 지표",   ["python", "-m", "processors.industry_signals"]),
    ("CSV 내보내기",  ["python", "export_csv.py"]),
    ("주간 기사 브리프", ["python", "article_weekly.py", "--slack", "--draft"]),
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
                timeout=600,
                env={**os.environ, "PYTHONPATH": str(BASE)},
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
