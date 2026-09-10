"""제안이유 백필 루프 — Supabase 1,000행 응답 상한 때문에 bill_enricher를 반복 실행.
기존 enricher 프로세스가 끝날 때까지 기다린 뒤 시작. 남은 건수 0이면 종료."""
import subprocess, sys, time, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PY = sys.executable
def enricher_running():
    out = subprocess.run(["tasklist", "/v", "/fo", "csv"], capture_output=True, text=True).stdout
    return "bill_enricher" in out or _wmic()
def _wmic():
    # 2026-09-10: wmic은 Windows 11에서 제거됨(FileNotFoundError로 루프가 시작도 못 했음) → CIM으로 대체
    cmd = "Get-CimInstance Win32_Process -Filter \"name like 'python%'\" | Select-Object -ExpandProperty CommandLine"
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, text=True, timeout=30).stdout
    except Exception:
        return False
    return "bill_enricher" in (out or "")
while _wmic():
    time.sleep(30)
from db.client import get_client
for i in range(15):
    n = None
    for attempt in range(3):  # 2026-09-10: Supabase가 라운드 사이 count에서 일시 500을 내 루프가 죽었음 → 재시도, 계속 실패하면 한 라운드 더 돈다
        try:
            n = get_client().table("bills").select("bill_id", count="exact", head=True).is_("proposal_reason", "null").eq("age", "22").execute().count
            break
        except Exception as e:
            print(f"[round {i+1}] count 실패({attempt+1}/3): {str(e)[:80]}", flush=True); time.sleep(20)
    if n is None:
        n = 1
    print(f"[round {i+1}] remaining {n}", flush=True)
    if n == 0:
        break
    subprocess.run([PY, "-m", "collectors.bill_enricher", "--limit", "1000"], env={**os.environ, "PYTHONPATH": os.getcwd(), "PYTHONIOENCODING": "utf-8"})
print("backfill loop done", flush=True)
