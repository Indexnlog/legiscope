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
                print("⚠ slack_sdk 미설치: pip install slack-sdk")
        else:
            print("⚠ SLACK_TOKEN 미설정 → 콘솔 출력 모드로 실행")

    def is_enabled(self):
        return self.client is not None

    def send(self, text: str, blocks: list = None) -> bool:
        if not self.is_enabled():
            print("=" * 60)
            print("[SLACK 미설정 - 콘솔 출력]")
            print(text)
            print("=" * 60)
            return False

        try:
            from slack_sdk.errors import SlackApiError
            resp = self.client.chat_postMessage(
                channel=self.channel_id,
                text=text,
                blocks=blocks,
                unfurl_links=False,
                unfurl_media=False,
            )
            print(f"✅ Slack 전송 완료 (ts: {resp.get('ts')})")
            return True
        except Exception as e:
            print(f"❌ Slack 전송 실패: {e}")
            return False


def send_weekly_brief(has_triggers: bool, trigger_summary: str, date_str: str) -> bool:
    """주간 트리거 브리프 슬랙 전송"""
    notifier = SlackNotifier()

    if has_triggers:
        header = f"🔴 *입법 레이더 주간 브리프* ({date_str}) — 기사 소재 감지"
    else:
        header = f"⚪ *입법 레이더 주간 브리프* ({date_str}) — 이번 주 기사감 없음"

    text = f"{header}\n\n```{trigger_summary}```"
    return notifier.send(text)


def send_article_draft(title: str, draft: str, date_str: str) -> bool:
    """기사 초안 슬랙 전송 (Claude API 생성 시)"""
    notifier = SlackNotifier()

    # 슬랙 메시지 길이 제한
    preview = draft[:800] + "\n...(전체 초안은 Obsidian 참조)" if len(draft) > 800 else draft

    text = (
        f"📰 *입법 레이더 기사 초안 생성* ({date_str})\n"
        f"*{title}*\n\n"
        f"```{preview}```"
    )
    return notifier.send(text)


def send_monthly_report(report_text: str, date_str: str) -> bool:
    """월간 리포트 슬랙 전송"""
    notifier = SlackNotifier()
    text = f"📊 *입법 레이더 월간 리포트* ({date_str})\n\n```{report_text[:1500]}```"
    return notifier.send(text)
