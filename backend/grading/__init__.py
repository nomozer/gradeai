"""Grading domain — orchestrator + VLM + file processing + prompt assembly.

Public API re-exported here for tidy imports from ``main.py``:

    from grading import AgentOrchestrator, PromptOrchestrator, looks_like_timeout

Internal modules:
    • agent              — AgentOrchestrator + PipelineResult (pipeline entry)
    • vlm_client         — GeminiClient + retry + model rotation
    • file_processor     — Image/PDF decode + compress + rasterize
    • grade_parser       — JSON parse + comment-analysis fallback
    • prompt_orchestrator — Subject-aware prompt assembly + lesson injection
"""

from .agent import AgentOrchestrator, PipelineResult, looks_like_timeout
from .prompt_orchestrator import PromptOrchestrator

__all__ = [
    "AgentOrchestrator",
    "PipelineResult",
    "PromptOrchestrator",
    "looks_like_timeout",
]
