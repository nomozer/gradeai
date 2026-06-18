"""HITL persistence — dual-store memory + structured event log.

Public API re-exported for tidy imports:

    from memory import MemoryManager, log_event

Internal modules:
    • store  — SQLite (lessons, runs, approved grades) + ChromaDB (semantic)
    • logger — Append-only JSONL audit trail (``data/hitl_events.jsonl``)
"""

from .logger import log_event
from .store import MemoryManager, QUOTA_PERIOD_DAYS

__all__ = ["MemoryManager", "QUOTA_PERIOD_DAYS", "log_event"]
