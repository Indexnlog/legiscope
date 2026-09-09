"""제안이유 백필 루프 — Supabase 1,000행 응답 상한 때문에 bill_enricher를 반복 실행.
기존 enricher 프로세스가 끝날 때까지 기다린 뒤 시작. 남은 건수 0이면 종료."""
import subprocess, sys, time, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PY = sys.executable
def enricher_running():
    out = subprocess.run(["tasklist", "/v", "/fo", "csv"], capture_output=True, text=True).stdout
    return "bill_enricher" in out or _wmic()
def _wmic():
    out = subprocess.run(["wmic", "process", "where", "name like 'python%'", "get", "CommandLine"], capture_output=True, text=True).stdout
    return "bill_enricher" in out
while _wmic():
    time.sleep(30)
from db.client import get_client
for i in range(15):
    n = get_client().table("bills").select("bill_id", count="exact", head=True).is_("proposal_reason", "null").eq("age", "22").execute().count
    print(f"[round {i+1}] remaining {n}", flush=True)
    if n == 0:
        break
    subprocess.run([PY, "-m", "collectors.bill_enricher", "--limit", "1000"], env={**os.environ, "PYTHONPATH": os.getcwd(), "PYTHONIOENCODING": "utf-8"})
print("backfill loop done", flush=True)
