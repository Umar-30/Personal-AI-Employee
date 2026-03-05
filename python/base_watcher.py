"""
base_watcher.py — BaseWatcher pattern for the Personal AI Employee.

Python bridge layer that feeds events into the TypeScript vault pipeline
by dropping structured .md files into the /Inbox folder.

All concrete watchers extend this class and implement:
  - check_for_updates() -> list
  - create_action_file(item) -> Path
"""

import time
import logging
import json
from pathlib import Path
from abc import ABC, abstractmethod
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)


class BaseWatcher(ABC):
    """
    Abstract base for all Python watchers.

    Each watcher polls an external source and writes .md task files
    into the vault /Inbox folder. The TypeScript daemon picks them up
    from there and drives the full Perception → Reasoning → Action loop.
    """

    def __init__(self, vault_path: str, check_interval: int = 60):
        self.vault_path = Path(vault_path)
        self.inbox = self.vault_path / "Inbox"
        self.needs_action = self.vault_path / "Needs_Action"
        self.logs = self.vault_path / "Logs"
        self.check_interval = check_interval
        self.logger = logging.getLogger(self.__class__.__name__)
        self._ensure_folders()

    def _ensure_folders(self):
        """Create required vault folders if they don't exist."""
        for folder in [self.inbox, self.needs_action, self.logs]:
            folder.mkdir(parents=True, exist_ok=True)

    @abstractmethod
    def check_for_updates(self) -> list:
        """Return list of new items to process."""
        pass

    @abstractmethod
    def create_action_file(self, item) -> Path:
        """Write a .md file into /Inbox and return its path."""
        pass

    def _write_audit_log(self, action_type: str, file_path: Path, meta: dict = None):
        """Append a structured audit entry to today's log file."""
        log_file = self.logs / f"{datetime.now().strftime('%Y-%m-%d')}.jsonl"
        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "action_type": action_type,
            "actor": f"python/{self.__class__.__name__}",
            "file": str(file_path),
            **(meta or {}),
        }
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")

    def run(self):
        """Main loop: poll → create task files → sleep → repeat."""
        self.logger.info(f"Starting — vault={self.vault_path}, interval={self.check_interval}s")
        while True:
            try:
                items = self.check_for_updates()
                for item in items:
                    path = self.create_action_file(item)
                    self._write_audit_log("task_created", path)
                    self.logger.info(f"Task file created: {path.name}")
            except KeyboardInterrupt:
                self.logger.info("Stopped by user.")
                break
            except Exception as e:
                self.logger.error(f"Error: {e}", exc_info=True)
            time.sleep(self.check_interval)
