"""
gmail_watcher.py — Gmail polling watcher (Silver-tier Python bridge).

Polls Gmail for unread important messages and creates .md task files
in the vault /Inbox for the TypeScript pipeline to process.

Prerequisites:
    pip install google-auth google-auth-oauthlib google-api-python-client

Setup:
    1. Enable Gmail API in Google Cloud Console
    2. Download credentials.json to this folder
    3. Run once interactively to generate token.json
    4. Set GMAIL_CREDENTIALS_PATH and GMAIL_TOKEN_PATH in .env

Usage:
    python gmail_watcher.py [--vault PATH] [--credentials PATH] [--token PATH] [--dry-run]
"""

import os
import argparse
from pathlib import Path
from datetime import datetime

from base_watcher import BaseWatcher

# Lazy import — only required at runtime if this watcher is actually used
try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    GMAIL_AVAILABLE = True
except ImportError:
    GMAIL_AVAILABLE = False

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"


class GmailWatcher(BaseWatcher):
    """
    Polls Gmail API for unread important emails.

    Each matching email becomes a .md task file in /Inbox.
    The TypeScript AgentSkill (e.g. DraftEmailSkill) then handles the reply.
    """

    def __init__(self, vault_path: str, credentials_path: str, token_path: str, check_interval: int = 120):
        if not GMAIL_AVAILABLE:
            raise ImportError(
                "Google API client not installed. Run:\n"
                "  pip install google-auth google-auth-oauthlib google-api-python-client"
            )
        super().__init__(vault_path, check_interval)
        self.credentials_path = Path(credentials_path)
        self.token_path = Path(token_path)
        self._processed_ids: set[str] = set()
        self._service = self._build_service()

    def _build_service(self):
        """Authenticate and return a Gmail API service object."""
        creds = None
        if self.token_path.exists():
            creds = Credentials.from_authorized_user_file(str(self.token_path), SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(str(self.credentials_path), SCOPES)
                creds = flow.run_local_server(port=0)
            self.token_path.write_text(creds.to_json())
        return build("gmail", "v1", credentials=creds)

    def check_for_updates(self) -> list:
        """Return unread important messages not yet processed."""
        result = self._service.users().messages().list(
            userId="me", q="is:unread is:important"
        ).execute()
        messages = result.get("messages", [])
        return [m for m in messages if m["id"] not in self._processed_ids]

    def create_action_file(self, message: dict) -> Path:
        """Write email metadata to /Inbox as a structured .md task."""
        msg = self._service.users().messages().get(
            userId="me", id=message["id"], format="metadata",
            metadataHeaders=["From", "Subject", "Date"]
        ).execute()

        headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}
        ts = datetime.now().strftime("%Y%m%dT%H%M%S")
        dest = self.inbox / f"EMAIL_{ts}_{message['id']}.md"

        content = f"""---
type: email
source: python/gmail_watcher
message_id: {message["id"]}
from: "{headers.get('From', 'Unknown')}"
subject: "{headers.get('Subject', 'No Subject')}"
date: "{headers.get('Date', '')}"
received: {datetime.now().isoformat()}
priority: high
status: pending
---

## Email Received

**From:** {headers.get('From', 'Unknown')}
**Subject:** {headers.get('Subject', 'No Subject')}
**Date:** {headers.get('Date', '')}

**Snippet:**
{msg.get('snippet', '')}

## Suggested Actions
- [ ] Draft reply using DraftEmailSkill
- [ ] Route to SendEmailSkill after approval
- [ ] Archive after processing
"""

        if DRY_RUN:
            self.logger.info(f"[DRY RUN] Would create: {dest.name}")
        else:
            dest.write_text(content, encoding="utf-8")

        self._processed_ids.add(message["id"])
        return dest


def _parse_args():
    parser = argparse.ArgumentParser(description="AI Employee — Gmail Watcher (Python bridge)")
    parser.add_argument("--vault", default=os.getenv("VAULT_PATH", str(Path(__file__).parent.parent)))
    parser.add_argument("--credentials", default=os.getenv("GMAIL_CREDENTIALS_PATH", str(Path(__file__).parent / "credentials.json")))
    parser.add_argument("--token", default=os.getenv("GMAIL_TOKEN_PATH", str(Path(__file__).parent / "token.json")))
    parser.add_argument("--interval", type=int, default=int(os.getenv("POLL_INTERVAL_SECONDS", "120")))
    parser.add_argument("--dry-run", action="store_true", default=DRY_RUN)
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    if args.dry_run:
        os.environ["DRY_RUN"] = "true"
        print("[DRY RUN MODE] No files will be written.")

    watcher = GmailWatcher(
        vault_path=args.vault,
        credentials_path=args.credentials,
        token_path=args.token,
        check_interval=args.interval,
    )
    watcher.run()
