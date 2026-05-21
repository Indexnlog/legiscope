from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_ANON_KEY

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return _client


def health_check(notify_on_fail: bool = True) -> bool:
    """Supabase 응답 가능 여부 확인. 실패 시 슬랙 알림 후 False 반환.

    pdeck-data Supabase 무료 플랜은 약 1주일 inactivity 후 pause되며,
    paused 상태에서는 호스트 DNS 자체가 사라져 `getaddrinfo failed`로 끊긴다.
    파이프라인 시작 시 한 번 호출해두면 다음번에 또 한 달간 모르고 흘리는 일을 막을 수 있다.
    """
    try:
        get_client().table("bills").select("bill_id").limit(1).execute()
        return True
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
        print(f"[Legiscope] Supabase 헬스체크 실패 — {err}")
        if notify_on_fail:
            try:
                from utils.slack import SlackNotifier
                SlackNotifier().send(
                    ":rotating_light: *Legiscope: Supabase 접근 불가*\n"
                    f"`{SUPABASE_URL}` 응답 안 함. 프로젝트 일시정지/삭제 여부를 supabase.com 대시보드에서 확인하세요.\n"
                    f"오류: `{err[:300]}`"
                )
            except Exception as se:
                print(f"[Legiscope] 슬랙 알림도 실패: {se}")
        return False
