"""HITL persistence — dual-store memory + structured event log.

Public API re-exported for tidy imports:

    from memory import MemoryManager, log_event

Internal modules:
    • store  — SQLite (lessons, runs, approved grades) + ChromaDB (semantic)
    • logger — Append-only JSONL audit trail (``data/hitl_events.jsonl``)
"""

from .logger import log_event
from .store import MemoryManager

__all__ = ["MemoryManager", "log_event"]
