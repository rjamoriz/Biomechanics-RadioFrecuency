"""Local persistence helpers for RL audit logs and bandit snapshots."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .contextual_bandit import ContextualBanditPolicy
from .logging import RecommendationAuditLogger, RecommendationAuditRecord


class RecommendationAuditLogStore:
    def __init__(self, file_path: str | Path) -> None:
        self.file_path = Path(file_path)

    def append(
        self,
        record: RecommendationAuditRecord,
        logger: RecommendationAuditLogger | None = None,
    ) -> Path:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        payload = (logger or RecommendationAuditLogger()).to_log_payload(record)
        with self.file_path.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(payload, sort_keys=True))
            handle.write("\n")
        return self.file_path

    def read_all(self) -> list[dict[str, Any]]:
        if not self.file_path.exists():
            return []
        with self.file_path.open(encoding='utf-8') as handle:
            return [
                json.loads(line)
                for line in handle
                if line.strip()
            ]


class ContextualBanditSnapshotStore:
    def __init__(self, file_path: str | Path) -> None:
        self.file_path = Path(file_path)

    def save(self, policy: ContextualBanditPolicy) -> Path:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        snapshot = policy.to_snapshot()
        self.file_path.write_text(
            json.dumps(snapshot, indent=2, sort_keys=True),
            encoding='utf-8',
        )
        return self.file_path

    def load(self) -> ContextualBanditPolicy:
        snapshot = self.read_snapshot()
        return ContextualBanditPolicy.from_snapshot(snapshot)

    def read_snapshot(self) -> dict[str, Any]:
        if not self.file_path.exists():
            raise FileNotFoundError(self.file_path)
        return json.loads(self.file_path.read_text(encoding='utf-8'))
