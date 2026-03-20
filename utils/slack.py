"""
Slack 알림 유틸리티 (입법 레이더용)
g2b-collector의 SlackNotifier 패턴 재사용
"""
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

SLACK_TOKEN = os.getenv("SLACK_TOKEN", "")
SLACK_CHANNEL_ID = os.getenv("SLACK_CHANNEL_ID", "C0A6FDJBFJ5")

# Slack mrkdwn / 알림용 (section text 상한에 맞춰 분할)
_MRDKWN_CHUNK = 2800


def _slack_escape_mrkdwn(s: str) -> str:
    """Slack mrkdwn에서 깨지기 쉬운 문자 이스케이프."""
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _fence_code(text: str) -> str:
    """코드 펜스 내부의 ``` 를 깨지 않게 처리."""
    body = text.replace("```", "`\u200b``")
    return f"```{body}```"


def _chunk_text(s: str, size: int) -> list[str]:
    if not s:
        return []
    return [s[i : i + size] for i in range(0, len(s), size)]


class SlackNotifier:
    def __init__(self):
        self.token = SLACK_TOKEN
        self.channel_id = SLACK_CHANNEL_ID
        self.client = None

        if self.token and not self.token.startswith("xoxb-여기에"):
            try:
                from slack_sdk import WebClient
                self.client = WebClient(token=self.token)
            except ImportError:
                print("[!] slack_sdk 미설치: pip install slack-sdk")
        else:
            print("[!] SLACK_TOKEN 미설정 → 콘솔 출력 모드로 실행")

    def is_enabled(self):
        return self.client is not None

    def send(self, text: str, blocks: list = None) -> bool:
        resp = self.post_message(text=text, blocks=blocks)
        return resp is not None

    def post_message(
        self,
        text: str,
        blocks: list | None = None,
        thread_ts: str | None = None,
    ):
        """chat.postMessage 호출. 성공 시 응답 dict, 실패/미설정 시 None."""
        if not self.is_enabled():
            print("=" * 60)
            print("[SLACK 미설정 - 콘솔 출력]")
            print(text)
            if blocks:
                print(f"[blocks: {len(blocks)}개]")
            print("=" * 60)
            return None

        try:
            from slack_sdk.errors import SlackApiError
            resp = self.client.chat_postMessage(
                channel=self.channel_id,
                text=text[:4000] if text else "Legiscope",
                blocks=blocks,
                thread_ts=thread_ts,
                unfurl_links=False,
                unfurl_media=False,
            )
            print(f"[OK] Slack 전송 완료 (ts: {resp.get('ts')})")
            return resp.data if hasattr(resp, "data") else resp
        except Exception as e:
            print(f"[X] Slack 전송 실패: {e}")
            return None


def send_weekly_brief(has_triggers: bool, trigger_summary: str, date_str: str) -> bool:
    """주간 트리거 브리프 — 헤더/컨텍스트 + 본문(코드 펜스) Block Kit."""
    notifier = SlackNotifier()

    status = "기사 소재 감지" if has_triggers else "이번 주 기사감 없음"
    emoji = "●" if has_triggers else "○"
    fallback = f"[{emoji}] 입법 레이더 주간 브리프 ({date_str}) — {status}"

    blocks: list[dict] = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "입법 레이더 주간 브리프", "emoji": True},
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"📅 *{date_str}* · {status}",
                }
            ],
        },
        {"type": "divider"},
    ]

    for chunk in _chunk_text(trigger_summary.strip(), _MRDKWN_CHUNK - 8):
        blocks.append(
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": _fence_code(chunk)},
            }
        )

    return notifier.send(fallback, blocks=blocks)


def send_daily_brief(
    brief_text: str,
    yesterday_str: str,
    *,
    has_triggers: bool,
    passed_count: int,
    proposed_count: int,
) -> bool:
    """일간 브리프 — 주간과 동일 패턴(헤더·컨텍스트·코드 펜스 본문)."""
    notifier = SlackNotifier()

    status = "기사 소재 감지" if has_triggers else "오늘 기사감 없음"
    emoji = "●" if has_triggers else "○"
    fallback = (
        f"[{emoji}] 입법 레이더 일간 ({yesterday_str}) — {status} "
        f"(가결 {passed_count} / 발의 {proposed_count})"
    )

    stat_line = f"어제 가결 *{passed_count}*건 · 발의 *{proposed_count}*건"
    blocks: list[dict] = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "입법 레이더 일간 브리프", "emoji": True},
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"📅 *기준일: {yesterday_str}* · {stat_line} · {status}",
                }
            ],
        },
        {"type": "divider"},
    ]

    body = (brief_text or "").strip()
    if body:
        for chunk in _chunk_text(body, _MRDKWN_CHUNK - 8):
            blocks.append(
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": _fence_code(chunk)},
                }
            )

    return notifier.send(fallback, blocks=blocks)


def send_article_draft(title: str, draft: str, date_str: str) -> bool:
    """기사 초안 — 헤더·제목은 mrkdwn, 본문은 코드 펜스(슬랙에서 ** 등 포맷 깨짐 방지). 길면 스레드 연속."""
    notifier = SlackNotifier()

    fallback = f"입법 레이더 기사 초안 ({date_str}) — {title}"
    title_esc = _slack_escape_mrkdwn(title)

    blocks: list[dict] = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "기사 초안", "emoji": True},
        },
        {
            "type": "context",
            "elements": [
                {"type": "mrkdwn", "text": f"📰 *{title_esc}* · `{date_str}`"},
            ],
        },
        {"type": "divider"},
    ]

    chunks = _chunk_text(draft.strip(), _MRDKWN_CHUNK - 8)
    if not chunks:
        chunks = ["(본문 없음)"]

    first_body = _fence_code(chunks[0])
    blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": first_body}})

    resp = notifier.post_message(text=fallback, blocks=blocks)
    if resp is None and not notifier.is_enabled():
        return False
    if resp is None:
        return False

    thread_ts = resp.get("ts")
    for extra in chunks[1:]:
        body = _fence_code(extra)
        notifier.post_message(
            text=f"(계속) {title[:80]}",
            blocks=[
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": body},
                }
            ],
            thread_ts=thread_ts,
        )

    return True


def send_monthly_report(report_text: str, date_str: str) -> bool:
    """월간 리포트 슬랙 전송"""
    notifier = SlackNotifier()
    fallback = f"입법 레이더 월간 리포트 ({date_str})"

    blocks: list[dict] = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "입법 레이더 월간 리포트", "emoji": True},
        },
        {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": f"📅 *{date_str}*"}],
        },
        {"type": "divider"},
    ]
    for chunk in _chunk_text(report_text.strip(), _MRDKWN_CHUNK - 8):
        blocks.append(
            {"type": "section", "text": {"type": "mrkdwn", "text": _fence_code(chunk)}}
        )

    return notifier.send(fallback, blocks=blocks)
