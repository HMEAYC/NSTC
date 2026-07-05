import smtplib
import logging
from email.mime.text import MIMEText
from app.config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> bool:
    logger.info(f"[EMAIL] To: {to} | Subject: {subject}")
    logger.info(f"[EMAIL] Body:\n{body}")

    if not settings.smtp_host:
        logger.info("[EMAIL] SMTP not configured — printed to log only")
        return True

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        logger.info(f"[EMAIL] Sent to {to}")
        return True
    except Exception as e:
        logger.error(f"[EMAIL] Failed to send to {to}: {e}")
        return False


def send_invite_email(email: str, invite_token: str, inviter_name: str, org_name: str) -> bool:
    link = f"{settings.app_base_url}/dashboard/accept-invite?token={invite_token}"
    subject = f"您已被邀請加入 {org_name} — HMEAYC"
    body = (
        f"您好，\n\n"
        f"您已被 {inviter_name} 邀請加入 {org_name} 的 HMEAYC 系統。\n\n"
        f"請點擊以下連結完成帳號設定：\n{link}\n\n"
        f"此連結僅限使用一次，請於 7 日內完成設定。\n\n"
        f"HMEAYC 團隊"
    )
    return send_email(email, subject, body)
