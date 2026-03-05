"""
filesystem_watcher.py — Drop-folder watcher (Bronze-tier Python bridge).

Monitors a designated drop folder for new files and converts each one
into a structured .md task file in the vault /Inbox.

The TypeScript InboxWatcher then picks up the task and drives the full
Perception → Reasoning → Action pipeline.

Usage:
    python filesystem_watcher.py [--vault PATH] [--drop PATH] [--interval SECONDS] [--dry-run]

Defaults (override via .env or CLI flags):
    VAULT_PATH   = ../  (project root)
    DROP_FOLDER  = ./drop/
    INTERVAL     = 30 seconds
    DRY_RUN      = false
"""

import os
import shutil
import argparse
from pathlib import Path
from datetime import datetime

from base_watcher import BaseWatcher

DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"


class DropFolderWatcher(BaseWatcher):
    """
    Watches a local drop folder for new files.

    Any file placed in the drop folder is:
      1. Copied to the vault /Inbox as a .md task file
      2. Logged to /Logs/YYYY-MM-DD.jsonl
      3. Moved to a /processed sub-folder inside the drop dir
    """

    def __init__(self, vault_path: str, drop_folder: str, check_interval: int = 30):
        super().__init__(vault_path, check_interval)
        self.drop_folder = Path(drop_folder)
        self.processed = self.drop_folder / "processed"
        self.drop_folder.mkdir(parents=True, exist_ok=True)
        self.processed.mkdir(parents=True, exist_ok=True)
        self._seen: set[str] = set()

    def check_for_updates(self) -> list:
        """Return new files in the drop folder (skip already-processed)."""
        new_files = []
        for f in self.drop_folder.iterdir():
            if f.is_file() and f.name not in self._seen:
                new_files.append(f)
                self._seen.add(f.name)
        return new_files

    def create_action_file(self, source: Path) -> Path:
        """
        Write a structured .md task file to /Inbox.
        File name: FILE_<timestamp>_<original_name>.md
        """
        ts = datetime.now().strftime("%Y%m%dT%H%M%S")
        safe_name = source.stem.replace(" ", "_")
        dest_name = f"FILE_{ts}_{safe_name}.md"
        dest = self.inbox / dest_name

        content = f"""---
type: file_drop
source: python/filesystem_watcher
original_name: {source.name}
size_bytes: {source.stat().st_size}
received: {datetime.now().isoformat()}
priority: normal
status: pending
---

## File Drop Task

A new file was dropped for processing.

**Original file:** `{source.name}`
**Size:** {source.stat().st_size:,} bytes

## Suggested Actions
- [ ] Inspect file contents
- [ ] Route to relevant workflow
- [ ] Archive after processing
"""

        if DRY_RUN:
            self.logger.info(f"[DRY RUN] Would create: {dest}")
        else:
            dest.write_text(content, encoding="utf-8")
            # Move original to /processed to avoid re-processing
            shutil.move(str(source), str(self.processed / source.name))

        return dest


def _parse_args():
    parser = argparse.ArgumentParser(description="AI Employee — Drop-folder Watcher (Python bridge)")
    parser.add_argument("--vault", default=os.getenv("VAULT_PATH", str(Path(__file__).parent.parent)))
    parser.add_argument("--drop", default=os.getenv("DROP_FOLDER", str(Path(__file__).parent / "drop")))
    parser.add_argument("--interval", type=int, default=int(os.getenv("POLL_INTERVAL_SECONDS", "30")))
    parser.add_argument("--dry-run", action="store_true", default=DRY_RUN)
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    if args.dry_run:
        os.environ["DRY_RUN"] = "true"
        print("[DRY RUN MODE] No files will be written.")

    watcher = DropFolderWatcher(
        vault_path=args.vault,
        drop_folder=args.drop,
        check_interval=args.interval,
    )
    watcher.run()
